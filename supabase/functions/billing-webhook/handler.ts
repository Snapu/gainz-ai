import { getEnv, jsonResponse } from "../_shared/http.ts";
import {
  cancelStripeSubscription,
  extractSubscriptionIdFromStripeEvent,
  fetchCanonicalSubscription,
  type StripeWebhookEventLike,
  verifyStripeWebhookSignature,
} from "../_shared/stripe.ts";
import {
  deletePendingSubscriptionCancellation,
  hasPendingSubscriptionCancellation,
  hasProcessedWebhookEvent,
  syncSubscriptionWebhook,
} from "../_shared/subscriptions.ts";

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

interface WebhookServerConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
}

export interface BillingWebhookDeps {
  getEnv?: (name: string) => string | undefined;
  verifySignature?: typeof verifyStripeWebhookSignature;
  hasProcessedWebhookEvent?: typeof hasProcessedWebhookEvent;
  hasPendingSubscriptionCancellation?: typeof hasPendingSubscriptionCancellation;
  cancelStripeSubscription?: typeof cancelStripeSubscription;
  deletePendingSubscriptionCancellation?: typeof deletePendingSubscriptionCancellation;
  fetchCanonicalSubscription?: typeof fetchCanonicalSubscription;
  syncSubscriptionWebhook?: typeof syncSubscriptionWebhook;
  nowSeconds?: () => number;
}

function loadWebhookConfig(
  readEnv: (name: string) => string | undefined = getEnv,
): WebhookServerConfig | null {
  const supabaseUrl = readEnv("SUPABASE_URL")?.trim();
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const stripeSecretKey = readEnv("STRIPE_SECRET_KEY")?.trim();
  const stripeWebhookSecret = readEnv("STRIPE_WEBHOOK_SECRET")?.trim();

  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !stripeWebhookSecret) {
    return null;
  }
  return {
    supabaseUrl,
    serviceRoleKey,
    stripeSecretKey,
    stripeWebhookSecret,
  };
}

type ReadRawBodyResult =
  | { ok: true; rawText: string }
  | { ok: false; status: 400 | 413; error: "invalid-payload" | "payload-too-large" };

async function readRawBodyWithLimit(req: Request): Promise<ReadRawBodyResult> {
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const declaredLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_BYTES) {
      return { ok: false, status: 413, error: "payload-too-large" };
    }
  }

  let rawText: string;
  if (req.body) {
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_WEBHOOK_BODY_BYTES) {
          await reader.cancel().catch(() => {});
          return { ok: false, status: 413, error: "payload-too-large" };
        }
        chunks.push(value);
      }
    } catch {
      return { ok: false, status: 400, error: "invalid-payload" };
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    rawText = new TextDecoder().decode(merged);
  } else {
    try {
      rawText = await req.text();
    } catch {
      return { ok: false, status: 400, error: "invalid-payload" };
    }
    if (new TextEncoder().encode(rawText).byteLength > MAX_WEBHOOK_BODY_BYTES) {
      return { ok: false, status: 413, error: "payload-too-large" };
    }
  }

  if (!rawText) {
    return { ok: false, status: 400, error: "invalid-payload" };
  }

  return { ok: true, rawText };
}

function parseStripeEvent(rawText: string): StripeWebhookEventLike | null {
  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const obj = parsed as Record<string, unknown>;
    if (
      typeof obj.id !== "string" ||
      obj.id.trim().length === 0 ||
      typeof obj.type !== "string" ||
      obj.type.trim().length === 0 ||
      typeof obj.created !== "number" ||
      !Number.isFinite(obj.created) ||
      obj.created < 0
    ) {
      return null;
    }
    return {
      id: obj.id.trim(),
      type: obj.type.trim(),
      created: Math.trunc(obj.created),
      data:
        obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)
          ? (obj.data as { object?: Record<string, unknown> })
          : undefined,
    };
  } catch {
    return null;
  }
}

async function completeTombstonedCancellation(
  config: WebhookServerConfig,
  subscriptionId: string,
  deps: BillingWebhookDeps,
): Promise<Response> {
  const cancelSub = deps.cancelStripeSubscription ?? cancelStripeSubscription;
  const cancelResult = await cancelSub(config.stripeSecretKey, subscriptionId);
  if (!cancelResult.ok) {
    return jsonResponse({ error: "stripe-cancel-failed" }, 502);
  }

  const deletePending =
    deps.deletePendingSubscriptionCancellation ?? deletePendingSubscriptionCancellation;
  const removed = await deletePending(config.supabaseUrl, config.serviceRoleKey, subscriptionId);
  if (!removed) {
    return jsonResponse({ error: "sync-failed" }, 500);
  }

  return jsonResponse({ received: true, tombstoneCanceled: true }, 200);
}

