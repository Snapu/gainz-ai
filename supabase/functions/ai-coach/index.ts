import { extractBearerToken, verifyGoogleCaller } from "../_shared/auth.ts";
import { formatEntitlementPayload } from "../_shared/entitlement.ts";
import {
  type AttemptTokenUsage,
  COACHING_MODELS,
  generateWithFallback,
  streamWithFallback,
} from "../_shared/gemini.ts";
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
  type AuthorizeAiRequestRow,
  authorizeAiRequest,
  deriveUsageDateFromResetAt,
  formatQuotaPayload,
  refundQuota,
} from "../_shared/quota.ts";
import { deriveSubjectDigests, loadAbusePreventionPeppers } from "../_shared/subjectDigest.ts";
import {
  type EntitlementSource,
  parseDailyCostCapUsdMicros,
  recordTokenUsage,
  type TokenRequestKind,
} from "../_shared/tokenCost.ts";
import { executeClassifyAction } from "./classify.ts";
import { postProcessCoachingAdvice } from "./postProcess.ts";
import {
  assembleCoachingPrompt,
  buildBoundedConversationContents,
  buildSystemInstruction,
  deriveCoachRequestKind,
  shouldAllowPlanUpdate,
} from "./prompt.ts";
import {
  type AiRequestResultRow,
  type AiRequestResultsStore,
  type AiRequestResultWriteResult,
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
const DEFAULT_FREE_DAILY_COACH_LIMIT = 5;
const DEFAULT_FREE_DAILY_CLASSIFY_LIMIT = 20;

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
  abusePreventionPepper: string;
  abusePreventionPepperPrevious: string | null;
  dailyCostCapUsdMicros?: number;
}

export interface AiCoachHandlerDeps {
  getConfig?: () => AiCoachServerConfig | null;
  verifyCaller?: typeof verifyGoogleCaller;
  authorizeAiRequest?: typeof authorizeAiRequest;
  refundQuota?: typeof refundQuota;
  recordTokenUsage?: typeof recordTokenUsage;
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
  const peppers = loadAbusePreventionPeppers(getEnv);
  if (!geminiApiKey || !supabaseUrl || !serviceRoleKey || !peppers) return null;
  return {
    clientId,
    geminiApiKey,
    supabaseUrl,
    serviceRoleKey,
    abusePreventionPepper: peppers.current,
    abusePreventionPepperPrevious: peppers.previous,
    dailyCostCapUsdMicros: parseDailyCostCapUsdMicros(getEnv("AI_DAILY_COST_CAP_USD")),
  };
}

async function executeCoachAction(
  dto: CoachActionRequestDto,
  geminiApiKey: string,
  authRow: AuthorizeAiRequestRow,
  streamFn: typeof streamWithFallback,
  onAccumulatedText?: (accumulatedText: string) => boolean | undefined,
  onAttemptUsage?: (usage: AttemptTokenUsage) => void,
) {
  const allowPlanUpdate = shouldAllowPlanUpdate(dto.mode, dto.question);
  const thinkingLevel = dto.mode === "planning" ? "medium" : "low";
  const maxOutputTokens = dto.mode === "planning" || allowPlanUpdate ? 8192 : 4096;
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
    maxOutputTokens,
    timeoutMs,
    parseResponse: (parsedJson) => parseCoachingAdviceResponse(parsedJson, dto.mode),
    onAccumulatedText,
    onAttemptUsage,
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
    quota: formatQuotaPayload(authRow),
    entitlement: formatEntitlementPayload(authRow),
  };
}

function extractErrorName(err: unknown): string {
  if (err && typeof err === "object" && "name" in err && typeof err.name === "string" && err.name) {
    return err.name;
  }
  return "UnknownError";
}

function logRequestResultWriteFailure(
  message: string,
  action: CoachActionRequestDto["action"],
  result: Exclude<AiRequestResultWriteResult, { ok: true }>,
): void {
  console.error(message, {
    action,
    error: result.error,
    ...(result.error === "http-error" ? { status: result.status } : {}),
    ...(result.error === "request-error" ? { errorName: result.errorName } : {}),
  });
}

