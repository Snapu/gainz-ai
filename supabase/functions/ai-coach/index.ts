import { extractBearerToken, verifyGoogleCaller } from "../_shared/auth.ts";
import { COACHING_MODELS, generateWithFallback, streamWithFallback } from "../_shared/gemini.ts";
import {
  corsHeaders,
  corsPreflightResponse,
  DEFAULT_GOOGLE_CLIENT_ID,
  getDenoRuntime,
  getEnv,
  jsonResponse,
  MAX_REQUEST_BODY_BYTES,
  parsePositiveIntEnv,
  readJsonBodyWithLimit,
} from "../_shared/http.ts";
import {
  consumeQuota,
  deriveUsageDateFromResetAt,
  formatQuotaPayload,
  type QuotaRow,
  refundQuota,
} from "../_shared/quota.ts";
import { executeClassifyAction } from "./classify.ts";
import { postProcessCoachingAdvice } from "./postProcess.ts";
import {
  assembleCoachingPrompt,
  buildBoundedConversationContents,
  buildSystemInstruction,
  shouldAllowPlanUpdate,
} from "./prompt.ts";
import {
  type AiRequestResultRow,
  type AiRequestResultsStore,
  createSupabaseRequestResultsStore,
} from "./requestResults.ts";
import {
  type AiCoachRequestDto,
  aiCoachRequestDtoSchema,
  type CoachActionRequestDto,
  createCoachingAdviceJsonSchema,
  extractCoachMessageSoFar,
  parseCoachingAdviceResponse,
} from "./schemas.ts";

const DEFAULT_DAILY_COACH_LIMIT = 15;
const DEFAULT_DAILY_CLASSIFY_LIMIT = 50;

const SSE_RESPONSE_HEADERS: Record<string, string> = {
  ...corsHeaders,
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  "X-Content-Type-Options": "nosniff",
};

export interface AiCoachServerConfig {
  clientId: string;
  geminiApiKey: string;
  supabaseUrl: string;
  serviceRoleKey: string;
}

export interface AiCoachHandlerDeps {
  getConfig?: () => AiCoachServerConfig | null;
  verifyCaller?: typeof verifyGoogleCaller;
  consumeQuota?: typeof consumeQuota;
  refundQuota?: typeof refundQuota;
  generateWithFallback?: typeof generateWithFallback;
  streamWithFallback?: typeof streamWithFallback;
  waitUntil?: (promise: Promise<unknown>) => void;
  requestResults?: AiRequestResultsStore;
}

function defaultWaitUntil(promise: Promise<unknown>): void {
  (
    globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }
  ).EdgeRuntime?.waitUntil?.(promise);
}

function loadServerConfig(): AiCoachServerConfig | null {
  const clientId = (getEnv("GOOGLE_CLIENT_ID") ?? "").trim() || DEFAULT_GOOGLE_CLIENT_ID;
  const geminiApiKey = getEnv("GEMINI_API_KEY");
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!geminiApiKey || !supabaseUrl || !serviceRoleKey) return null;
  return { clientId, geminiApiKey, supabaseUrl, serviceRoleKey };
}

