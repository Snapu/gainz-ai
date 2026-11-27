import assert from "node:assert/strict";
import { computeSubjectDigest } from "../_shared/subjectDigest.ts";
import { handleBillingRequest } from "../billing/handler.ts";
import { type DeleteAccountHandlerDeps, handleDeleteAccountRequest } from "./handler.ts";

const DELETE_ACCOUNT_URL = "https://example.supabase.co/functions/v1/delete-account";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const SUPABASE_URL = "https://project.supabase.co";
const SERVICE_ROLE_KEY = "service-role-secret";

function createTestEnv(overrides: Record<string, string | undefined> = {}) {
  const vars: Record<string, string | undefined> = {
    GOOGLE_CLIENT_ID: "custom-client-id.apps.googleusercontent.com",
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY: "sk_test_delete_account",
    ...overrides,
  };
  return (key: string) => vars[key];
}

function createPostRequest(
  body: unknown,
  token: string | null = "ya29.valid-access-token",
  headers: Record<string, string> = {},
): Request {
  return new Request(DELETE_ACCOUNT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function createDeps(overrides: Partial<DeleteAccountHandlerDeps> = {}): DeleteAccountHandlerDeps {
  return {
    getEnv: createTestEnv(),
    verifyCaller: async () => ({ userId: "google-user-123" }),
    fetchImpl: async () => new Response("", { status: 200 }),
    getUserSubscriptionSummary: async () => ({ ok: true, row: null }),
    cancelStripeSubscription: async () => ({ ok: true }),
    deleteUserAccountData: async () => ({ ok: true, billingCancellationPending: false }),
    ...overrides,
  };
}

Deno.test("handleDeleteAccountRequest responds to CORS preflight OPTIONS", async () => {
  const req = new Request(DELETE_ACCOUNT_URL, { method: "OPTIONS" });
  const res = await handleDeleteAccountRequest(req, createDeps());

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(await res.text(), "ok");
});

Deno.test("handleDeleteAccountRequest rejects non-POST methods with 405", async () => {
  const req = new Request(DELETE_ACCOUNT_URL, { method: "GET" });
  const res = await handleDeleteAccountRequest(req, createDeps());

  assert.equal(res.status, 405);
  assert.deepEqual(await res.json(), { error: "method-not-allowed" });
});

Deno.test("handleDeleteAccountRequest returns 500 when Supabase config is missing", async () => {
  const req = createPostRequest({});
  const res = await handleDeleteAccountRequest(
    req,
    createDeps({
      getEnv: createTestEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined }),
    }),
  );

  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "missing-server-config" });
});

Deno.test("handleDeleteAccountRequest returns 401 when Bearer token is missing or invalid", async () => {
  const missingHeaderRes = await handleDeleteAccountRequest(
    createPostRequest({}, null),
    createDeps(),
  );
  assert.equal(missingHeaderRes.status, 401);
  assert.deepEqual(await missingHeaderRes.json(), { error: "unauthorized" });

  let verifiedToken: string | null = null;
  let verifiedClientId: string | null = null;
  const invalidCallerRes = await handleDeleteAccountRequest(
    createPostRequest({}, "bad-token"),
    createDeps({
      verifyCaller: async (token, clientId) => {
        verifiedToken = token;
        verifiedClientId = clientId;
        return null;
      },
    }),
  );

  assert.equal(verifiedToken, "bad-token");
  assert.equal(verifiedClientId, "custom-client-id.apps.googleusercontent.com");
  assert.equal(invalidCallerRes.status, 401);
  assert.deepEqual(await invalidCallerRes.json(), { error: "unauthorized" });
});

