import assert from "node:assert/strict";
import {
  consumeQuota,
  deriveUsageDateFromResetAt,
  formatQuotaPayload,
  type QuotaRow,
  refundQuota,
} from "./quota.ts";

const SUPABASE_URL = "https://example.supabase.co";
const SERVICE_KEY = "service-role-secret";
const USER_ID = "google-sub-sensitive-999";

Deno.test("formatQuotaPayload and deriveUsageDateFromResetAt map fields accurately", () => {
  const row: QuotaRow = {
    allowed: true,
    current_count: 3,
    daily_limit: 15,
    reset_at: "2026-11-16T00:00:00.000Z",
    global_capped: false,
  };
  assert.deepEqual(formatQuotaPayload(row), {
    currentCount: 3,
    dailyLimit: 15,
    resetAt: "2026-11-16T00:00:00.000Z",
  });

  assert.equal(deriveUsageDateFromResetAt("2026-11-16T00:00:00.000Z"), "2026-11-15");
  assert.equal(deriveUsageDateFromResetAt("2026-01-01T00:00:00.000Z"), "2025-12-31");
  assert.equal(deriveUsageDateFromResetAt("not-a-timestamp"), undefined);
});

Deno.test("consumeQuota sends service_role RPC request and handles allowed/denied rows", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedMethod = "";
  let capturedHeaders = new Headers();
  let capturedBody = "";

  const allowedRow: QuotaRow = {
    allowed: true,
    current_count: 1,
    daily_limit: 15,
    reset_at: "2026-11-16T00:00:00.000Z",
  };
  const globalCappedRow: QuotaRow = {
    allowed: false,
    current_count: 15,
    daily_limit: 15,
    reset_at: "2026-11-16T00:00:00.000Z",
    global_capped: true,
  };

  let nextResponse: () => Promise<Response> = async () =>
    new Response(JSON.stringify([allowedRow]), { status: 200 });

  globalThis.fetch = (input, init) => {
    capturedUrl = String(input);
    capturedMethod = init?.method ?? "";
    capturedHeaders = new Headers(init?.headers);
    capturedBody = String(init?.body ?? "");
    return nextResponse();
  };

  try {
    const res1 = await consumeQuota(SUPABASE_URL, SERVICE_KEY, USER_ID, "coach", 15);
    assert.deepEqual(res1, allowedRow);
    assert.equal(capturedUrl, `${SUPABASE_URL}/rest/v1/rpc/consume_ai_quota`);
    assert.equal(capturedMethod, "POST");
    assert.equal(capturedHeaders.get("Content-Type"), "application/json");
    assert.equal(capturedHeaders.get("apikey"), SERVICE_KEY);
    assert.equal(capturedHeaders.get("Authorization"), `Bearer ${SERVICE_KEY}`);
    assert.deepEqual(JSON.parse(capturedBody), {
      p_user_id: USER_ID,
      p_kind: "coach",
      p_daily_limit: 15,
    });

    nextResponse = async () => new Response(JSON.stringify([globalCappedRow]), { status: 200 });
    const res2 = await consumeQuota(SUPABASE_URL, SERVICE_KEY, USER_ID, "classify", 50);
    assert.deepEqual(res2, globalCappedRow);
    assert.deepEqual(JSON.parse(capturedBody), {
      p_user_id: USER_ID,
      p_kind: "classify",
      p_daily_limit: 50,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("consumeQuota returns null on HTTP failures, malformed payloads, and network errors", async () => {
  const originalFetch = globalThis.fetch;
  let nextResponse: () => Promise<Response> = async () => new Response("db down", { status: 500 });

  globalThis.fetch = () => nextResponse();

  try {
    assert.equal(await consumeQuota(SUPABASE_URL, SERVICE_KEY, USER_ID, "coach", 15), null);

    nextResponse = async () => new Response(JSON.stringify([]), { status: 200 });
    assert.equal(await consumeQuota(SUPABASE_URL, SERVICE_KEY, USER_ID, "coach", 15), null);

    nextResponse = async () => new Response(JSON.stringify({ allowed: true }), { status: 200 });
    assert.equal(await consumeQuota(SUPABASE_URL, SERVICE_KEY, USER_ID, "coach", 15), null);

    nextResponse = async () => new Response("not-json{", { status: 200 });
    assert.equal(await consumeQuota(SUPABASE_URL, SERVICE_KEY, USER_ID, "coach", 15), null);

    nextResponse = () => Promise.reject(new Error("connection reset"));
    assert.equal(await consumeQuota(SUPABASE_URL, SERVICE_KEY, USER_ID, "coach", 15), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("refundQuota passes optional p_usage_date and logs errors without userId PII", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const originalError = console.error;
  const capturedBodies: Array<Record<string, unknown>> = [];
  const warnCalls: unknown[][] = [];
  const errorCalls: unknown[][] = [];
  let capturedUrl = "";

  console.warn = (...args: unknown[]) => {
    warnCalls.push(args);
  };
  console.error = (...args: unknown[]) => {
    errorCalls.push(args);
  };

  let nextResponse: () => Promise<Response> = async () => new Response(null, { status: 204 });
  globalThis.fetch = (input, init) => {
    capturedUrl = String(input);
    capturedBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return nextResponse();
  };

  try {
    await refundQuota(SUPABASE_URL, SERVICE_KEY, USER_ID, "coach");
    assert.equal(capturedUrl, `${SUPABASE_URL}/rest/v1/rpc/refund_ai_quota`);
    assert.deepEqual(capturedBodies[0], {
      p_user_id: USER_ID,
      p_kind: "coach",
    });
    assert.equal("p_usage_date" in (capturedBodies[0] ?? {}), false);

    await refundQuota(SUPABASE_URL, SERVICE_KEY, USER_ID, "classify", "2026-11-15");
    assert.deepEqual(capturedBodies[1], {
      p_user_id: USER_ID,
      p_kind: "classify",
      p_usage_date: "2026-11-15",
    });
    assert.equal(warnCalls.length, 0);
    assert.equal(errorCalls.length, 0);

    nextResponse = async () => new Response("server error", { status: 503 });
    await refundQuota(SUPABASE_URL, SERVICE_KEY, USER_ID, "coach", "2026-11-15");
    assert.equal(warnCalls.length, 1);
    assert.equal(JSON.stringify(warnCalls[0]).includes(USER_ID), false);
    assert.equal(JSON.stringify(warnCalls[0]).includes("503"), true);

    nextResponse = () => Promise.reject(new TypeError("network failed"));
    await refundQuota(SUPABASE_URL, SERVICE_KEY, USER_ID, "coach");
    assert.equal(errorCalls.length, 1);
    assert.equal(JSON.stringify(errorCalls[0]).includes(USER_ID), false);
    assert.equal(JSON.stringify(errorCalls[0]).includes("TypeError"), true);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    console.error = originalError;
  }
});