async function executeCoachAction(
  dto: CoachActionRequestDto,
  geminiApiKey: string,
  quota: QuotaRow,
  streamFn: typeof streamWithFallback,
  onAccumulatedText?: (accumulatedText: string) => boolean | undefined,
) {
  const allowPlanUpdate = shouldAllowPlanUpdate(dto.mode, dto.question);
  const thinkingLevel = dto.mode === "planning" ? "medium" : "low";
  const isPlanningTimeout =
    dto.mode === "planning" || dto.previousMessages.length === 0 || dto.workoutPhase === "planning";
  const timeoutMs = isPlanningTimeout ? 55_000 : 40_000;
  const prompt = assembleCoachingPrompt(dto);
  const contents = buildBoundedConversationContents(dto.previousMessages, prompt);

  const result = await streamFn({
    geminiApiKey,
    models: COACHING_MODELS,
    contents,
    systemInstruction: buildSystemInstruction(dto.mode),
    responseJsonSchema: createCoachingAdviceJsonSchema(dto.muscleGroups, dto.mode, allowPlanUpdate),
    temperature: 0.7,
    topP: 0.9,
    thinkingConfig: { level: thinkingLevel, includeThoughts: false },
    timeoutMs,
    parseResponse: (parsedJson) => parseCoachingAdviceResponse(parsedJson, dto.mode),
    onAccumulatedText,
  });

  const completedSessionKeys =
    dto.mode === "planning" ? new Set<string>() : new Set(dto.completedSessionKeys ?? []);

  const advice = postProcessCoachingAdvice(
    result.data,
    dto.workoutPhase,
    dto.insights.deloadStatus,
    completedSessionKeys,
    dto.activePlan,
  );

  return {
    advice,
    quota: formatQuotaPayload(quota),
  };
}

function createCoachStreamResponse(params: {
  dto: CoachActionRequestDto;
  userId: string;
  clientRequestId?: string;
  config: AiCoachServerConfig;
  quota: QuotaRow;
  quotaUsageDate: string | undefined;
  deps: Pick<
    Required<AiCoachHandlerDeps>,
    "refundQuota" | "streamWithFallback" | "requestResults" | "waitUntil"
  >;
}): Response {
  const { dto, userId, clientRequestId, config, quota, quotaUsageDate, deps } = params;
  const encoder = new TextEncoder();
  let streamClosedOrCancelled = false;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: "preview" | "complete" | "error", data: unknown): boolean => {
        if (streamClosedOrCancelled) return false;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          return true;
        } catch {
          streamClosedOrCancelled = true;
          return false;
        }
      };

      const close = () => {
        if (streamClosedOrCancelled) return;
        streamClosedOrCancelled = true;
        try {
          controller.close();
        } catch {
          // Stream already closed or cancelled by client
        }
      };

      const work = (async () => {
        let lastPreview = "";
        try {
          const payload = await executeCoachAction(
            dto,
            config.geminiApiKey,
            quota,
            deps.streamWithFallback,
            (accumulatedText) => {
              const preview = extractCoachMessageSoFar(accumulatedText);
              if (
                !preview ||
                (!lastPreview && !preview.trim()) ||
                preview.length <= lastPreview.length
              ) {
                return false;
              }
              lastPreview = preview;
              return emit("preview", { text: preview });
            },
          );
          if (clientRequestId) {
            await deps.requestResults.markCompleted(userId, clientRequestId, payload);
          }
          emit("complete", payload);
        } catch (err) {
          const errorName = err instanceof Error ? err.name : "UnknownError";
          console.error("AI execution failed:", { action: dto.action, errorName });
          await deps.refundQuota(
            config.supabaseUrl,
            config.serviceRoleKey,
            userId,
            dto.action,
            quotaUsageDate,
          );
          if (clientRequestId) {
            await deps.requestResults.markFailed(
              userId,
              clientRequestId,
              "coaching-request-failed",
            );
          }
          emit("error", { error: "coaching-request-failed" });
        } finally {
          close();
        }
      })();

      deps.waitUntil(work);
    },
    cancel() {
      streamClosedOrCancelled = true;
    },
  });

  return new Response(body, { status: 200, headers: SSE_RESPONSE_HEADERS });
}

function existingCoachEntryToResponse(row: AiRequestResultRow): Response {
  if (row.status === "completed") {
    return jsonResponse(row.response_payload, 200);
  }
  if (row.status === "processing") {
    return jsonResponse({ status: "processing" }, 202);
  }
  return jsonResponse(
    { status: "failed", error: row.error_code ?? "coaching-request-failed" },
    502,
  );
}

