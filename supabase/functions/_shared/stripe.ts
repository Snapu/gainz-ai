import type { SubscriptionStatus } from "./entitlement.ts";
import { fetchWithTimeout } from "./http.ts";

export const STRIPE_API_VERSION = "2025-03-31.basil";
const STRIPE_API_TIMEOUT_MS = 10_000;
const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

const KNOWN_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set<SubscriptionStatus>([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);

export interface StripeWebhookEventLike {
  id: string;
  type: string;
  created: number;
  data?: {
    object?: Record<string, unknown>;
  };
}

export interface CanonicalStripeSubscription {
  id: string;
  userId: string;
  customerId: string;
  priceId: string;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}

export type FetchCanonicalSubscriptionResult =
  | { ok: true; kind: "subscription"; subscription: CanonicalStripeSubscription }
  | { ok: true; kind: "ignored" }
  | { ok: false; error: "missing-user-metadata" | "stripe-fetch-failed" };

export function isTrustedStripeUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    return host === "stripe.com" || host.endsWith(".stripe.com");
  } catch {
    return false;
  }
}

export function normalizeAppPublicUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      return null;
    }
    const isLocalHttp =
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    if (parsed.protocol !== "https:" && !isLocalHttp) {
      return null;
    }
    const cleanPath = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${cleanPath}`;
  } catch {
    return null;
  }
}

async function postStripeForm(
  stripeSecretKey: string,
  path: string,
  params: URLSearchParams,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchWithTimeout(
      `https://api.stripe.com${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Stripe-Version": STRIPE_API_VERSION,
        },
        body: params.toString(),
      },
      STRIPE_API_TIMEOUT_MS,
    );

    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      console.warn(`[stripe] POST ${path} failed HTTP ${res.status}`);
      return null;
    }

    const payload = (await res.json()) as unknown;
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  } catch (err) {
    console.warn(
      `[stripe] POST ${path} request error: ${err instanceof Error ? err.name : "unknown"}`,
    );
    return null;
  }
}

export async function createManagedCheckoutSession(
  stripeSecretKey: string,
  params: {
    priceId: string;
    userId: string;
    customerId?: string | null;
    successUrl: string;
    cancelUrl: string;
  },
): Promise<{ ok: true; url: string } | { ok: false; error: "billing-unavailable" }> {
  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": params.priceId,
    "line_items[0][quantity]": "1",
    "managed_payments[enabled]": "true",
    client_reference_id: params.userId,
    "subscription_data[metadata][user_id]": params.userId,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  const customerId = params.customerId?.trim();
  if (customerId) {
    form.set("customer", customerId);
  }

  const data = await postStripeForm(stripeSecretKey, "/v1/checkout/sessions", form);
  if (typeof data?.url === "string" && isTrustedStripeUrl(data.url)) {
    return { ok: true, url: data.url };
  }
  return { ok: false, error: "billing-unavailable" };
}

export async function createCustomerPortalSession(
  stripeSecretKey: string,
  params: {
    customerId: string;
    returnUrl: string;
  },
): Promise<{ ok: true; url: string } | { ok: false; error: "billing-unavailable" }> {
  const form = new URLSearchParams({
    customer: params.customerId,
    return_url: params.returnUrl,
  });

  const data = await postStripeForm(stripeSecretKey, "/v1/billing_portal/sessions", form);
  if (typeof data?.url === "string" && isTrustedStripeUrl(data.url)) {
    return { ok: true, url: data.url };
  }
  return { ok: false, error: "billing-unavailable" };
}

function readExpandableId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const id = (value as Record<string, unknown>).id;
    if (typeof id === "string") {
      const trimmed = id.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
  }
  return null;
}

export function extractSubscriptionIdFromStripeEvent(event: StripeWebhookEventLike): string | null {
  const obj = event.data?.object;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return null;
  }

  if (event.type.startsWith("customer.subscription.")) {
    const id = readExpandableId(obj.id);
    return id?.startsWith("sub_") ? id : null;
  }

  if (event.type === "checkout.session.completed") {
    if (obj.mode !== "subscription") return null;
    return readExpandableId(obj.subscription);
  }

  if (event.type.startsWith("invoice.")) {
    const parent = obj.parent as { subscription_details?: { subscription?: unknown } } | undefined;
    const sub = parent?.subscription_details?.subscription ?? obj.subscription;
    return readExpandableId(sub);
  }

  return null;
}

function parseStripePriceId(raw: Record<string, unknown>): string | null {
  const items = raw.items as { data?: Array<Record<string, unknown>> } | undefined;
  const firstItem = Array.isArray(items?.data) ? items.data[0] : undefined;
  if (firstItem) {
    const fromItem = readExpandableId(firstItem.price);
    if (fromItem) return fromItem;
  }
  return readExpandableId(raw.plan);
}

function parseStripePeriodEndIso(raw: Record<string, unknown>): string | null {
  const items = raw.items as { data?: Array<Record<string, unknown>> } | undefined;
  const firstItem = Array.isArray(items?.data) ? items.data[0] : undefined;
  const epochSeconds = firstItem?.current_period_end ?? raw.current_period_end;
  if (typeof epochSeconds === "number" && Number.isFinite(epochSeconds) && epochSeconds > 0) {
    return new Date(epochSeconds * 1000).toISOString();
  }
  return null;
}