function createPreviewEmitter(
  emit: (event: "preview" | "complete" | "error", data: unknown) => boolean,
): (accumulatedText: string) => boolean {
  let lastPreview = "";
  return (accumulatedText) => {
    const preview = extractCoachMessageSoFar(accumulatedText);
    if (!preview || (!lastPreview && !preview.trim()) || preview.length <= lastPreview.length) {
      return false;
    }
    lastPreview = preview;
    return emit("preview", { text: preview });
  };
}

async function persistCoachCompletion(params: {
  requestResults: AiRequestResultsStore;
  userId: string;
  clientRequestId: string | undefined;
  action: CoachActionRequestDto["action"];
  payload: unknown;
}): Promise<AiRequestResultWriteResult> {
  if (!params.clientRequestId) return { ok: true };
  try {
    const persisted = await params.requestResults.markCompleted(
      params.userId,
      params.clientRequestId,
      params.payload,
    );
    if (!persisted.ok) {
      logRequestResultWriteFailure("AI result persistence failed:", params.action, persisted);
    }
    return persisted;
  } catch (err) {
    const failed: AiRequestResultWriteResult = {
      ok: false,
      error: "request-error",
      errorName: extractErrorName(err),
    };
    logRequestResultWriteFailure("AI result persistence failed:", params.action, failed);
    return failed;
  }
}

async function settleCoachFailure(params: {
  dto: CoachActionRequestDto;
  userId: string;
  subjectDigest: string;
  refundFreeAllowance: boolean;
  clientRequestId?: string;
  config: AiCoachServerConfig;
  quotaUsageDate: string | undefined;
  deps: Pick<Required<AiCoachHandlerDeps>, "refundQuota" | "requestResults">;
  skipMarkFailed: boolean;
}): Promise<void> {
  const {
    dto,
    userId,
    subjectDigest,
    refundFreeAllowance,
    clientRequestId,
    config,
    quotaUsageDate,
    deps,
    skipMarkFailed,
  } = params;

  // Gate refund on an atomic processing -> failed transition when clientRequestId exists so a request
  // cannot be refunded more than once across races or retries.
  let shouldRefund = true;
  if (clientRequestId && !skipMarkFailed) {
    try {
      const failedResult = await deps.requestResults.markFailed(
        userId,
        clientRequestId,
        "coaching-request-failed",
      );
      if (!failedResult.ok) {
        logRequestResultWriteFailure(
          "AI failure status persistence failed:",
          dto.action,
          failedResult,
        );
        if (failedResult.error === "not-found") {
          shouldRefund = false;
        }
      }
    } catch (err) {
      logRequestResultWriteFailure("AI failure status persistence failed:", dto.action, {
        ok: false,
        error: "request-error",
        errorName: extractErrorName(err),
      });
    }
  }

  if (!shouldRefund) return;

  try {
    await deps.refundQuota(config.supabaseUrl, config.serviceRoleKey, {
      userId,
      kind: dto.action,
      usageDate: quotaUsageDate,
      subjectDigest,
      refundFreeAllowance,
    });
  } catch (err) {
    console.error("Quota refund failed unexpectedly:", {
      action: dto.action,
      errorName: extractErrorName(err),
    });
  }
}

async function persistAttemptTokenUsages(params: {
  attempts: readonly AttemptTokenUsage[];
  userId: string;
  usageDate: string | undefined;
  requestKind: TokenRequestKind;
  entitlementSource: EntitlementSource;
  config: AiCoachServerConfig;
  recordTokenUsage: typeof recordTokenUsage;
}): Promise<void> {
  if (params.attempts.length === 0) return;
  const resolvedUsageDate = params.usageDate ?? new Date().toISOString().slice(0, 10);
  await Promise.allSettled(
    params.attempts.map((attempt) =>
      params.recordTokenUsage(params.config.supabaseUrl, params.config.serviceRoleKey, {
        actorKey: params.userId,
        usageDate: resolvedUsageDate,
        model: attempt.model,
        requestKind: params.requestKind,
        entitlementSource: params.entitlementSource,
        unmeasured: attempt.unmeasured,
        promptTokens: attempt.promptTokens,
        cachedTokens: attempt.cachedTokens,
        outputTokens: attempt.outputTokens,
        thinkingTokens: attempt.thinkingTokens,
      }),
    ),
  );
}