Deno.test("handleDeleteAccountRequest returns 400 for invalid JSON or invalid revokeToken", async () => {
  const invalidJsonRes = await handleDeleteAccountRequest(
    createPostRequest("{not-json"),
    createDeps(),
  );
  assert.equal(invalidJsonRes.status, 400);
  assert.deepEqual(await invalidJsonRes.json(), { error: "invalid-json" });

  const arrayBodyRes = await handleDeleteAccountRequest(createPostRequest([]), createDeps());
  assert.equal(arrayBodyRes.status, 400);
  assert.deepEqual(await arrayBodyRes.json(), { error: "invalid-request" });

  const emptyTokenRes = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: "   " }),
    createDeps(),
  );
  assert.equal(emptyTokenRes.status, 400);
  assert.deepEqual(await emptyTokenRes.json(), { error: "invalid-request" });

  const nonStringTokenRes = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: 123 }),
    createDeps(),
  );
  assert.equal(nonStringTokenRes.status, 400);
  assert.deepEqual(await nonStringTokenRes.json(), { error: "invalid-request" });
});

Deno.test("handleDeleteAccountRequest deletes non-subscribed account atomically via deleteUserAccountData and revokes Google token", async () => {
  const calls: Array<{ url: string; method?: string; headers?: HeadersInit; body?: unknown }> = [];
  let deleteParams: Record<string, unknown> | null = null;
  let stripeCancelCalled = false;

  const res = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: "refresh-token-xyz" }, "header.jwt.payload"),
    createDeps({
      verifyCaller: async () => ({ userId: "user/with+chars" }),
      cancelStripeSubscription: async () => {
        stripeCancelCalled = true;
        return { ok: true };
      },
      deleteUserAccountData: async (_url, _key, params) => {
        deleteParams = params;
        return { ok: true, billingCancellationPending: false };
      },
      fetchImpl: async (url, init) => {
        calls.push({ url, method: init.method, headers: init.headers, body: init.body });
        return new Response(null, { status: 204 });
      },
    }),
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    deleted: true,
    googleRevoked: true,
    billingCancellationPending: false,
  });
  assert.equal(stripeCancelCalled, false);
  assert.deepEqual(deleteParams, {
    userId: "user/with+chars",
    canceledSubscriptionId: null,
    pendingCancelSubscriptionId: null,
    pendingCancelError: null,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, GOOGLE_REVOKE_URL);
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.body, new URLSearchParams({ token: "refresh-token-xyz" }).toString());
});

Deno.test("handleDeleteAccountRequest cancels active Stripe subscription synchronously when reachable", async () => {
  let canceledSubId: string | null = null;
  let deleteParams: Record<string, unknown> | null = null;

  const res = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: "refresh-token-xyz" }),
    createDeps({
      getUserSubscriptionSummary: async () => ({
        ok: true,
        row: {
          user_id: "google-user-123",
          provider: "stripe",
          provider_subscription_id: "sub_active_sync",
          provider_customer_id: "cus_123",
          price_id: "price_monthly_799",
          status: "active",
          cancel_at_period_end: false,
          current_period_end: "2026-12-27T00:00:00.000Z",
          grace_ends_at: null,
          last_event_created: 100,
        },
      }),
      cancelStripeSubscription: async (_key, subId) => {
        canceledSubId = subId;
        return { ok: true };
      },
      deleteUserAccountData: async (_url, _key, params) => {
        deleteParams = params;
        return { ok: true, billingCancellationPending: false };
      },
    }),
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    deleted: true,
    googleRevoked: true,
    billingCancellationPending: false,
  });
  assert.equal(canceledSubId, "sub_active_sync");
  assert.deepEqual(deleteParams, {
    userId: "google-user-123",
    canceledSubscriptionId: "sub_active_sync",
    pendingCancelSubscriptionId: null,
    pendingCancelError: null,
  });
});

