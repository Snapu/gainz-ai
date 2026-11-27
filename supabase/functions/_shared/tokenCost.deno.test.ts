import assert from "node:assert/strict";
import {
  calculateTokenCostUsdMicros,
  DEFAULT_DAILY_COST_CAP_USD_MICROS,
  DEFAULT_MODEL_PRICING_USD_PER_MILLION,
  estimateTokensFromChars,
  MODEL_PRICING_USD_PER_MILLION,
  parseDailyCostCapUsdMicros,
  recordTokenUsage,
} from "./tokenCost.ts";

const SUPABASE_URL = "https://example.supabase.co";
const SERVICE_KEY = "service-role-secret";

Deno.test("MODEL_PRICING_USD_PER_MILLION covers all primary and fallback Gemini models with positive rates", () => {
  const requiredModels = [
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ];

  for (const model of requiredModels) {
    const pricing = MODEL_PRICING_USD_PER_MILLION[model];
    assert.ok(pricing, `Expected pricing entry for ${model}`);
    assert.ok(pricing.inputUsdPerMillion > 0);
    assert.ok(pricing.cachedInputUsdPerMillion > 0);
    assert.ok(pricing.outputUsdPerMillion > 0);
  }

  assert.ok(DEFAULT_MODEL_PRICING_USD_PER_MILLION.inputUsdPerMillion > 0);
  assert.ok(DEFAULT_MODEL_PRICING_USD_PER_MILLION.cachedInputUsdPerMillion > 0);
  assert.ok(DEFAULT_MODEL_PRICING_USD_PER_MILLION.outputUsdPerMillion > 0);
});

Deno.test("calculateTokenCostUsdMicros prices uncached prompt, cached prompt, and output + thinking tokens", () => {
  const pricing = MODEL_PRICING_USD_PER_MILLION["gemini-3.8-flash"];
  const expectedMicros = Math.round(
    (10_000 - 4_000) * pricing.inputUsdPerMillion +
      4_000 * pricing.cachedInputUsdPerMillion +
      (2_000 + 1_000) * pricing.outputUsdPerMillion,
  );

  const actualMicros = calculateTokenCostUsdMicros("gemini-3.8-flash", {
    promptTokens: 10_000,
    cachedTokens: 4_000,
    outputTokens: 2_000,
    thinkingTokens: 1_000,
  });

  assert.equal(actualMicros, expectedMicros);

  // Guard: cachedTokens > promptTokens must clamp uncached input at 0 instead of going negative
  const clampedMicros = calculateTokenCostUsdMicros("gemini-3.5-flash-lite", {
    promptTokens: 100,
    cachedTokens: 500,
    outputTokens: 0,
    thinkingTokens: 0,
  });
  const litePricing = MODEL_PRICING_USD_PER_MILLION["gemini-3.5-flash-lite"];
  assert.equal(clampedMicros, Math.round(500 * litePricing.cachedInputUsdPerMillion));

  // Unknown models and prototype keys ("constructor", "toString") use conservative default pricing
  for (const unknownModel of ["gemini-future-experimental", "constructor", "toString"]) {
    const unknownMicros = calculateTokenCostUsdMicros(unknownModel, {
      promptTokens: 1_000,
      cachedTokens: 0,
      outputTokens: 1_000,
      thinkingTokens: 0,
    });
    assert.equal(
      unknownMicros,
      Math.round(
        1_000 * DEFAULT_MODEL_PRICING_USD_PER_MILLION.inputUsdPerMillion +
          1_000 * DEFAULT_MODEL_PRICING_USD_PER_MILLION.outputUsdPerMillion,
      ),
    );
  }

  // NaN / Infinity / negative / float tokens are sanitized rather than producing NaN or floats
  assert.equal(
    calculateTokenCostUsdMicros("gemini-3.8-flash", {
      promptTokens: Number.NaN,
      cachedTokens: Number.POSITIVE_INFINITY,
      outputTokens: 10.9,
      thinkingTokens: -50,
    }),
    Math.round(10 * pricing.outputUsdPerMillion),
  );
});