function createCoachStreamResponse(params: {
  dto: CoachActionRequestDto;
  userId: string;
  subjectDigest: string;
  clientRequestId?: string;
  config: AiCoachServerConfig;
  authRow: AuthorizeAiRequestRow;
  quotaUsageDate: string | undefined;
  deps: Pick<
    Required<AiCoachHandlerDeps>,
    "refundQuota" | "recordTokenUsage" | "streamWithFallback" | "requestResults" | "waitUntil"
  >;
}): Response {
  const { dto, userId, subjectDigest, clientRequestId, config, authRow, quotaUsageDate, deps } =
    params;
  const refundFreeAllowance = authRow.admitted_source === "free_allowance";
  const requestKind = deriveCoachRequestKind(dto);
  const entitlementSource = authRow.admitted_source ?? authRow.entitlement_source;
  const attemptUsages: AttemptTokenUsage[] = [];
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

      const failRequest = async (skipMarkFailed = false) => {
        await settleCoachFailure({
          dto,
          userId,
          subjectDigest,
          refundFreeAllowance,
          clientRequestId,
          config,
          quotaUsageDate,
          deps,
          skipMarkFailed,
        });
        emit("error", { error: "coaching-request-failed" });
      };

      const work = (async () => {
        try {
          let payload: Awaited<ReturnType<typeof executeCoachAction>>;
          try {
            payload = await executeCoachAction(
              dto,
              config.geminiApiKey,
              authRow,
              deps.streamWithFallback,
              createPreviewEmitter(emit),
              (usage) => {
                attemptUsages.push(usage);
              },
            );
          } catch (err) {
            const errorName = extractErrorName(err);
            console.error("AI execution failed:", { action: dto.action, errorName });
            await failRequest();
            return;
          }

          const persistence = await persistCoachCompletion({
            requestResults: deps.requestResults,
            userId,
            clientRequestId,
            action: dto.action,
            payload,
          });
          if (!persistence.ok) {
            await failRequest(persistence.error === "not-found");
            return;
          }
          emit("complete", payload);
        } finally {
          close();
          await persistAttemptTokenUsages({
            attempts: attemptUsages,
            userId,
            usageDate: quotaUsageDate,
            requestKind,
            entitlementSource,
            config,
            recordTokenUsage: deps.recordTokenUsage,
          });
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
  subjectDigest: string,
  config: AiCoachServerConfig,
  authRow: AuthorizeAiRequestRow,
  quotaUsageDate: string | undefined,
  deps: Pick<
    Required<AiCoachHandlerDeps>,
    "refundQuota" | "recordTokenUsage" | "generateWithFallback" | "waitUntil"
  >,
): Promise<Response> {
  const attemptUsages: AttemptTokenUsage[] = [];
  const entitlementSource = authRow.admitted_source ?? authRow.entitlement_source;
  try {
    return await executeClassifyAction(
      dto,
      config.geminiApiKey,
      authRow,
      deps.generateWithFallback,
      (usage) => {
        attemptUsages.push(usage);
      },
    );
  } catch (err) {
    const errorName = err instanceof Error ? err.name : "UnknownError";
    console.error("AI execution failed:", { action: dto.action, errorName });
    await deps.refundQuota(config.supabaseUrl, config.serviceRoleKey, {
      userId,
      kind: dto.action,
      usageDate: quotaUsageDate,
      subjectDigest,
      refundFreeAllowance: authRow.admitted_source === "free_allowance",
    });
    return jsonResponse({ error: "coaching-request-failed" }, 502);
  } finally {
    deps.waitUntil(
      persistAttemptTokenUsages({
        attempts: attemptUsages,
        userId,
        usageDate: quotaUsageDate,
        requestKind: "classify",
        entitlementSource,
        config,
        recordTokenUsage: deps.recordTokenUsage,
      }),
    );
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

async function authorizeOrErrorResponse(
  dto: Exclude<AiCoachRequestDto, { action: "recover" }>,
  userId: string,
  subjectDigests: { subjectDigest: string; previousSubjectDigest: string | null },
  clientRequestId: string | undefined,
  config: AiCoachServerConfig,
  deps: Pick<Required<AiCoachHandlerDeps>, "authorizeAiRequest" | "requestResults">,
): Promise<{ authRow: AuthorizeAiRequestRow } | { response: Response }> {
  const paidDailyLimit =
    dto.action === "coach"
      ? parsePositiveIntEnv("AI_DAILY_COACH_LIMIT", DEFAULT_DAILY_COACH_LIMIT)
      : parsePositiveIntEnv("AI_DAILY_CLASSIFY_LIMIT", DEFAULT_DAILY_CLASSIFY_LIMIT);
  const freeDailyLimit =
    dto.action === "coach"
      ? parsePositiveIntEnv("AI_FREE_DAILY_COACH_LIMIT", DEFAULT_FREE_DAILY_COACH_LIMIT)
      : parsePositiveIntEnv("AI_FREE_DAILY_CLASSIFY_LIMIT", DEFAULT_FREE_DAILY_CLASSIFY_LIMIT);
  const globalCostCapUsdMicros =
    config.dailyCostCapUsdMicros ?? parseDailyCostCapUsdMicros(getEnv("AI_DAILY_COST_CAP_USD"));

  const authRow = await deps.authorizeAiRequest(config.supabaseUrl, config.serviceRoleKey, {
    userId,
    subjectDigest: subjectDigests.subjectDigest,
    previousSubjectDigest: subjectDigests.previousSubjectDigest,
    kind: dto.action,
    paidDailyLimit,
    freeDailyLimit,
    globalCostCapUsdMicros,
  });

  if (!authRow) {
    if (clientRequestId) {
      await deps.requestResults.deleteEntry(userId, clientRequestId);
    }
    return { response: jsonResponse({ error: "quota-check-failed" }, 500) };
  }

  if (!authRow.allowed) {
    if (clientRequestId) {
      await deps.requestResults.deleteEntry(userId, clientRequestId);
    }
    if (!authRow.global_capped && authRow.denial_reason === "payment-required") {
      return {
        response: jsonResponse(
          {
            error: "payment-required",
            entitlement: formatEntitlementPayload(authRow),
          },
          402,
        ),
      };
    }
    if (authRow.global_capped) {
      console.warn(`Global daily AI quota ceiling reached for action: ${dto.action}`);
    }
    return {
      response: jsonResponse(
        {
          error: "rate-limit-exceeded",
          quota: formatQuotaPayload(authRow),
          entitlement: formatEntitlementPayload(authRow),
        },
        429,
      ),
    };
  }

  return { authRow };
}

async function handleVerifiedCoachRequest(
  dto: AiCoachRequestDto,
  userId: string,
  config: AiCoachServerConfig,
  deps: Required<
    Pick<
      AiCoachHandlerDeps,
      | "authorizeAiRequest"
      | "refundQuota"
      | "recordTokenUsage"
      | "generateWithFallback"
      | "streamWithFallback"
      | "waitUntil"
      | "requestResults"
    >
  >,
): Promise<Response> {
  // Always allow recover BEFORE payment gating so already-admitted in-flight completions deliver.
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

  const subjectDigests = await deriveSubjectDigests(userId, {
    current: config.abusePreventionPepper,
    previous: config.abusePreventionPepperPrevious,
  });

  const authOutcome = await authorizeOrErrorResponse(
    dto,
    userId,
    subjectDigests,
    clientRequestId,
    config,
    deps,
  );
  if ("response" in authOutcome) {
    return authOutcome.response;
  }

  const quotaUsageDate = deriveUsageDateFromResetAt(authOutcome.authRow.reset_at);

  if (dto.action === "classify") {
    return executeClassifyWithRefund(
      dto,
      userId,
      subjectDigests.subjectDigest,
      config,
      authOutcome.authRow,
      quotaUsageDate,
      deps,
    );
  }

  return createCoachStreamResponse({
    dto,
    userId,
    subjectDigest: subjectDigests.subjectDigest,
    clientRequestId,
    config,
    authRow: authOutcome.authRow,
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
    authorizeAiRequest: deps.authorizeAiRequest ?? authorizeAiRequest,
    refundQuota: deps.refundQuota ?? refundQuota,
    recordTokenUsage: deps.recordTokenUsage ?? recordTokenUsage,
    generateWithFallback: deps.generateWithFallback ?? generateWithFallback,
    streamWithFallback: deps.streamWithFallback ?? streamWithFallback,
    waitUntil: deps.waitUntil ?? defaultWaitUntil,
    requestResults:
      deps.requestResults ??
      createSupabaseRequestResultsStore(config.supabaseUrl, config.serviceRoleKey),
  });
}

getDenoRuntime()?.serve((req: Request) => handleAiCoachRequest(req));
