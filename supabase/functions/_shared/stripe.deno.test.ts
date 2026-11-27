import assert from "node:assert/strict";
import {
  createCustomerPortalSession,
  createManagedCheckoutSession,
  extractSubscriptionIdFromStripeEvent,
  fetchCanonicalSubscription,
  isTrustedStripeUrl,
  normalizeAppPublicUrl,
  STRIPE_API_VERSION,
  verifyStripeWebhookSignature,
} from "./stripe.ts";

async function signPayload(timestamp: number, rawBody: string, secret: string): Promise<string> {
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
  return hex;
}

Deno.test("isTrustedStripeUrl and normalizeAppPublicUrl enforce strict HTTPS and clean URLs", () => {
  assert.equal(isTrustedStripeUrl("https://checkout.stripe.com/c/pay/cs_test_123"), true);
  assert.equal(isTrustedStripeUrl("https://billing.stripe.com/p/session/bps_123"), true);
  assert.equal(isTrustedStripeUrl("https://stripe.com/checkout"), true);
  assert.equal(isTrustedStripeUrl("http://checkout.stripe.com/c/pay/cs_test_123"), false);
  assert.equal(isTrustedStripeUrl("https://evil-stripe.com/phish"), false);
  assert.equal(isTrustedStripeUrl("https://user:pass@checkout.stripe.com/c/pay"), false);

  assert.equal(normalizeAppPublicUrl("https://gainz.example.com/"), "https://gainz.example.com");
  assert.equal(
    normalizeAppPublicUrl("https://gainz.example.com/app/"),
    "https://gainz.example.com/app",
  );
  assert.equal(normalizeAppPublicUrl("http://localhost:5173/"), "http://localhost:5173");
  assert.equal(normalizeAppPublicUrl("http://gainz.example.com"), null);
  assert.equal(normalizeAppPublicUrl("https://gainz.example.com/?foo=bar"), null);
  assert.equal(normalizeAppPublicUrl("https://gainz.example.com/#hash"), null);
});

Deno.test("verifyStripeWebhookSignature validates t+v1 HMAC, multiple v1 rotation signatures, and 300s replay tolerance", async () => {
  const secret = "whsec_test_signing_secret_0123456789";
  const body = JSON.stringify({ id: "evt_123", type: "customer.subscription.updated" });
  const now = 1_764_270_000;
  const sig = await signPayload(now, body, secret);

  assert.equal(
    await verifyStripeWebhookSignature(body, `t=${now},v1=${sig}`, secret, { nowSeconds: now }),
    true,
  );
  // Key rotation emits multiple v1 values; matching one succeeds
  assert.equal(
    await verifyStripeWebhookSignature(body, `t=${now},v1=${"0".repeat(64)},v1=${sig}`, secret, {
      nowSeconds: now + 300,
    }),
    true,
  );
  // Replay outside 300s window is rejected
  assert.equal(
    await verifyStripeWebhookSignature(
      body,
      `t=${now - 301},v1=${await signPayload(now - 301, body, secret)}`,
      secret,
      {
        nowSeconds: now,
      },
    ),
    false,
  );
  // Future timestamp outside tolerance is rejected
  assert.equal(
    await verifyStripeWebhookSignature(
      body,
      `t=${now + 301},v1=${await signPayload(now + 301, body, secret)}`,
      secret,
      {
        nowSeconds: now,
      },
    ),
    false,
  );
  // Tampered raw body fails HMAC verification
  assert.equal(
    await verifyStripeWebhookSignature(`${body} `, `t=${now},v1=${sig}`, secret, {
      nowSeconds: now,
    }),
    false,
  );
});

Deno.test("extractSubscriptionIdFromStripeEvent handles post-2025 Basil+ invoices, legacy invoices, checkout, and subscriptions", () => {
  assert.equal(
    extractSubscriptionIdFromStripeEvent({
      id: "evt_1",
      type: "invoice.paid",
      created: 100,
      data: {
        object: {
          parent: { subscription_details: { subscription: "sub_basil123" } },
        },
      },
    }),
    "sub_basil123",
  );

  assert.equal(
    extractSubscriptionIdFromStripeEvent({
      id: "evt_2",
      type: "invoice.payment_failed",
      created: 100,
      data: { object: { subscription: "sub_legacy456" } },
    }),
    "sub_legacy456",
  );

  assert.equal(
    extractSubscriptionIdFromStripeEvent({
      id: "evt_3",
      type: "checkout.session.completed",
      created: 100,
      data: { object: { mode: "subscription", subscription: "sub_chk789" } },
    }),
    "sub_chk789",
  );

  assert.equal(
    extractSubscriptionIdFromStripeEvent({
      id: "evt_4",
      type: "checkout.session.completed",
      created: 100,
      data: { object: { mode: "payment", subscription: null } },
    }),
    null,
  );

  assert.equal(
    extractSubscriptionIdFromStripeEvent({
      id: "evt_5",
      type: "customer.subscription.deleted",
      created: 100,
      data: { object: { id: "sub_del001" } },
    }),
    "sub_del001",
  );
});