Deno.test("estimateTokensFromChars applies conservative ceil(chars / 4) and parseDailyCostCapUsdMicros hardens bounds", () => {
  assert.equal(estimateTokensFromChars(0), 0);
  assert.equal(estimateTokensFromChars(-10), 0);
  assert.equal(estimateTokensFromChars(1), 1);
  assert.equal(estimateTokensFromChars(4), 1);
  assert.equal(estimateTokensFromChars(5), 2);
  assert.equal(estimateTokensFromChars(100), 25);

  assert.equal(parseDailyCostCapUsdMicros(undefined), DEFAULT_DAILY_COST_CAP_USD_MICROS);
  assert.equal(parseDailyCostCapUsdMicros(""), DEFAULT_DAILY_COST_CAP_USD_MICROS);
  assert.equal(parseDailyCostCapUsdMicros("not-a-number"), DEFAULT_DAILY_COST_CAP_USD_MICROS);
  assert.equal(parseDailyCostCapUsdMicros("-5"), DEFAULT_DAILY_COST_CAP_USD_MICROS);
  assert.equal(parseDailyCostCapUsdMicros("1e20"), DEFAULT_DAILY_COST_CAP_USD_MICROS);
  assert.equal(parseDailyCostCapUsdMicros("0"), 0);
  assert.equal(parseDailyCostCapUsdMicros("0.0000001"), 1);
  assert.equal(parseDailyCostCapUsdMicros("12.5"), 12_500_000);
  assert.equal(parseDailyCostCapUsdMicros("25"), 25_000_000);
});

Deno.test("recordTokenUsage posts sanitized RPC payload and fails soft on HTTP errors or network throws without PII", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const capturedCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const warnCalls: unknown[][] = [];
  let nextMode: "ok" | "http-error" | "network-throw" = "ok";

  console.warn = (...args: unknown[]) => {
    warnCalls.push(args);
  };

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (nextMode === "network-throw") {
      throw new TypeError("socket hang up for actor-digest-secret-123");
    }
    const url = typeof input === "string" ? input : input.toString();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    capturedCalls.push({ url, body });
    return new Response(nextMode === "ok" ? null : '{"message":"error"}', {
      status: nextMode === "ok" ? 204 : 500,
    });
  }) as typeof fetch;

  try {
    const ok = await recordTokenUsage(SUPABASE_URL, SERVICE_KEY, {
      actorKey: "actor-digest-secret-123",
      usageDate: "2026-11-27",
      model: "gemini-3.8-flash",
      requestKind: "initial_plan",
      entitlementSource: "free_allowance",
      unmeasured: false,
      promptTokens: 3_000.7,
      cachedTokens: Number.NaN,
      outputTokens: 900,
      thinkingTokens: 300,
    });

    assert.equal(ok, true);
    assert.equal(capturedCalls.length, 1);
    assert.equal(capturedCalls[0].url, `${SUPABASE_URL}/rest/v1/rpc/record_ai_token_usage`);
    const pricing = MODEL_PRICING_USD_PER_MILLION["gemini-3.8-flash"];
    assert.deepEqual(capturedCalls[0].body, {
      p_actor_key: "actor-digest-secret-123",
      p_usage_date: "2026-11-27",
      p_model: "gemini-3.8-flash",
      p_request_kind: "initial_plan",
      p_entitlement_source: "free_allowance",
      p_unmeasured: false,
      p_prompt_tokens: 3_000,
      p_cached_tokens: 0,
      p_output_tokens: 900,
      p_thinking_tokens: 300,
      p_estimated_cost_usd_micros: Math.round(
        3_000 * pricing.inputUsdPerMillion + 1_200 * pricing.outputUsdPerMillion,
      ),
    });

    nextMode = "http-error";
    const failedHttp = await recordTokenUsage(SUPABASE_URL, SERVICE_KEY, {
      actorKey: "actor-digest-secret-123",
      usageDate: "2026-11-27",
      model: "gemini-3.5-flash-lite",
      requestKind: "classify",
      entitlementSource: "subscription",
      unmeasured: true,
      promptTokens: 400,
      cachedTokens: 0,
      outputTokens: 120,
      thinkingTokens: 0,
    });
    assert.equal(failedHttp, false);

    nextMode = "network-throw";
    const failedThrow = await recordTokenUsage(SUPABASE_URL, SERVICE_KEY, {
      actorKey: "actor-digest-secret-123",
      usageDate: "2026-11-27",
      model: "gemini-3.5-flash-lite",
      requestKind: "classify",
      entitlementSource: "subscription",
      unmeasured: true,
      promptTokens: 400,
      cachedTokens: 0,
      outputTokens: 120,
      thinkingTokens: 0,
    });
    assert.equal(failedThrow, false);

    assert.equal(warnCalls.length, 2);
    assert.equal(JSON.stringify(warnCalls).includes("actor-digest-secret-123"), false);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});