Deno.test("handleDeleteAccountRequest immediately erases personal data and records tombstone when Stripe is unreachable", async () => {
  let deleteParams: Record<string, unknown> | null = null;

  const res = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: "refresh-token-xyz" }),
    createDeps({
      getUserSubscriptionSummary: async () => ({
        ok: true,
        row: {
          user_id: "google-user-123",
          provider: "stripe",
          provider_subscription_id: "sub_past_due_outage",
          provider_customer_id: "cus_outage",
          price_id: "price_monthly_799",
          status: "past_due",
          cancel_at_period_end: false,
          current_period_end: "2026-12-27T00:00:00.000Z",
          grace_ends_at: "2026-11-30T00:00:00.000Z",
          last_event_created: 200,
        },
      }),
      cancelStripeSubscription: async () => ({ ok: false, error: "stripe-http-503" }),
      deleteUserAccountData: async (_url, _key, params) => {
        deleteParams = params;
        return { ok: true, billingCancellationPending: true };
      },
    }),
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    deleted: true,
    googleRevoked: true,
    billingCancellationPending: true,
  });
  assert.deepEqual(deleteParams, {
    userId: "google-user-123",
    canceledSubscriptionId: null,
    pendingCancelSubscriptionId: "sub_past_due_outage",
    pendingCancelError: "stripe-http-503",
  });
});

Deno.test("handleDeleteAccountRequest returns 502 and does not revoke Google token if subscription lookup or cleanup RPC fails", async () => {
  let revokeCalled = false;

  const summaryFailRes = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: "refresh-token-xyz" }),
    createDeps({
      getUserSubscriptionSummary: async () => ({ ok: false }),
      fetchImpl: async () => {
        revokeCalled = true;
        return new Response("", { status: 200 });
      },
    }),
  );
  assert.equal(summaryFailRes.status, 502);
  assert.deepEqual(await summaryFailRes.json(), { error: "account-deletion-failed" });
  assert.equal(revokeCalled, false);

  const rpcFailRes = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: "refresh-token-xyz" }),
    createDeps({
      deleteUserAccountData: async () => ({ ok: false }),
      fetchImpl: async () => {
        revokeCalled = true;
        return new Response("", { status: 200 });
      },
    }),
  );
  assert.equal(rpcFailRes.status, 502);
  assert.deepEqual(await rpcFailRes.json(), { error: "account-deletion-failed" });
  assert.equal(revokeCalled, false);
});

Deno.test("handleDeleteAccountRequest treats Google 400 invalid_token as googleRevoked: true", async () => {
  const res = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: "already-revoked-token" }),
    createDeps({
      fetchImpl: async (url) => {
        if (url === GOOGLE_REVOKE_URL) {
          return new Response(JSON.stringify({ error: "invalid_token" }), { status: 400 });
        }
        return new Response(null, { status: 204 });
      },
    }),
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    deleted: true,
    googleRevoked: true,
    billingCancellationPending: false,
  });
});

Deno.test("handleDeleteAccountRequest still returns deleted: true with googleRevoked: false on Google revoke failure", async () => {
  const upstreamErrorRes = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: "refresh-token-xyz" }),
    createDeps({
      fetchImpl: async (url) => {
        if (url === GOOGLE_REVOKE_URL) {
          return new Response("upstream error", { status: 503 });
        }
        return new Response(null, { status: 204 });
      },
    }),
  );

  assert.equal(upstreamErrorRes.status, 200);
  assert.deepEqual(await upstreamErrorRes.json(), {
    deleted: true,
    googleRevoked: false,
    billingCancellationPending: false,
  });

  const networkErrorRes = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: "refresh-token-xyz" }),
    createDeps({
      fetchImpl: async (url) => {
        if (url === GOOGLE_REVOKE_URL) {
          throw new Error("network unreachable");
        }
        return new Response(null, { status: 204 });
      },
    }),
  );

  assert.equal(networkErrorRes.status, 200);
  assert.deepEqual(await networkErrorRes.json(), {
    deleted: true,
    googleRevoked: false,
    billingCancellationPending: false,
  });
});