async function handleTombstonedSubscription(
  config: WebhookServerConfig,
  subscriptionId: string,
  deps: BillingWebhookDeps,
): Promise<Response | null> {
  const checkPending =
    deps.hasPendingSubscriptionCancellation ?? hasPendingSubscriptionCancellation;
  const pendingResult = await checkPending(
    config.supabaseUrl,
    config.serviceRoleKey,
    subscriptionId,
  );
  if (!pendingResult.ok) {
    return jsonResponse({ error: "sync-failed" }, 500);
  }
  if (!pendingResult.pending) {
    return null;
  }

  return completeTombstonedCancellation(config, subscriptionId, deps);
}

export async function handleBillingWebhook(
  req: Request,
  deps: BillingWebhookDeps = {},
): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method-not-allowed" }, 405);
  }

  const config = loadWebhookConfig(deps.getEnv ?? getEnv);
  if (!config) {
    return jsonResponse({ error: "missing-server-config" }, 500);
  }

  const bodyResult = await readRawBodyWithLimit(req);
  if (!bodyResult.ok) {
    return jsonResponse({ error: bodyResult.error }, bodyResult.status);
  }

  const verifySig = deps.verifySignature ?? verifyStripeWebhookSignature;
  const sigHeader = req.headers.get("stripe-signature");
  const isSignatureValid = await verifySig(
    bodyResult.rawText,
    sigHeader,
    config.stripeWebhookSecret,
    deps.nowSeconds ? { nowSeconds: deps.nowSeconds() } : undefined,
  );
  if (!isSignatureValid) {
    return jsonResponse({ error: "invalid-signature" }, 400);
  }

  const event = parseStripeEvent(bodyResult.rawText);
  if (!event) {
    return jsonResponse({ error: "invalid-event" }, 400);
  }

  const subscriptionId = extractSubscriptionIdFromStripeEvent(event);
  if (!subscriptionId) {
    return jsonResponse({ received: true, ignored: true }, 200);
  }

  const tombstoneResponse = await handleTombstonedSubscription(config, subscriptionId, deps);
  if (tombstoneResponse) {
    return tombstoneResponse;
  }

  const checkProcessed = deps.hasProcessedWebhookEvent ?? hasProcessedWebhookEvent;
  const processedCheck = await checkProcessed(config.supabaseUrl, config.serviceRoleKey, event.id);
  if (!processedCheck.ok) {
    return jsonResponse({ error: "sync-failed" }, 500);
  }
  if (processedCheck.processed) {
    return jsonResponse({ received: true, duplicate: true }, 200);
  }

  const fetchCanonical = deps.fetchCanonicalSubscription ?? fetchCanonicalSubscription;
  const canonicalResult = await fetchCanonical(config.stripeSecretKey, subscriptionId);
  if (!canonicalResult.ok) {
    if (canonicalResult.error === "missing-user-metadata") {
      return jsonResponse({ error: "missing-user-metadata" }, 400);
    }
    return jsonResponse({ error: "stripe-fetch-failed" }, 502);
  }
  if (canonicalResult.kind === "ignored") {
    return jsonResponse({ received: true, ignored: true }, 200);
  }

  const sub = canonicalResult.subscription;
  const syncWebhook = deps.syncSubscriptionWebhook ?? syncSubscriptionWebhook;
  const syncResult = await syncWebhook(config.supabaseUrl, config.serviceRoleKey, {
    eventId: event.id,
    eventCreated: event.created,
    userId: sub.userId,
    provider: "stripe",
    providerSubscriptionId: sub.id,
    providerCustomerId: sub.customerId,
    priceId: sub.priceId,
    status: sub.status,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    currentPeriodEnd: sub.currentPeriodEnd,
  });
  if (!syncResult.ok) {
    return jsonResponse({ error: "sync-failed" }, 500);
  }
  if (syncResult.tombstoned) {
    return completeTombstonedCancellation(config, subscriptionId, deps);
  }

  return jsonResponse(
    {
      received: true,
      applied: syncResult.applied,
      duplicate: syncResult.alreadyProcessed,
    },
    200,
  );
}
