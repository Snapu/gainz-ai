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
  extraHeaders: Record<string, string> = {},
): Request {
  return new Request(BILLING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
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

Deno.test("handleBillingRequest handles redeem-invite rate limiting with HMAC-hashed user/IP keys", async () => {
  const rateLimitCalls: Array<{ userKey: string; ipKey?: string | null }> = [];

  const rateLimitedRes = await handleBillingRequest(
    createPostRequest({ action: "redeem-invite", code: "BETA2026" }, "ya29.valid-access-token", {
      "cf-connecting-ip": "203.0.113.42",
    }),
    createDeps({
      checkInviteRateLimit: async (_url, _key, params) => {
        rateLimitCalls.push(params);
        return "rate-limited";
      },
    }),
  );

  assert.equal(rateLimitedRes.status, 429);
  assert.deepEqual(await rateLimitedRes.json(), { error: "rate-limit-exceeded" });
  const captured = rateLimitCalls[0];
  assert.ok(captured);
  assert.match(captured.userKey, /^u:v1:[0-9a-f]{64}$/);
  assert.match(captured.ipKey ?? "", /^ip:v1:[0-9a-f]{64}$/);
  assert.equal(captured.ipKey?.includes("203.0.113.42"), false);

  const errorRes = await handleBillingRequest(
    createPostRequest({ action: "redeem-invite", code: "BETA2026" }),
    createDeps({
      checkInviteRateLimit: async () => "error",
    }),
  );
  assert.equal(errorRes.status, 500);
  assert.deepEqual(await errorRes.json(), { error: "billing-unavailable" });
});

Deno.test("handleBillingRequest validates redeem-invite codes, maps typed errors, and returns updated invite_grant entitlement", async () => {
  const emptyCodeRes = await handleBillingRequest(
    createPostRequest({ action: "redeem-invite", code: "   " }),
    createDeps({
      checkInviteRateLimit: async () => "allowed",
    }),
  );
  assert.equal(emptyCodeRes.status, 400);
  assert.deepEqual(await emptyCodeRes.json(), { error: "invite-invalid" });

  let redeemCalledForShort = false;
  const shortCodeRes = await handleBillingRequest(
    createPostRequest({ action: "redeem-invite", code: "ab" }),
    createDeps({
      checkInviteRateLimit: async () => "allowed",
      redeemInviteCode: async () => {
        redeemCalledForShort = true;
        return { ok: true, inviteExpiresAt: null };
      },
    }),
  );
  assert.equal(shortCodeRes.status, 400);
  assert.deepEqual(await shortCodeRes.json(), { error: "invite-invalid" });
  assert.equal(redeemCalledForShort, false);

  let redeemCalledForLong = false;
  const longCodeRes = await handleBillingRequest(
    createPostRequest({ action: "redeem-invite", code: "A".repeat(65) }),
    createDeps({
      checkInviteRateLimit: async () => "allowed",
      redeemInviteCode: async () => {
        redeemCalledForLong = true;
        return { ok: true, inviteExpiresAt: null };
      },
    }),
  );
  assert.equal(longCodeRes.status, 400);
  assert.deepEqual(await longCodeRes.json(), { error: "invite-invalid" });
  assert.equal(redeemCalledForLong, false);

  const missingEntitlementRes = await handleBillingRequest(
    createPostRequest({ action: "redeem-invite", code: "BETA2026" }),
    createDeps({
      checkInviteRateLimit: async () => "allowed",
      redeemInviteCode: async () => ({ ok: true, inviteExpiresAt: null }),
      getEntitlementStatus: async () => null,
    }),
  );
  assert.equal(missingEntitlementRes.status, 500);
  assert.deepEqual(await missingEntitlementRes.json(), { error: "billing-unavailable" });

  const unknownErrorRes = await handleBillingRequest(
    createPostRequest({ action: "redeem-invite", code: "BETA2026" }),
    createDeps({
      checkInviteRateLimit: async () => "allowed",
      redeemInviteCode: async () => ({
        ok: false,
        error: "unexpected-future-error" as never,
      }),
    }),
  );
  assert.equal(unknownErrorRes.status, 500);
  assert.deepEqual(await unknownErrorRes.json(), { error: "unexpected-future-error" });

  const errorStatusMap = [
    ["invite-invalid", 400],
    ["invite-exhausted", 409],
    ["invite-already-redeemed", 409],
    ["invite-expired", 410],
    ["billing-unavailable", 500],
  ] as const;

  for (const [errorCode, expectedStatus] of errorStatusMap) {
    const res = await handleBillingRequest(
      createPostRequest({ action: "redeem-invite", code: "beta2026" }),
      createDeps({
        checkInviteRateLimit: async () => "allowed",
        redeemInviteCode: async () => ({ ok: false, error: errorCode }),
      }),
    );
    assert.equal(res.status, expectedStatus);
    assert.deepEqual(await res.json(), { error: errorCode });
  }

  let redeemedParams: { userId: string; code: string } | null = null;
  const okRes = await handleBillingRequest(
    createPostRequest({ action: "redeem-invite", code: " beta2026 " }),
    createDeps({
      checkInviteRateLimit: async () => "allowed",
      redeemInviteCode: async (_url, _key, params) => {
        redeemedParams = params;
        return { ok: true, inviteExpiresAt: "2026-12-27T00:00:00.000Z" };
      },
      getEntitlementStatus: async () => ({
        entitlement_source: "invite_grant",
        can_use_coach: true,
        can_use_classify: true,
        evaluated_at: "2026-11-27T16:00:00.000Z",
        free_coach_used: 4,
        free_coach_limit: 30,
        free_classify_used: 2,
        free_classify_limit: 40,
        invite_expires_at: "2026-12-27T00:00:00.000Z",
      }),
    }),
  );

  assert.equal(okRes.status, 200);
  assert.deepEqual(redeemedParams, { userId: "google-sub-123", code: "BETA2026" });
  assert.deepEqual(await okRes.json(), {
    entitlement: {
      source: "invite_grant",
      canUseCoach: true,
      canUseClassify: true,
      evaluatedAt: "2026-11-27T16:00:00.000Z",
      freeAllowance: {
        coachUsed: 4,
        coachLimit: 30,
        classifyUsed: 2,
        classifyLimit: 40,
      },
      subscription: null,
      inviteGrant: {
        expiresAt: "2026-12-27T00:00:00.000Z",
      },
      hasCustomerPortal: false,
    },
  });
});

Deno.test("handleBillingRequest checkout binds server config, prevents duplicate subscriptions across cancelling/past_due states, and reuses customer after canceled", async () => {
  const stripeEnv = {
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_MONTHLY_PRICE_ID: "price_monthly_799",
    APP_PUBLIC_URL: "https://gainz.example.com/",
  };

  // Fresh checkout uses strict APP_PUBLIC_URL (ignores spoofable Origin/body URLs) and binds user_id
  let capturedCheckoutParams: Record<string, unknown> | null = null;
  const freshCheckoutRes = await handleBillingRequest(
    createPostRequest(
      { action: "checkout", successUrl: "https://evil.com" },
      "ya29.valid-access-token",
      { Origin: "https://evil.com" },
    ),
    createDeps({
      getEnv: createTestEnv(stripeEnv),
      getUserSubscriptionSummary: async () => ({ ok: true, row: null }),
      createManagedCheckoutSession: async (_key, params) => {
        capturedCheckoutParams = params;
        return { ok: true, url: "https://checkout.stripe.com/c/pay/cs_new" };
      },
    }),
  );
  assert.equal(freshCheckoutRes.status, 200);
  assert.deepEqual(await freshCheckoutRes.json(), {
    checkoutUrl: "https://checkout.stripe.com/c/pay/cs_new",
    redirectedToPortal: false,
  });
  assert.deepEqual(capturedCheckoutParams, {
    priceId: "price_monthly_799",
    userId: "google-sub-123",
    customerId: null,
    successUrl: "https://gainz.example.com/?checkout=success",
    cancelUrl: "https://gainz.example.com/?checkout=cancelled",
  });

  // Active subscription with cancel_at_period_end=true OR past_due redirects to Customer Portal
  for (const status of ["active", "trialing", "past_due", "unpaid", "paused"] as const) {
    let portalCustomer: string | null = null;
    const dupGuardRes = await handleBillingRequest(
      createPostRequest({ action: "checkout" }),
      createDeps({
        getEnv: createTestEnv(stripeEnv),
        getUserSubscriptionSummary: async () => ({
          ok: true,
          row: {
            user_id: "google-sub-123",
            provider: "stripe",
            provider_subscription_id: "sub_existing_1",
            provider_customer_id: "cus_existing_1",
            price_id: "price_monthly_799",
            status,
            cancel_at_period_end: status === "active",
            current_period_end: "2026-12-27T00:00:00.000Z",
            grace_ends_at: status === "past_due" ? "2026-11-30T00:00:00.000Z" : null,
            last_event_created: 100,
          },
        }),
        createCustomerPortalSession: async (_key, params) => {
          portalCustomer = params.customerId;
          return { ok: true, url: "https://billing.stripe.com/p/session/bps_dup_guard" };
        },
        createManagedCheckoutSession: async () => {
          throw new Error("must not create a duplicate checkout session");
        },
      }),
    );
    assert.equal(dupGuardRes.status, 200);
    assert.equal(portalCustomer, "cus_existing_1");
    assert.deepEqual(await dupGuardRes.json(), {
      checkoutUrl: "https://billing.stripe.com/p/session/bps_dup_guard",
      redirectedToPortal: true,
    });
  }

  // Re-subscribing after canceled reuses existing customerId
  let reusedCustomer: string | null | undefined = null;
  const resubRes = await handleBillingRequest(
    createPostRequest({ action: "checkout" }),
    createDeps({
      getEnv: createTestEnv(stripeEnv),
      getUserSubscriptionSummary: async () => ({
        ok: true,
        row: {
          user_id: "google-sub-123",
          provider: "stripe",
          provider_subscription_id: "sub_old_canceled",
          provider_customer_id: "cus_returning_99",
          price_id: "price_monthly_799",
          status: "canceled",
          cancel_at_period_end: false,
          current_period_end: "2026-11-01T00:00:00.000Z",
          grace_ends_at: null,
          last_event_created: 90,
        },
      }),
      createManagedCheckoutSession: async (_key, params) => {
        reusedCustomer = params.customerId;
        return { ok: true, url: "https://checkout.stripe.com/c/pay/cs_resub" };
      },
    }),
  );
  assert.equal(resubRes.status, 200);
  assert.equal(reusedCustomer, "cus_returning_99");
});

Deno.test("handleBillingRequest portal mints Customer Portal sessions for active and canceled customers and returns 404 when absent", async () => {
  const stripeEnv = {
    STRIPE_SECRET_KEY: "sk_test_123",
    APP_PUBLIC_URL: "https://gainz.example.com",
  };

  const missingRes = await handleBillingRequest(
    createPostRequest({ action: "portal" }),
    createDeps({
      getEnv: createTestEnv(stripeEnv),
      getUserSubscriptionSummary: async () => ({ ok: true, row: null }),
    }),
  );
  assert.equal(missingRes.status, 404);
  assert.deepEqual(await missingRes.json(), { error: "no-customer-portal" });

  let capturedReturnUrl = "";
  const canceledCustomerPortalRes = await handleBillingRequest(
    createPostRequest({ action: "portal" }),
    createDeps({
      getEnv: createTestEnv(stripeEnv),
      getUserSubscriptionSummary: async () => ({
        ok: true,
        row: {
          user_id: "google-sub-123",
          provider: "stripe",
          provider_subscription_id: "sub_canceled",
          provider_customer_id: "cus_past_subscriber",
          price_id: "price_monthly_799",
          status: "canceled",
          cancel_at_period_end: false,
          current_period_end: "2026-10-01T00:00:00.000Z",
          grace_ends_at: null,
          last_event_created: 50,
        },
      }),
      createCustomerPortalSession: async (_key, params) => {
        capturedReturnUrl = params.returnUrl;
        return { ok: true, url: "https://billing.stripe.com/p/session/bps_receipts" };
      },
    }),
  );
  assert.equal(canceledCustomerPortalRes.status, 200);
  assert.equal(capturedReturnUrl, "https://gainz.example.com/");
  assert.deepEqual(await canceledCustomerPortalRes.json(), {
    portalUrl: "https://billing.stripe.com/p/session/bps_receipts",
  });
});

Deno.test("handleBillingRequest returns 503 for checkout and portal when Stripe config is unset while status succeeds", async () => {
  const statusRes = await handleBillingRequest(
    createPostRequest({ action: "status" }),
    createDeps(),
  );
  assert.equal(statusRes.status, 200);

  const checkoutUnconfigured = await handleBillingRequest(
    createPostRequest({ action: "checkout" }),
    createDeps(),
  );
  assert.equal(checkoutUnconfigured.status, 503);
  assert.deepEqual(await checkoutUnconfigured.json(), { error: "billing-unavailable" });

  const portalUnconfigured = await handleBillingRequest(
    createPostRequest({ action: "portal" }),
    createDeps(),
  );
  assert.equal(portalUnconfigured.status, 503);
  assert.deepEqual(await portalUnconfigured.json(), { error: "billing-unavailable" });
});