Deno.test("handleDeleteAccountRequest falls back to non-JWT bearer access token and skips 3-part JWT when revokeToken is omitted", async () => {
  const accessRevokeCalls: Array<{ url: string; body?: unknown }> = [];
  const accessRes = await handleDeleteAccountRequest(
    createPostRequest({}, "ya29.opaque-access-token"),
    createDeps({
      fetchImpl: async (url, init) => {
        if (url === GOOGLE_REVOKE_URL) {
          accessRevokeCalls.push({ url, body: init.body });
        }
        return new Response("", { status: 200 });
      },
    }),
  );

  assert.equal(accessRes.status, 200);
  assert.deepEqual(await accessRes.json(), {
    deleted: true,
    googleRevoked: true,
    billingCancellationPending: false,
  });
  assert.equal(accessRevokeCalls.length, 1);
  assert.equal(
    accessRevokeCalls[0]?.body,
    new URLSearchParams({ token: "ya29.opaque-access-token" }).toString(),
  );

  const jwtRevokeCalls: string[] = [];
  const jwtRes = await handleDeleteAccountRequest(
    createPostRequest({}, "header.payload.signature"),
    createDeps({
      fetchImpl: async (url) => {
        if (url === GOOGLE_REVOKE_URL) {
          jwtRevokeCalls.push(url);
        }
        return new Response("", { status: 200 });
      },
    }),
  );

  assert.equal(jwtRes.status, 200);
  assert.deepEqual(await jwtRes.json(), {
    deleted: true,
    googleRevoked: false,
    billingCancellationPending: false,
  });
  assert.equal(jwtRevokeCalls.length, 0);
});

Deno.test("handleDeleteAccountRequest cancels trialing/unpaid/paused subscriptions, skips canceled, queues tombstone on missing STRIPE_SECRET_KEY, and surfaces concurrent RPC tombstone", async () => {
  for (const status of ["trialing", "unpaid", "paused"] as const) {
    let canceledId: string | null = null;
    const res = await handleDeleteAccountRequest(
      createPostRequest({}),
      createDeps({
        getUserSubscriptionSummary: async () => ({
          ok: true,
          row: {
            user_id: "google-user-123",
            provider: "stripe",
            provider_subscription_id: `sub_${status}`,
            provider_customer_id: "cus_1",
            price_id: "price_monthly_799",
            status,
            cancel_at_period_end: false,
            current_period_end: null,
            grace_ends_at: null,
            last_event_created: 100,
          },
        }),
        cancelStripeSubscription: async (_k, subId) => {
          canceledId = subId;
          return { ok: true };
        },
      }),
    );
    assert.equal(res.status, 200);
    assert.equal(canceledId, `sub_${status}`);
  }

  let canceledCalled = false;
  const canceledSkipRes = await handleDeleteAccountRequest(
    createPostRequest({}),
    createDeps({
      getUserSubscriptionSummary: async () => ({
        ok: true,
        row: {
          user_id: "google-user-123",
          provider: "stripe",
          provider_subscription_id: "sub_already_canceled",
          provider_customer_id: "cus_1",
          price_id: "price_monthly_799",
          status: "canceled",
          cancel_at_period_end: false,
          current_period_end: null,
          grace_ends_at: null,
          last_event_created: 100,
        },
      }),
      cancelStripeSubscription: async () => {
        canceledCalled = true;
        return { ok: true };
      },
    }),
  );
  assert.equal(canceledSkipRes.status, 200);
  assert.equal(canceledCalled, false);

  let missingSecretError: string | null = null;
  let missingSecretSubId: string | null = null;
  const missingSecretRes = await handleDeleteAccountRequest(
    createPostRequest({}),
    createDeps({
      getEnv: createTestEnv({ STRIPE_SECRET_KEY: undefined }),
      getUserSubscriptionSummary: async () => ({
        ok: true,
        row: {
          user_id: "google-user-123",
          provider: "stripe",
          provider_subscription_id: "sub_no_secret",
          provider_customer_id: "cus_1",
          price_id: "price_monthly_799",
          status: "active",
          cancel_at_period_end: false,
          current_period_end: null,
          grace_ends_at: null,
          last_event_created: 100,
        },
      }),
      deleteUserAccountData: async (_url, _key, params) => {
        missingSecretError = params.pendingCancelError ?? null;
        missingSecretSubId = params.pendingCancelSubscriptionId ?? null;
        return { ok: true, billingCancellationPending: true };
      },
    }),
  );
  assert.equal(missingSecretRes.status, 200);
  assert.deepEqual(await missingSecretRes.json(), {
    deleted: true,
    googleRevoked: true,
    billingCancellationPending: true,
  });
  assert.equal(missingSecretError, "missing-stripe-secret");
  assert.equal(missingSecretSubId, "sub_no_secret");

  // Concurrent checkout race resolved atomically inside RPC bubbles up billingCancellationPending: true
  const concurrentRes = await handleDeleteAccountRequest(
    createPostRequest({}),
    createDeps({
      getUserSubscriptionSummary: async () => ({ ok: true, row: null }),
      deleteUserAccountData: async () => ({ ok: true, billingCancellationPending: true }),
    }),
  );
  assert.equal(concurrentRes.status, 200);
  assert.deepEqual(await concurrentRes.json(), {
    deleted: true,
    googleRevoked: true,
    billingCancellationPending: true,
  });
});

