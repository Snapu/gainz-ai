import assert from "node:assert/strict";
import { type BillingWebhookDeps, handleBillingWebhook } from "./handler.ts";

const WEBHOOK_URL = "https://example.supabase.co/functions/v1/billing-webhook";
const SUPABASE_URL = "https://project.supabase.co";
const SERVICE_KEY = "service-role-secret";
const STRIPE_SECRET_KEY = "sk_test_webhook_secret_key";
const STRIPE_WEBHOOK_SECRET = "whsec_test_webhook_secret_key";

async function signStripeHeader(
  timestamp: number,
  rawBody: string,
  secret = STRIPE_WEBHOOK_SECRET,
) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${rawBody}`),
  );
  const hex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `t=${timestamp},v1=${hex}`;
}

function createEnv(overrides: Record<string, string | undefined> = {}) {
  const vars: Record<string, string | undefined> = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    ...overrides,
  };
  return (name: string) => vars[name];
}

function createDeps(overrides: Partial<BillingWebhookDeps> = {}): BillingWebhookDeps {
  return {
    getEnv: createEnv(),
    nowSeconds: () => 1_764_270_000,
    hasPendingSubscriptionCancellation: async () => ({ ok: true, pending: false }),
    hasProcessedWebhookEvent: async () => ({ ok: true, processed: false }),
    ...overrides,
  };
}

Deno.test("handleBillingWebhook rejects non-POST methods, missing config, oversized bodies, and invalid/replayed HMAC signatures", async () => {
  const getRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, { method: "GET" }),
    createDeps(),
  );
  assert.equal(getRes.status, 405);

  const missingConfigRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": `t=1764270000,v1=${"0".repeat(64)}` },
      body: "{}",
    }),
    createDeps({ getEnv: createEnv({ STRIPE_WEBHOOK_SECRET: undefined }) }),
  );
  assert.equal(missingConfigRes.status, 500);
  assert.deepEqual(await missingConfigRes.json(), { error: "missing-server-config" });

  const oversizedRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": `t=1764270000,v1=${"0".repeat(64)}` },
      body: "x".repeat(256 * 1024 + 1),
    }),
    createDeps(),
  );
  assert.equal(oversizedRes.status, 413);
  assert.deepEqual(await oversizedRes.json(), { error: "payload-too-large" });

  const rawBody = JSON.stringify({
    id: "evt_1",
    type: "customer.subscription.updated",
    created: 1_764_270_000,
    data: { object: { id: "sub_123" } },
  });

  const badSigRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": `t=1764270000,v1=${"0".repeat(64)}` },
      body: rawBody,
    }),
    createDeps(),
  );
  assert.equal(badSigRes.status, 400);
  assert.deepEqual(await badSigRes.json(), { error: "invalid-signature" });

  // Replay older than 300s is rejected even with valid mathematical HMAC
  const staleTs = 1_764_270_000 - 400;
  const staleSig = await signStripeHeader(staleTs, rawBody);
  const replayRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": staleSig },
      body: rawBody,
    }),
    createDeps(),
  );
  assert.equal(replayRes.status, 400);
  assert.deepEqual(await replayRes.json(), { error: "invalid-signature" });
});

Deno.test("handleBillingWebhook skips already processed events on read-only fast path and never burns event ID on transient Stripe GET failure", async () => {
  const rawBody = JSON.stringify({
    id: "evt_dup_check",
    type: "invoice.paid",
    created: 1_764_270_000,
    data: {
      object: {
        parent: { subscription_details: { subscription: "sub_basil_01" } },
      },
    },
  });
  const sig = await signStripeHeader(1_764_270_000, rawBody);

  // Duplicate event short-circuits without calling Stripe GET
  let fetchCalled = false;
  const dupRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": sig },
      body: rawBody,
    }),
    createDeps({
      hasProcessedWebhookEvent: async () => ({ ok: true, processed: true }),
      fetchCanonicalSubscription: async () => {
        fetchCalled = true;
        return { ok: true, kind: "ignored" };
      },
    }),
  );
  assert.equal(dupRes.status, 200);
  assert.deepEqual(await dupRes.json(), { received: true, duplicate: true });
  assert.equal(fetchCalled, false);

  // Transient Stripe GET failure returns 502 and NEVER calls syncSubscriptionWebhook (event_id remains unburned)
  let syncCalled = false;
  const retryRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": sig },
      body: rawBody,
    }),
    createDeps({
      fetchCanonicalSubscription: async () => ({ ok: false, error: "stripe-fetch-failed" }),
      syncSubscriptionWebhook: async () => {
        syncCalled = true;
        return { ok: true, alreadyProcessed: false, applied: true };
      },
    }),
  );
  assert.equal(retryRes.status, 502);
  assert.deepEqual(await retryRes.json(), { error: "stripe-fetch-failed" });
  assert.equal(syncCalled, false);
});

Deno.test("handleBillingWebhook fails closed on missing user_id metadata and syncs canonical subscription atomically (including out-of-order applied=false)", async () => {
  const rawBody = JSON.stringify({
    id: "evt_basil_invoice",
    type: "invoice.payment_failed",
    created: 1_764_270_010,
    data: {
      object: {
        parent: { subscription_details: { subscription: "sub_basil_99" } },
      },
    },
  });
  const sig = await signStripeHeader(1_764_270_000, rawBody);

  let syncCalledOnMissingMeta = false;
  const missingMetaRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": sig },
      body: rawBody,
    }),
    createDeps({
      fetchCanonicalSubscription: async () => ({ ok: false, error: "missing-user-metadata" }),
      syncSubscriptionWebhook: async () => {
        syncCalledOnMissingMeta = true;
        return { ok: true, alreadyProcessed: false, applied: true };
      },
    }),
  );
  assert.equal(missingMetaRes.status, 400);
  assert.deepEqual(await missingMetaRes.json(), { error: "missing-user-metadata" });
  assert.equal(syncCalledOnMissingMeta, false);

  let capturedSyncParams: Record<string, unknown> | null = null;
  const syncedRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": sig },
      body: rawBody,
    }),
    createDeps({
      fetchCanonicalSubscription: async () => ({
        ok: true,
        kind: "subscription",
        subscription: {
          id: "sub_basil_99",
          userId: "google-sub-user-7",
          customerId: "cus_7",
          priceId: "price_monthly_799",
          status: "past_due",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: "2026-12-27T00:00:00.000Z",
        },
      }),
      syncSubscriptionWebhook: async (_url, _key, params) => {
        capturedSyncParams = params;
        return { ok: true, alreadyProcessed: false, applied: true };
      },
    }),
  );
  assert.equal(syncedRes.status, 200);
  assert.deepEqual(await syncedRes.json(), { received: true, applied: true, duplicate: false });
  assert.deepEqual(capturedSyncParams, {
    eventId: "evt_basil_invoice",
    eventCreated: 1_764_270_010,
    userId: "google-sub-user-7",
    provider: "stripe",
    providerSubscriptionId: "sub_basil_99",
    providerCustomerId: "cus_7",
    priceId: "price_monthly_799",
    status: "past_due",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: "2026-12-27T00:00:00.000Z",
  });

  // Out-of-order concurrent event recorded in processed_webhook_events but rejected by monotonic guard (applied=false)
  const staleEventRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": sig },
      body: rawBody,
    }),
    createDeps({
      fetchCanonicalSubscription: async () => ({
        ok: true,
        kind: "subscription",
        subscription: {
          id: "sub_basil_99",
          userId: "google-sub-user-7",
          customerId: "cus_7",
          priceId: "price_monthly_799",
          status: "active",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: "2026-12-27T00:00:00.000Z",
        },
      }),
      syncSubscriptionWebhook: async () => ({
        ok: true,
        alreadyProcessed: false,
        applied: false,
      }),
    }),
  );
  assert.equal(staleEventRes.status, 200);
  assert.deepEqual(await staleEventRes.json(), {
    received: true,
    applied: false,
    duplicate: false,
  });

  // Unrelated non-subscription events exit 200 ignored without querying processed_webhook_events
  const unrelatedBody = JSON.stringify({
    id: "evt_charge_1",
    type: "charge.succeeded",
    created: 1_764_270_020,
    data: { object: { id: "ch_123" } },
  });
  let fastPathCalledForIgnored = false;
  const ignoredRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": await signStripeHeader(1_764_270_000, unrelatedBody) },
      body: unrelatedBody,
    }),
    createDeps({
      hasProcessedWebhookEvent: async () => {
        fastPathCalledForIgnored = true;
        return { ok: true, processed: false };
      },
    }),
  );
  assert.equal(ignoredRes.status, 200);
  assert.deepEqual(await ignoredRes.json(), { received: true, ignored: true });
  assert.equal(fastPathCalledForIgnored, false);

  // syncSubscriptionWebhook DB failure returns 500 sync-failed
  const dbFailRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": sig },
      body: rawBody,
    }),
    createDeps({
      fetchCanonicalSubscription: async () => ({
        ok: true,
        kind: "subscription",
        subscription: {
          id: "sub_basil_99",
          userId: "google-sub-user-7",
          customerId: "cus_7",
          priceId: "price_monthly_799",
          status: "active",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: "2026-12-27T00:00:00.000Z",
        },
      }),
      syncSubscriptionWebhook: async () => ({ ok: false }),
    }),
  );
  assert.equal(dbFailRes.status, 500);
  assert.deepEqual(await dbFailRes.json(), { error: "sync-failed" });

  // Self-healing tombstone: cancels subscription on Stripe, removes tombstone, returns 200 without fetching/recreating user_subscriptions
  let canonicalCalledForTombstone = false;
  let syncCalledForTombstone = false;
  let canceledSubId: string | null = null;
  let deletedTombstoneId: string | null = null;
  const tombstoneRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": sig },
      body: rawBody,
    }),
    createDeps({
      hasPendingSubscriptionCancellation: async () => ({ ok: true, pending: true }),
      cancelStripeSubscription: async (_key, subId) => {
        canceledSubId = subId;
        return { ok: true };
      },
      deletePendingSubscriptionCancellation: async (_url, _key, subId) => {
        deletedTombstoneId = subId;
        return true;
      },
      fetchCanonicalSubscription: async () => {
        canonicalCalledForTombstone = true;
        return { ok: true, kind: "ignored" };
      },
      syncSubscriptionWebhook: async () => {
        syncCalledForTombstone = true;
        return { ok: true, alreadyProcessed: false, applied: true };
      },
    }),
  );
  assert.equal(tombstoneRes.status, 200);
  assert.deepEqual(await tombstoneRes.json(), { received: true, tombstoneCanceled: true });
  assert.equal(canceledSubId, "sub_basil_99");
  assert.equal(deletedTombstoneId, "sub_basil_99");
  assert.equal(canonicalCalledForTombstone, false);
  assert.equal(syncCalledForTombstone, false);

  // Tombstone cancellation failure returns 502 without deleting the tombstone so later webhooks retry cleanly
  let deletedOnFailure = false;
  const tombstoneRetryRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": sig },
      body: rawBody,
    }),
    createDeps({
      hasPendingSubscriptionCancellation: async () => ({ ok: true, pending: true }),
      cancelStripeSubscription: async () => ({ ok: false, error: "stripe-http-503" }),
      deletePendingSubscriptionCancellation: async () => {
        deletedOnFailure = true;
        return true;
      },
    }),
  );
  assert.equal(tombstoneRetryRes.status, 502);
  assert.deepEqual(await tombstoneRetryRes.json(), { error: "stripe-cancel-failed" });
  assert.equal(deletedOnFailure, false);
});

Deno.test("handleBillingWebhook prevents post-deletion resurrection on customer.subscription.deleted, intercepts checkout/subscription tombstones, and self-heals lock races", async () => {
  // Post-deletion customer.subscription.deleted leaves applied=false without recreating user_subscriptions
  const deletedSubBody = JSON.stringify({
    id: "evt_sub_deleted_after_erasure",
    type: "customer.subscription.deleted",
    created: 1_764_270_100,
    data: { object: { id: "sub_deleted_already" } },
  });
  const deletedRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": await signStripeHeader(1_764_270_000, deletedSubBody) },
      body: deletedSubBody,
    }),
    createDeps({
      fetchCanonicalSubscription: async () => ({
        ok: true,
        kind: "subscription",
        subscription: {
          id: "sub_deleted_already",
          userId: "erased-user-9",
          customerId: "cus_9",
          priceId: "price_monthly_799",
          status: "canceled",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: "2026-11-27T00:00:00.000Z",
        },
      }),
      syncSubscriptionWebhook: async () => ({
        ok: true,
        alreadyProcessed: false,
        applied: false,
        tombstoned: false,
      }),
    }),
  );
  assert.equal(deletedRes.status, 200);
  assert.deepEqual(await deletedRes.json(), {
    received: true,
    applied: false,
    duplicate: false,
  });

  // Tombstone interception works across checkout.session.completed and customer.subscription.updated
  for (const eventPayload of [
    {
      id: "evt_tomb_checkout",
      type: "checkout.session.completed",
      created: 1_764_270_110,
      data: { object: { mode: "subscription", subscription: "sub_tomb_checkout" } },
    },
    {
      id: "evt_tomb_updated",
      type: "customer.subscription.updated",
      created: 1_764_270_120,
      data: { object: { id: "sub_tomb_updated" } },
    },
  ]) {
    const raw = JSON.stringify(eventPayload);
    const canceled: string[] = [];
    const removed: string[] = [];
    const res = await handleBillingWebhook(
      new Request(WEBHOOK_URL, {
        method: "POST",
        headers: { "stripe-signature": await signStripeHeader(1_764_270_000, raw) },
        body: raw,
      }),
      createDeps({
        hasPendingSubscriptionCancellation: async () => ({ ok: true, pending: true }),
        cancelStripeSubscription: async (_k, subId) => {
          canceled.push(subId);
          return { ok: true };
        },
        deletePendingSubscriptionCancellation: async (_u, _k, subId) => {
          removed.push(subId);
          return true;
        },
      }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { received: true, tombstoneCanceled: true });
    assert.equal(canceled.length, 1);
    assert.equal(removed.length, 1);
  }

  // Tombstone lookup and tombstone delete DB failures return 500
  const lookupErrRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": await signStripeHeader(1_764_270_000, deletedSubBody) },
      body: deletedSubBody,
    }),
    createDeps({
      hasPendingSubscriptionCancellation: async () => ({ ok: false }),
    }),
  );
  assert.equal(lookupErrRes.status, 500);

  const removeErrRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": await signStripeHeader(1_764_270_000, deletedSubBody) },
      body: deletedSubBody,
    }),
    createDeps({
      hasPendingSubscriptionCancellation: async () => ({ ok: true, pending: true }),
      cancelStripeSubscription: async () => ({ ok: true }),
      deletePendingSubscriptionCancellation: async () => false,
    }),
  );
  assert.equal(removeErrRes.status, 500);

  // Concurrent lock race: syncSubscriptionWebhook signals tombstoned: true -> immediate Stripe cancel & tombstone delete
  let lockRaceCanceledId: string | null = null;
  let lockRaceDeletedId: string | null = null;
  const lockRaceRes = await handleBillingWebhook(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "stripe-signature": await signStripeHeader(1_764_270_000, deletedSubBody) },
      body: deletedSubBody,
    }),
    createDeps({
      fetchCanonicalSubscription: async () => ({
        ok: true,
        kind: "subscription",
        subscription: {
          id: "sub_deleted_already",
          userId: "erased-user-9",
          customerId: "cus_9",
          priceId: "price_monthly_799",
          status: "active",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: "2026-12-27T00:00:00.000Z",
        },
      }),
      syncSubscriptionWebhook: async () => ({
        ok: true,
        alreadyProcessed: false,
        applied: false,
        tombstoned: true,
      }),
      cancelStripeSubscription: async (_k, subId) => {
        lockRaceCanceledId = subId;
        return { ok: true };
      },
      deletePendingSubscriptionCancellation: async (_u, _k, subId) => {
        lockRaceDeletedId = subId;
        return true;
      },
    }),
  );
  assert.equal(lockRaceRes.status, 200);
  assert.deepEqual(await lockRaceRes.json(), { received: true, tombstoneCanceled: true });
  assert.equal(lockRaceCanceledId, "sub_deleted_already");
  assert.equal(lockRaceDeletedId, "sub_deleted_already");
});
