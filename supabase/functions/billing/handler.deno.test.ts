import assert from "node:assert/strict";
import { type BillingHandlerDeps, handleBillingRequest } from "./handler.ts";

const BILLING_URL = "https://example.supabase.co/functions/v1/billing";
const SUPABASE_URL = "https://project.supabase.co";
const SERVICE_ROLE_KEY = "service-role-secret";
const VALID_PEPPER = "0123456789abcdef0123456789abcdef";

function createTestEnv(overrides: Record<string, string | undefined> = {}) {
  const vars: Record<string, string | undefined> = {
    GOOGLE_CLIENT_ID: "custom-client-id.apps.googleusercontent.com",
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    ABUSE_PREVENTION_PEPPER: VALID_PEPPER,
    ...overrides,
  };
  return (key: string) => vars[key];
}

function createPostRequest(
  body: unknown,
  token: string | null = "ya29.valid-access-token",
): Request {
  return new Request(BILLING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function createDeps(overrides: Partial<BillingHandlerDeps> = {}): BillingHandlerDeps {
  return {
    getEnv: createTestEnv(),
    verifyCaller: async () => ({ userId: "google-sub-123" }),
    getEntitlementStatus: async () => ({
      entitlement_source: "free_allowance",
      can_use_coach: true,
      can_use_classify: true,
      evaluated_at: "2026-11-26T12:00:00.000Z",
      free_coach_used: 4,
      free_coach_limit: 30,
      free_classify_used: 2,
      free_classify_limit: 40,
    }),
    ...overrides,
  };
}

Deno.test("handleBillingRequest handles CORS preflight and rejects non-POST methods", async () => {
  const optionsRes = await handleBillingRequest(
    new Request(BILLING_URL, { method: "OPTIONS" }),
    createDeps(),
  );
  assert.equal(optionsRes.status, 200);
  assert.equal(await optionsRes.text(), "ok");

  const getRes = await handleBillingRequest(
    new Request(BILLING_URL, { method: "GET" }),
    createDeps(),
  );
  assert.equal(getRes.status, 405);
});

Deno.test("handleBillingRequest returns 401 when bearer token is missing even if server config is missing, then checks config", async () => {
  const noAuthMissingConfigRes = await handleBillingRequest(
    createPostRequest({ action: "status" }, null),
    createDeps({ getEnv: createTestEnv({ ABUSE_PREVENTION_PEPPER: undefined }) }),
  );
  assert.equal(noAuthMissingConfigRes.status, 401);

  const missingPepperRes = await handleBillingRequest(
    createPostRequest({ action: "status" }),
    createDeps({ getEnv: createTestEnv({ ABUSE_PREVENTION_PEPPER: undefined }) }),
  );
  assert.equal(missingPepperRes.status, 500);
  assert.deepEqual(await missingPepperRes.json(), { error: "missing-server-config" });

  const shortPepperRes = await handleBillingRequest(
    createPostRequest({ action: "status" }),
    createDeps({ getEnv: createTestEnv({ ABUSE_PREVENTION_PEPPER: "too-short" }) }),
  );
  assert.equal(shortPepperRes.status, 500);
  assert.deepEqual(await shortPepperRes.json(), { error: "missing-server-config" });
});

Deno.test("handleBillingRequest returns 401 when bearer token is missing or unverified", async () => {
  const noAuthRes = await handleBillingRequest(
    createPostRequest({ action: "status" }, null),
    createDeps(),
  );
  assert.equal(noAuthRes.status, 401);

  const invalidAuthRes = await handleBillingRequest(
    createPostRequest({ action: "status" }, "bad-token"),
    createDeps({ verifyCaller: async () => null }),
  );
  assert.equal(invalidAuthRes.status, 401);
});

Deno.test("handleBillingRequest validates action payload and returns formatted Entitlement for status", async () => {
  const invalidRes = await handleBillingRequest(
    createPostRequest({ action: "unknown" }),
    createDeps(),
  );
  assert.equal(invalidRes.status, 400);
  assert.deepEqual(await invalidRes.json(), { error: "invalid-request" });

  let capturedDigest = "";
  let capturedPrevDigest: string | null | undefined;
  const statusRes = await handleBillingRequest(
    createPostRequest({ action: "status" }),
    createDeps({
      getEnv: createTestEnv({
        ABUSE_PREVENTION_PEPPER_PREVIOUS: "fedcba9876543210fedcba9876543210",
      }),
      getEntitlementStatus: async (_url, _key, params) => {
        capturedDigest = params.subjectDigest;
        capturedPrevDigest = params.previousSubjectDigest ?? null;
        return {
          entitlement_source: "free_allowance",
          can_use_coach: true,
          can_use_classify: false,
          evaluated_at: "2026-11-26T12:00:00.000Z",
          free_coach_used: 10,
          free_coach_limit: 30,
          free_classify_used: 40,
          free_classify_limit: 40,
        };
      },
    }),
  );

  assert.equal(statusRes.status, 200);
  assert.match(capturedDigest, /^v1:[0-9a-f]{64}$/);
  assert.match(capturedPrevDigest ?? "", /^v1:[0-9a-f]{64}$/);
  assert.notEqual(capturedDigest, capturedPrevDigest);

  assert.deepEqual(await statusRes.json(), {
    entitlement: {
      source: "free_allowance",
      canUseCoach: true,
      canUseClassify: false,
      evaluatedAt: "2026-11-26T12:00:00.000Z",
      freeAllowance: {
        coachUsed: 10,
        coachLimit: 30,
        classifyUsed: 40,
        classifyLimit: 40,
      },
      subscription: null,
      inviteGrant: null,
      hasCustomerPortal: false,
    },
  });
});

Deno.test("handleBillingRequest returns 500 billing-unavailable when getEntitlementStatus fails", async () => {
  const res = await handleBillingRequest(
    createPostRequest({ action: "status" }),
    createDeps({
      getEntitlementStatus: async () => null,
    }),
  );

  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "billing-unavailable" });
});