Deno.test("re-authenticating with the same Google sub after delete-account preserves consumed FreeAllowance via identical HMAC digest", async () => {
  const pepper = "test-pepper-secret-must-be-at-least-32-chars-long";
  const persistedAllowanceByDigest = new Map<string, { coachUsed: number; classifyUsed: number }>();
  const seedDigest = await computeSubjectDigest("google-sub-returning", pepper);
  persistedAllowanceByDigest.set(seedDigest, { coachUsed: 30, classifyUsed: 14 });

  const deleteRes = await handleDeleteAccountRequest(
    createPostRequest({}),
    createDeps({
      verifyCaller: async () => ({ userId: "google-sub-returning" }),
    }),
  );
  assert.equal(deleteRes.status, 200);

  let lookedUpDigest: string | null = null;
  const billingStatusRes = await handleBillingRequest(
    new Request("https://example.supabase.co/functions/v1/billing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer ya29.reauth-token",
      },
      body: JSON.stringify({ action: "status" }),
    }),
    {
      getEnv: (key) => {
        if (key === "ABUSE_PREVENTION_PEPPER") return pepper;
        return createTestEnv()(key);
      },
      verifyCaller: async () => ({ userId: "google-sub-returning" }),
      getEntitlementStatus: async (_url, _key, params) => {
        lookedUpDigest = params.subjectDigest;
        const consumed = persistedAllowanceByDigest.get(params.subjectDigest) ?? {
          coachUsed: 0,
          classifyUsed: 0,
        };
        return {
          entitlement_source: "none",
          can_use_coach: false,
          can_use_classify: true,
          evaluated_at: "2026-11-27T21:00:00.000Z",
          free_coach_used: consumed.coachUsed,
          free_coach_limit: 30,
          free_classify_used: consumed.classifyUsed,
          free_classify_limit: 40,
          subscription_status: null,
          cancel_at_period_end: false,
          current_period_end: null,
          grace_ends_at: null,
          invite_expires_at: null,
          has_customer_portal: false,
        };
      },
    },
  );

  assert.equal(billingStatusRes.status, 200);
  assert.equal(lookedUpDigest, seedDigest);
  const billingJson = (await billingStatusRes.json()) as {
    entitlement: {
      source: string;
      canUseCoach: boolean;
      freeAllowance: { coachUsed: number; classifyUsed: number };
    };
  };
  assert.equal(billingJson.entitlement.source, "none");
  assert.equal(billingJson.entitlement.canUseCoach, false);
  assert.equal(billingJson.entitlement.freeAllowance.coachUsed, 30);
  assert.equal(billingJson.entitlement.freeAllowance.classifyUsed, 14);
});