Deno.test("createManagedCheckoutSession, createCustomerPortalSession, and fetchCanonicalSubscription pin Stripe-Version and enforce contracts", async () => {
  const originalFetch = globalThis.fetch;
  const capturedRequests: Array<{ url: string; method: string; headers: Headers; body: string }> =
    [];
  let nextResponse = () =>
    new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_test_ok" }), {
      status: 200,
    });

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    capturedRequests.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : "",
    });
    return nextResponse();
  }) as typeof fetch;

  try {
    const checkoutRes = await createManagedCheckoutSession("sk_test_123", {
      priceId: "price_monthly_799",
      userId: "google-sub-42",
      customerId: "cus_existing_77",
      successUrl: "https://gainz.app/?checkout=success",
      cancelUrl: "https://gainz.app/?checkout=cancelled",
    });
    assert.deepEqual(checkoutRes, {
      ok: true,
      url: "https://checkout.stripe.com/c/pay/cs_test_ok",
    });
    assert.equal(capturedRequests[0]?.headers.get("stripe-version"), STRIPE_API_VERSION);
    const params = new URLSearchParams(capturedRequests[0]?.body);
    assert.equal(params.get("managed_payments[enabled]"), "true");
    assert.equal(params.get("client_reference_id"), "google-sub-42");
    assert.equal(params.get("subscription_data[metadata][user_id]"), "google-sub-42");
    assert.equal(params.get("customer"), "cus_existing_77");

    nextResponse = () =>
      new Response(JSON.stringify({ url: "https://evil.example.com/steal" }), { status: 200 });
    assert.deepEqual(
      await createCustomerPortalSession("sk_test_123", {
        customerId: "cus_existing_77",
        returnUrl: "https://gainz.app/",
      }),
      { ok: false, error: "billing-unavailable" },
    );

    // Canonical GET with Basil+ items.data[0].current_period_end
    nextResponse = () =>
      new Response(
        JSON.stringify({
          id: "sub_basil99",
          customer: "cus_99",
          status: "active",
          cancel_at_period_end: true,
          metadata: { user_id: "google-sub-42" },
          items: {
            data: [
              {
                price: { id: "price_monthly_799" },
                current_period_end: 1_767_000_000,
              },
            ],
          },
        }),
        { status: 200 },
      );
    const canonical = await fetchCanonicalSubscription("sk_test_123", "sub_basil99");
    assert.deepEqual(canonical, {
      ok: true,
      kind: "subscription",
      subscription: {
        id: "sub_basil99",
        userId: "google-sub-42",
        customerId: "cus_99",
        priceId: "price_monthly_799",
        status: "active",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date(1_767_000_000 * 1000).toISOString(),
      },
    });
    assert.equal(capturedRequests.at(-1)?.headers.get("stripe-version"), STRIPE_API_VERSION);

    // Missing metadata.user_id fails closed (never falls back to email)
    nextResponse = () =>
      new Response(
        JSON.stringify({
          id: "sub_nometa",
          customer: { id: "cus_99", email: "user@example.com" },
          customer_email: "user@example.com",
          status: "active",
          metadata: {},
          items: {
            data: [{ price: { id: "price_monthly_799" }, current_period_end: 1_767_000_000 }],
          },
        }),
        { status: 200 },
      );
    assert.deepEqual(await fetchCanonicalSubscription("sk_test_123", "sub_nometa"), {
      ok: false,
      error: "missing-user-metadata",
    });

    // Accepts underscored sub_* IDs (e.g., sandbox/prefixed IDs) while rejecting path traversal
    nextResponse = () =>
      new Response(
        JSON.stringify({
          id: "sub_sandbox_01",
          customer: "cus_99",
          status: "active",
          metadata: { user_id: "google-sub-42" },
          items: {
            data: [{ price: { id: "price_monthly_799" }, current_period_end: 1_767_000_000 }],
          },
        }),
        { status: 200 },
      );
    const underscoredRes = await fetchCanonicalSubscription("sk_test_123", "sub_sandbox_01");
    assert.equal(underscoredRes.ok && underscoredRes.kind === "subscription", true);
    assert.deepEqual(await fetchCanonicalSubscription("sk_test_123", "sub_../evil"), {
      ok: true,
      kind: "ignored",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