export async function fetchCanonicalSubscription(
  stripeSecretKey: string,
  subscriptionId: string,
): Promise<FetchCanonicalSubscriptionResult> {
  if (!/^sub_[A-Za-z0-9_]+$/.test(subscriptionId)) {
    return { ok: true, kind: "ignored" };
  }

  try {
    const res = await fetchWithTimeout(
      `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Stripe-Version": STRIPE_API_VERSION,
        },
      },
      STRIPE_API_TIMEOUT_MS,
    );

    if (res.status === 404) {
      void res.body?.cancel().catch(() => {});
      return { ok: true, kind: "ignored" };
    }

    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      console.warn(`[stripe] GET subscription failed HTTP ${res.status}`);
      return { ok: false, error: "stripe-fetch-failed" };
    }

    const raw = (await res.json()) as Record<string, unknown>;
    const rawStatus = typeof raw.status === "string" ? raw.status : "";
    if (rawStatus === "incomplete" || rawStatus === "incomplete_expired") {
      return { ok: true, kind: "ignored" };
    }
    if (!KNOWN_SUBSCRIPTION_STATUSES.has(rawStatus)) {
      return { ok: false, error: "stripe-fetch-failed" };
    }

    const metadata = raw.metadata as Record<string, unknown> | undefined;
    const rawUserId = typeof metadata?.user_id === "string" ? metadata.user_id.trim() : "";
    if (!rawUserId) {
      return { ok: false, error: "missing-user-metadata" };
    }

    const customerId = readExpandableId(raw.customer);
    const priceId = parseStripePriceId(raw);
    if (!customerId || !priceId) {
      return { ok: false, error: "stripe-fetch-failed" };
    }

    return {
      ok: true,
      kind: "subscription",
      subscription: {
        id: subscriptionId,
        userId: rawUserId,
        customerId,
        priceId,
        status: rawStatus as SubscriptionStatus,
        cancelAtPeriodEnd: Boolean(raw.cancel_at_period_end),
        currentPeriodEnd: parseStripePeriodEndIso(raw),
      },
    };
  } catch (err) {
    console.warn(
      `[stripe] GET subscription request error: ${err instanceof Error ? err.name : "unknown"}`,
    );
    return { ok: false, error: "stripe-fetch-failed" };
  }
}

export async function cancelStripeSubscription(
  stripeSecretKey: string,
  subscriptionId: string,
  options?: { timeoutMs?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmedId = subscriptionId.trim();
  if (!/^sub_[A-Za-z0-9_]+$/.test(trimmedId)) {
    return { ok: true };
  }

  try {
    const res = await fetchWithTimeout(
      `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(trimmedId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Stripe-Version": STRIPE_API_VERSION,
        },
      },
      options?.timeoutMs ?? STRIPE_API_TIMEOUT_MS,
    );

    if (res.ok || res.status === 404) {
      void res.body?.cancel().catch(() => {});
      return { ok: true };
    }

    if (res.status === 400) {
      try {
        const errBody = (await res.json()) as {
          error?: { code?: unknown; message?: unknown };
        };
        const code = typeof errBody?.error?.code === "string" ? errBody.error.code : "";
        const message =
          typeof errBody?.error?.message === "string" ? errBody.error.message.toLowerCase() : "";
        if (code === "resource_missing" || /already\s+(?:been\s+)?canceled/.test(message)) {
          return { ok: true };
        }
      } catch {
        // Non-JSON 400 falls through as cancel error
      }
      console.warn("[stripe] DELETE subscription rejected HTTP 400");
      return { ok: false, error: "stripe-http-400" };
    }

    void res.body?.cancel().catch(() => {});
    console.warn(`[stripe] DELETE subscription failed HTTP ${res.status}`);
    return { ok: false, error: `stripe-http-${res.status}` };
  } catch (err) {
    const errName = err instanceof Error ? err.name : "unknown";
    console.warn(`[stripe] DELETE subscription request error: ${errName}`);
    return { ok: false, error: `stripe-${errName}` };
  }
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function constantTimeBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  options?: {
    nowSeconds?: number;
    toleranceSeconds?: number;
  },
): Promise<boolean> {
  if (!rawBody || !signatureHeader || !webhookSecret) {
    return false;
  }

  let timestampStr: string | null = null;
  const signatures: Uint8Array[] = [];

  for (const part of signatureHeader.split(",")) {
    const eqIndex = part.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();
    if (key === "t" && /^\d+$/.test(value)) {
      timestampStr = value;
    } else if (key === "v1") {
      const parsedHex = hexToBytes(value);
      if (parsedHex) signatures.push(parsedHex);
    }
  }

  if (!timestampStr || signatures.length === 0) {
    return false;
  }

  const timestamp = Number.parseInt(timestampStr, 10);
  const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const toleranceSeconds = options?.toleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestampStr}.${rawBody}`),
  );
  const expectedBytes = new Uint8Array(signedBuffer);

  let matched = 0;
  for (const sigBytes of signatures) {
    matched |= constantTimeBytesEqual(expectedBytes, sigBytes) ? 1 : 0;
  }
  return matched === 1;
}