async function handleRecoverAction(
  userId: string,
  clientRequestId: string,
  requestResults: AiRequestResultsStore,
): Promise<Response> {
  // Atomically claim & delete terminal outcomes (DELETE ... RETURNING) so concurrent polls never duplicate delivery
  let claimed = await requestResults.claimTerminalResult(userId, clientRequestId);
  if (claimed === "error") {
    return jsonResponse({ error: "recovery-check-failed" }, 503);
  }
  if (!claimed) {
    const existing = await requestResults.getActive(userId, clientRequestId);
    if (existing === "error") {
      return jsonResponse({ error: "recovery-check-failed" }, 503);
    }
    if (!existing) {
      return jsonResponse({ error: "not-found" }, 404);
    }
    if (existing.status === "processing") {
      return jsonResponse({ status: "processing" }, 202);
    }
    claimed = await requestResults.claimTerminalResult(userId, clientRequestId);
    if (claimed === "error") {
      return jsonResponse({ error: "recovery-check-failed" }, 503);
    }
    if (!claimed) {
      return jsonResponse({ error: "not-found" }, 404);
    }
  }

  if (claimed.status === "completed") {
    const payload =
      claimed.response_payload && typeof claimed.response_payload === "object"
        ? (claimed.response_payload as Record<string, unknown>)
        : {};
    return jsonResponse({ status: "completed", ...payload }, 200);
  }

  return jsonResponse(
    { status: "failed", error: claimed.error_code ?? "coaching-request-failed" },
    502,
  );
}

async function executeClassifyWithRefund(
  dto: Extract<AiCoachRequestDto, { action: "classify" }>,
  userId: string,
  config: AiCoachServerConfig,
  quota: QuotaRow,
  quotaUsageDate: string | undefined,
  deps: Pick<Required<AiCoachHandlerDeps>, "refundQuota" | "generateWithFallback">,
): Promise<Response> {
  try {
    return await executeClassifyAction(dto, config.geminiApiKey, quota, deps.generateWithFallback);
  } catch (err) {
    const errorName = err instanceof Error ? err.name : "UnknownError";
    console.error("AI execution failed:", { action: dto.action, errorName });
    await deps.refundQuota(
      config.supabaseUrl,
      config.serviceRoleKey,
      userId,
      dto.action,
      quotaUsageDate,
    );
    return jsonResponse({ error: "coaching-request-failed" }, 502);
  }
}

async function tryAcquireProcessingLock(
  userId: string,
  clientRequestId: string,
  requestResults: AiRequestResultsStore,
): Promise<Response | null> {
  const lockResult = await requestResults.acquireProcessingLock(userId, clientRequestId);
  if (lockResult === "acquired") return null;
  if (lockResult === "conflict") {
    const existing = await requestResults.getActive(userId, clientRequestId);
    if (existing === "error") {
      return jsonResponse({ error: "quota-check-failed" }, 500);
    }
    return existing
      ? existingCoachEntryToResponse(existing)
      : jsonResponse({ error: "coaching-request-failed" }, 502);
  }
  return jsonResponse({ error: "quota-check-failed" }, 500);
}

async function consumeQuotaOrErrorResponse(
  dto: Exclude<AiCoachRequestDto, { action: "recover" }>,
  userId: string,
  clientRequestId: string | undefined,
  config: AiCoachServerConfig,
  deps: Pick<Required<AiCoachHandlerDeps>, "consumeQuota" | "requestResults">,
): Promise<{ quota: QuotaRow } | { response: Response }> {
  const dailyLimit =
    dto.action === "coach"
      ? parsePositiveIntEnv("AI_DAILY_COACH_LIMIT", DEFAULT_DAILY_COACH_LIMIT)
      : parsePositiveIntEnv("AI_DAILY_CLASSIFY_LIMIT", DEFAULT_DAILY_CLASSIFY_LIMIT);

  const quota = await deps.consumeQuota(
    config.supabaseUrl,
    config.serviceRoleKey,
    userId,
    dto.action,
    dailyLimit,
  );

  if (!quota) {
    if (clientRequestId) {
      await deps.requestResults.deleteEntry(userId, clientRequestId);
    }
    return { response: jsonResponse({ error: "quota-check-failed" }, 500) };
  }

  if (!quota.allowed) {
    if (clientRequestId) {
      await deps.requestResults.deleteEntry(userId, clientRequestId);
    }
    if (quota.global_capped) {
      console.warn(`Global daily AI quota ceiling reached for action: ${dto.action}`);
    }
    return {
      response: jsonResponse(
        {
          error: "rate-limit-exceeded",
          quota: formatQuotaPayload(quota),
        },
        429,
      ),
    };
  }

  return { quota };
}

