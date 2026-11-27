import assert from "node:assert/strict";
import { formatEntitlementPayload } from "./entitlement.ts";
import {
  type AuthorizeAiRequestRow,
  authorizeAiRequest,
  deriveUsageDateFromResetAt,
  formatQuotaPayload,
  getEntitlementStatus,
  refundQuota,
} from "./quota.ts";

const SUPABASE_URL = "https://example.supabase.co";
const SERVICE_KEY = "service-role-secret";
const USER_ID = "google-sub-sensitive-999";
const SUBJECT_DIGEST = "v1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

Deno.test("formatQuotaPayload, formatEntitlementPayload, and deriveUsageDateFromResetAt map fields accurately", () => {
  const row: AuthorizeAiRequestRow = {
    allowed: true,
    denial_reason: null,
    admitted_source: "free_allowance",
    current_count: 3,
    daily_limit: 5,
    reset_at: "2026-11-27T00:00:00.000Z",
    global_capped: false,
    entitlement_source: "free_allowance",
    can_use_coach: true,
    can_use_classify: true,
    evaluated_at: "2026-11-26T12:00:00.000Z",
    free_coach_used: 3,
    free_coach_limit: 30,
    free_classify_used: 1,
    free_classify_limit: 40,
  };

  assert.deepEqual(formatQuotaPayload(row), {
    currentCount: 3,
    dailyLimit: 5,
    resetAt: "2026-11-27T00:00:00.000Z",
  });

  assert.deepEqual(formatEntitlementPayload(row), {
    source: "free_allowance",
    canUseCoach: true,
    canUseClassify: true,
    evaluatedAt: "2026-11-26T12:00:00.000Z",
    freeAllowance: {
      coachUsed: 3,
      coachLimit: 30,
      classifyUsed: 1,
      classifyLimit: 40,
    },
    subscription: null,
    inviteGrant: null,
    hasCustomerPortal: false,
  });

  assert.equal(deriveUsageDateFromResetAt("2026-11-16T00:00:00.000Z"), "2026-11-15");
  assert.equal(deriveUsageDateFromResetAt("2026-01-01T00:00:00.000Z"), "2025-12-31");
  assert.equal(deriveUsageDateFromResetAt("not-a-timestamp"), undefined);

  // Nullable SQL column `invite_expires_at: null` on non-invite users must NOT produce inviteGrant object
  const nonInviteWithNullExpiry = formatEntitlementPayload({
    ...row,
    invite_expires_at: null,
  });
  assert.equal(nonInviteWithNullExpiry.inviteGrant, null);

  // Unlimited invite grant (`entitlement_source = 'invite_grant'` with `invite_expires_at: null`) keeps inviteGrant object
  const unlimitedInvite = formatEntitlementPayload({
    ...row,
    entitlement_source: "invite_grant",
    invite_expires_at: null,
  });
  assert.deepEqual(unlimitedInvite.inviteGrant, { expiresAt: null });
});

Deno.test("authorizeAiRequest and getEntitlementStatus send service_role RPC requests", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedBody = "";

  const authorizeRow: AuthorizeAiRequestRow = {
    allowed: false,
    denial_reason: "payment-required",
    admitted_source: "none",
    current_count: 5,
    daily_limit: 5,
    reset_at: "2026-11-27T00:00:00.000Z",
    global_capped: false,
    entitlement_source: "free_allowance",
    can_use_coach: false,
    can_use_classify: true,
    evaluated_at: "2026-11-26T12:00:00.000Z",
    free_coach_used: 30,
    free_coach_limit: 30,
    free_classify_used: 10,
    free_classify_limit: 40,
  };

  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedBody = String(init?.body ?? "");
    return new Response(JSON.stringify([authorizeRow]), { status: 200 });
  };

  try {
    const authRes = await authorizeAiRequest(SUPABASE_URL, SERVICE_KEY, {
      userId: USER_ID,
      subjectDigest: SUBJECT_DIGEST,
      previousSubjectDigest: null,
      kind: "coach",
      paidDailyLimit: 15,
      freeDailyLimit: 5,
    });

    assert.deepEqual(authRes, authorizeRow);
    assert.equal(capturedUrl, `${SUPABASE_URL}/rest/v1/rpc/authorize_ai_request`);
    assert.deepEqual(JSON.parse(capturedBody), {
      p_user_id: USER_ID,
      p_subject_digest: SUBJECT_DIGEST,
      p_previous_subject_digest: null,
      p_kind: "coach",
      p_paid_daily_limit: 15,
      p_free_daily_limit: 5,
    });

    await getEntitlementStatus(SUPABASE_URL, SERVICE_KEY, {
      userId: USER_ID,
      subjectDigest: SUBJECT_DIGEST,
      previousSubjectDigest: "v1:prev",
    });
    assert.equal(capturedUrl, `${SUPABASE_URL}/rest/v1/rpc/get_entitlement_status`);
    assert.deepEqual(JSON.parse(capturedBody), {
      p_user_id: USER_ID,
      p_subject_digest: SUBJECT_DIGEST,
      p_previous_subject_digest: "v1:prev",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("refundQuota passes free-allowance refund params and logs errors without PII", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const originalError = console.error;
  const capturedBodies: Array<Record<string, unknown>> = [];
  const warnCalls: unknown[][] = [];

  console.warn = (...args: unknown[]) => {
    warnCalls.push(args);
  };
  console.error = () => {};

  let nextStatus = 204;
  globalThis.fetch = async (_input, init) => {
    capturedBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response(null, { status: nextStatus });
  };

  try {
    await refundQuota(SUPABASE_URL, SERVICE_KEY, {
      userId: USER_ID,
      kind: "coach",
      usageDate: "2026-11-26",
      subjectDigest: SUBJECT_DIGEST,
      refundFreeAllowance: true,
    });

    assert.deepEqual(capturedBodies[0], {
      p_user_id: USER_ID,
      p_kind: "coach",
      p_usage_date: "2026-11-26",
      p_subject_digest: SUBJECT_DIGEST,
      p_refund_free_allowance: true,
    });

    nextStatus = 503;
    await refundQuota(SUPABASE_URL, SERVICE_KEY, {
      userId: USER_ID,
      kind: "classify",
      refundFreeAllowance: false,
    });
    assert.equal(warnCalls.length, 1);
    assert.equal(JSON.stringify(warnCalls[0]).includes(USER_ID), false);
    assert.equal(JSON.stringify(warnCalls[0]).includes(SUBJECT_DIGEST), false);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    console.error = originalError;
  }
});
