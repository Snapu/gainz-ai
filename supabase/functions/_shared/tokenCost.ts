import type { EntitlementSource } from "./entitlement.ts";
import { fetchWithTimeout } from "./http.ts";

export type { EntitlementSource };

export interface GeminiModelPricing {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export type TokenRequestKind =
  | "initial_plan"
  | "plan_regeneration"
  | "plan_update"
  | "session_briefing"
  | "chat"
  | "classify";

export interface TokenCountBreakdown {
  promptTokens: number;
  cachedTokens: number;
  outputTokens: number;
  thinkingTokens: number;
}

export interface RecordTokenUsageParams extends TokenCountBreakdown {
  actorKey: string;
  usageDate: string;
  model: string;
  requestKind: TokenRequestKind;
  entitlementSource: EntitlementSource;
  unmeasured: boolean;
}

export const DEFAULT_DAILY_COST_CAP_USD_MICROS = 5_000_000;

export const DEFAULT_MODEL_PRICING_USD_PER_MILLION: GeminiModelPricing = {
  inputUsdPerMillion: 0.5,
  cachedInputUsdPerMillion: 0.125,
  outputUsdPerMillion: 3.0,
};

export const MODEL_PRICING_USD_PER_MILLION: Record<string, GeminiModelPricing> = {
  "gemini-3.8-flash": {
    inputUsdPerMillion: 0.3,
    cachedInputUsdPerMillion: 0.075,
    outputUsdPerMillion: 2.5,
  },
  "gemini-3.5-flash-lite": {
    inputUsdPerMillion: 0.1,
    cachedInputUsdPerMillion: 0.025,
    outputUsdPerMillion: 0.4,
  },
  "gemini-2.5-flash": {
    inputUsdPerMillion: 0.3,
    cachedInputUsdPerMillion: 0.075,
    outputUsdPerMillion: 2.5,
  },
  "gemini-2.5-flash-lite": {
    inputUsdPerMillion: 0.1,
    cachedInputUsdPerMillion: 0.025,
    outputUsdPerMillion: 0.4,
  },
};

function toSafeNonNegInt(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function estimateTokensFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.ceil(chars / 4);
}

export function calculateTokenCostUsdMicros(model: string, usage: TokenCountBreakdown): number {
  const pricing = Object.hasOwn(MODEL_PRICING_USD_PER_MILLION, model)
    ? MODEL_PRICING_USD_PER_MILLION[model]
    : DEFAULT_MODEL_PRICING_USD_PER_MILLION;
  const prompt = toSafeNonNegInt(usage.promptTokens);
  const cached = toSafeNonNegInt(usage.cachedTokens);
  const uncachedPrompt = Math.max(0, prompt - cached);
  const billableOutput =
    toSafeNonNegInt(usage.outputTokens) + toSafeNonNegInt(usage.thinkingTokens);

  // 1 USD per 1M tokens equals exactly 1 micro-USD (1e-6 USD) per token.
  return Math.round(
    uncachedPrompt * pricing.inputUsdPerMillion +
      cached * pricing.cachedInputUsdPerMillion +
      billableOutput * pricing.outputUsdPerMillion,
  );
}

export function parseDailyCostCapUsdMicros(raw: string | undefined): number {
  if (!raw || raw.trim().length === 0) return DEFAULT_DAILY_COST_CAP_USD_MICROS;
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_DAILY_COST_CAP_USD_MICROS;
  if (parsed === 0) return 0;
  const micros = Math.max(1, Math.round(parsed * 1_000_000));
  return Number.isSafeInteger(micros) ? micros : DEFAULT_DAILY_COST_CAP_USD_MICROS;
}

export async function recordTokenUsage(
  supabaseUrl: string,
  serviceRoleKey: string,
  params: RecordTokenUsageParams,
): Promise<boolean> {
  const promptTokens = toSafeNonNegInt(params.promptTokens);
  const cachedTokens = toSafeNonNegInt(params.cachedTokens);
  const outputTokens = toSafeNonNegInt(params.outputTokens);
  const thinkingTokens = toSafeNonNegInt(params.thinkingTokens);
  const estimatedCostUsdMicros = calculateTokenCostUsdMicros(params.model, {
    promptTokens,
    cachedTokens,
    outputTokens,
    thinkingTokens,
  });

  try {
    const res = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/rpc/record_ai_token_usage`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_actor_key: params.actorKey,
          p_usage_date: params.usageDate,
          p_model: params.model,
          p_request_kind: params.requestKind,
          p_entitlement_source: params.entitlementSource,
          p_unmeasured: params.unmeasured,
          p_prompt_tokens: promptTokens,
          p_cached_tokens: cachedTokens,
          p_output_tokens: outputTokens,
          p_thinking_tokens: thinkingTokens,
          p_estimated_cost_usd_micros: estimatedCostUsdMicros,
        }),
      },
      5_000,
    );

    void res.body?.cancel().catch(() => {});

    if (!res.ok) {
      console.warn(`[tokenCost] record_ai_token_usage failed HTTP ${res.status}`);
      return false;
    }

    return true;
  } catch (err) {
    console.warn(
      `[tokenCost] record_ai_token_usage error: ${err instanceof Error ? err.name : "unknown"}`,
    );
    return false;
  }
}