async function handleVerifiedCoachRequest(
  dto: AiCoachRequestDto,
  userId: string,
  config: AiCoachServerConfig,
  deps: Required<
    Pick<
      AiCoachHandlerDeps,
      | "consumeQuota"
      | "refundQuota"
      | "generateWithFallback"
      | "streamWithFallback"
      | "waitUntil"
      | "requestResults"
    >
  >,
): Promise<Response> {
  if (dto.action === "recover") {
    return handleRecoverAction(userId, dto.clientRequestId, deps.requestResults);
  }

  if (dto.action === "classify" && dto.exerciseNames.length === 0) {
    return jsonResponse({ text: JSON.stringify({ classifications: [] }) });
  }

  const clientRequestId = dto.action === "coach" ? dto.clientRequestId : undefined;
  if (clientRequestId) {
    const lockErrorResponse = await tryAcquireProcessingLock(
      userId,
      clientRequestId,
      deps.requestResults,
    );
    if (lockErrorResponse) return lockErrorResponse;
  }

  const quotaOutcome = await consumeQuotaOrErrorResponse(
    dto,
    userId,
    clientRequestId,
    config,
    deps,
  );
  if ("response" in quotaOutcome) {
    return quotaOutcome.response;
  }

  const quotaUsageDate = deriveUsageDateFromResetAt(quotaOutcome.quota.reset_at);

  if (dto.action === "classify") {
    return executeClassifyWithRefund(dto, userId, config, quotaOutcome.quota, quotaUsageDate, deps);
  }

  return createCoachStreamResponse({
    dto,
    userId,
    clientRequestId,
    config,
    quota: quotaOutcome.quota,
    quotaUsageDate,
    deps,
  });
}

export async function handleAiCoachRequest(
  req: Request,
  deps: AiCoachHandlerDeps = {},
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method-not-allowed" }, 405);
  }

  const callerToken = extractBearerToken(req);
  if (!callerToken) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const config = (deps.getConfig ?? loadServerConfig)();
  if (!config) {
    return jsonResponse({ error: "missing-server-config" }, 500);
  }

  const verifyCaller = deps.verifyCaller ?? verifyGoogleCaller;
  const verifiedUser = await verifyCaller(callerToken, config.clientId);
  if (!verifiedUser) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const bodyResult = await readJsonBodyWithLimit(req, MAX_REQUEST_BODY_BYTES);
  if (!bodyResult.ok) {
    return jsonResponse({ error: bodyResult.error }, bodyResult.status);
  }

  const parsedDto = aiCoachRequestDtoSchema.safeParse(bodyResult.data);
  if (!parsedDto.success) {
    return jsonResponse({ error: "invalid-request" }, 400);
  }

  return handleVerifiedCoachRequest(parsedDto.data, verifiedUser.userId, config, {
    consumeQuota: deps.consumeQuota ?? consumeQuota,
    refundQuota: deps.refundQuota ?? refundQuota,
    generateWithFallback: deps.generateWithFallback ?? generateWithFallback,
    streamWithFallback: deps.streamWithFallback ?? streamWithFallback,
    waitUntil: deps.waitUntil ?? defaultWaitUntil,
    requestResults:
      deps.requestResults ??
      createSupabaseRequestResultsStore(config.supabaseUrl, config.serviceRoleKey),
  });
}

getDenoRuntime()?.serve((req: Request) => handleAiCoachRequest(req));
