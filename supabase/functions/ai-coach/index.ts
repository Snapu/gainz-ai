import { extractBearerToken, verifyGoogleCaller } from "../_shared/auth.ts";
import { COACHING_MODELS, generateWithFallback } from "../_shared/gemini.ts";
import {
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
  type AiCoachRequestDto,
  aiCoachRequestDtoSchema,
  type CoachActionRequestDto,
  createCoachingAdviceJsonSchema,
  parseCoachingAdviceResponse,
} from "./schemas.ts";

const DEFAULT_DAILY_COACH_LIMIT = 15;
const DEFAULT_DAILY_CLASSIFY_LIMIT = 50;

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
  generateFn: typeof generateWithFallback,
): Promise<Response> {
  const allowPlanUpdate = shouldAllowPlanUpdate(dto.mode, dto.question);
  const thinkingBudget = dto.mode === "planning" ? 1024 : 256;
  const isPlanningTimeout =
    dto.mode === "planning" || dto.previousMessages.length === 0 || dto.workoutPhase === "planning";
  const timeoutMs = isPlanningTimeout ? 55_000 : 40_000;
  const prompt = assembleCoachingPrompt(dto);
  const contents = buildBoundedConversationContents(dto.previousMessages, prompt);

  const result = await generateFn({
    geminiApiKey,
    models: COACHING_MODELS,
    contents,
    systemInstruction: buildSystemInstruction(dto.mode),
    responseJsonSchema: createCoachingAdviceJsonSchema(dto.muscleGroups, dto.mode, allowPlanUpdate),
    temperature: 0.7,
    topP: 0.9,
    thinkingConfig: { thinkingBudget, includeThoughts: false },
    timeoutMs,
    parseResponse: (parsedJson) => parseCoachingAdviceResponse(parsedJson, dto.mode),
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

  return jsonResponse({
    advice,
    quota: formatQuotaPayload(quota),
  });
}

async function handleVerifiedCoachRequest(
  dto: AiCoachRequestDto,
  userId: string,
  config: AiCoachServerConfig,
  deps: Required<Pick<AiCoachHandlerDeps, "consumeQuota" | "refundQuota" | "generateWithFallback">>,
): Promise<Response> {
  if (dto.action === "classify" && dto.exerciseNames.length === 0) {
    return jsonResponse({ text: JSON.stringify({ classifications: [] }) });
  }

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
    return jsonResponse({ error: "quota-check-failed" }, 500);
  }

  if (!quota.allowed) {
    if (quota.global_capped) {
      console.warn(`Global daily AI quota ceiling reached for action: ${dto.action}`);
    }
    return jsonResponse(
      {
        error: "rate-limit-exceeded",
        quota: formatQuotaPayload(quota),
      },
      429,
    );
  }

  const quotaUsageDate = deriveUsageDateFromResetAt(quota.reset_at);

  try {
    if (dto.action === "classify") {
      return await executeClassifyAction(
        dto,
        config.geminiApiKey,
        quota,
        deps.generateWithFallback,
      );
    }
    return await executeCoachAction(dto, config.geminiApiKey, quota, deps.generateWithFallback);
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
  });
}

getDenoRuntime()?.serve((req: Request) => handleAiCoachRequest(req));
