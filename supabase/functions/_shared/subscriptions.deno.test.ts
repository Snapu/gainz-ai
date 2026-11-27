import assert from "node:assert/strict";
import {
  deletePendingSubscriptionCancellation,
  deleteUserAccountData,
  hasPendingSubscriptionCancellation,
  syncSubscriptionWebhook,
} from "./subscriptions.ts";

const SUPABASE_URL = "https://project.supabase.co";
const SERVICE_KEY = "service-role-secret";

Deno.test("subscriptions RPC wrappers handle tombstones, deletion RPC payload, and failures cleanly", async () => {
  const originalFetch = globalThis.fetch;
  const capturedRequests: Array<{ url: string; method: string; body: string }> = [];
  let nextResponse = () => new Response(JSON.stringify([]), { status: 200 });

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    capturedRequests.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : "",
    });
    return nextResponse();
  }) as typeof fetch;

  try {
    nextResponse = () =>
      new Response(JSON.stringify([{ provider_subscription_id: "sub_tomb_1" }]), { status: 200 });
    assert.deepEqual(
      await hasPendingSubscriptionCancellation(SUPABASE_URL, SERVICE_KEY, "sub_tomb_1"),
      { ok: true, pending: true },
    );
    assert.ok(
      capturedRequests
        .at(-1)
        ?.url.includes(
          "/rest/v1/pending_subscription_cancellations?provider_subscription_id=eq.sub_tomb_1",
        ),
    );

    nextResponse = () => new Response(JSON.stringify([]), { status: 200 });
    assert.deepEqual(
      await hasPendingSubscriptionCancellation(SUPABASE_URL, SERVICE_KEY, "sub_none"),
      { ok: true, pending: false },
    );

    nextResponse = () => new Response("db down", { status: 500 });
    assert.deepEqual(
      await hasPendingSubscriptionCancellation(SUPABASE_URL, SERVICE_KEY, "sub_err"),
      { ok: false },
    );

    nextResponse = () => new Response(null, { status: 204 });
    assert.equal(
      await deletePendingSubscriptionCancellation(SUPABASE_URL, SERVICE_KEY, "sub_tomb_1"),
      true,
    );
    assert.equal(capturedRequests.at(-1)?.method, "DELETE");

    nextResponse = () => new Response("err", { status: 500 });
    assert.equal(
      await deletePendingSubscriptionCancellation(SUPABASE_URL, SERVICE_KEY, "sub_tomb_1"),
      false,
    );

    nextResponse = () =>
      new Response(JSON.stringify([{ billing_cancellation_pending: true }]), { status: 200 });
    assert.deepEqual(
      await deleteUserAccountData(SUPABASE_URL, SERVICE_KEY, {
        userId: "user-123",
        canceledSubscriptionId: null,
        pendingCancelSubscriptionId: "sub_outage",
        pendingCancelError: "stripe-http-503",
      }),
      { ok: true, billingCancellationPending: true },
    );
    assert.deepEqual(JSON.parse(capturedRequests.at(-1)?.body ?? "{}"), {
      p_user_id: "user-123",
      p_canceled_subscription_id: null,
      p_pending_cancel_subscription_id: "sub_outage",
      p_pending_cancel_error: "stripe-http-503",
    });

    nextResponse = () =>
      new Response(JSON.stringify([{ billing_cancellation_pending: false }]), { status: 200 });
    assert.deepEqual(
      await deleteUserAccountData(SUPABASE_URL, SERVICE_KEY, {
        userId: "user-123",
        canceledSubscriptionId: "sub_ok",
      }),
      { ok: true, billingCancellationPending: false },
    );

    nextResponse = () => new Response(JSON.stringify([{}]), { status: 200 });
    assert.deepEqual(
      await deleteUserAccountData(SUPABASE_URL, SERVICE_KEY, { userId: "user-123" }),
      { ok: false },
    );

    nextResponse = () =>
      new Response(
        JSON.stringify([{ already_processed: false, applied: false, tombstoned: true }]),
        { status: 200 },
      );
    assert.deepEqual(
      await syncSubscriptionWebhook(SUPABASE_URL, SERVICE_KEY, {
        eventId: "evt_1",
        eventCreated: 100,
        userId: "user-123",
        provider: "stripe",
        providerSubscriptionId: "sub_tomb_1",
        providerCustomerId: "cus_1",
        priceId: "price_1",
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      }),
      { ok: true, alreadyProcessed: false, applied: false, tombstoned: true },
    );

    nextResponse = () => new Response("err", { status: 500 });
    assert.deepEqual(
      await syncSubscriptionWebhook(SUPABASE_URL, SERVICE_KEY, {
        eventId: "evt_2",
        eventCreated: 101,
        userId: "user-123",
        provider: "stripe",
        providerSubscriptionId: "sub_2",
        providerCustomerId: "cus_1",
        priceId: "price_1",
        status: "canceled",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      }),
      { ok: false },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
