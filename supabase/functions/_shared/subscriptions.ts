import type { SubscriptionStatus } from "./entitlement.ts";
import { fetchWithTimeout } from "./http.ts";

const SUBSCRIPTIONS_RPC_TIMEOUT_MS = 5_000;

export interface UserSubscriptionSummary {
  user_id: string;
  provider: string;
  provider_subscription_id: string;
  provider_customer_id: string;
  price_id: string;
  status: SubscriptionStatus;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  grace_ends_at: string | null;
  last_event_created: number;
}

export async function getUserSubscriptionSummary(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): Promise<{ ok: true; row: UserSubscriptionSummary | null } | { ok: false }> {
  try {
    const query =
      `${supabaseUrl}/rest/v1/user_subscriptions` +
      `?user_id=eq.${encodeURIComponent(userId)}` +
      "&select=user_id,provider,provider_subscription_id,provider_customer_id,price_id,status,cancel_at_period_end,current_period_end,grace_ends_at,last_event_created" +
      "&limit=1";
    const res = await fetchWithTimeout(
      query,
      {
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
      SUBSCRIPTIONS_RPC_TIMEOUT_MS,
    );

    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      console.warn(`[subscriptions] select user_subscriptions failed HTTP ${res.status}`);
      return { ok: false };
    }

    const rows = (await res.json()) as UserSubscriptionSummary[];
    return {
      ok: true,
      row: Array.isArray(rows) && rows[0] ? rows[0] : null,
    };
  } catch (err) {
    console.warn(
      `[subscriptions] select user_subscriptions error: ${err instanceof Error ? err.name : "unknown"}`,
    );
    return { ok: false };
  }
}

export async function hasProcessedWebhookEvent(
  supabaseUrl: string,
  serviceRoleKey: string,
  eventId: string,
): Promise<{ ok: true; processed: boolean } | { ok: false }> {
  try {
    const query =
      `${supabaseUrl}/rest/v1/processed_webhook_events` +
      `?event_id=eq.${encodeURIComponent(eventId)}` +
      "&select=event_id&limit=1";
    const res = await fetchWithTimeout(
      query,
      {
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
      SUBSCRIPTIONS_RPC_TIMEOUT_MS,
    );

    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      console.warn(`[subscriptions] select processed_webhook_events failed HTTP ${res.status}`);
      return { ok: false };
    }

    const rows = (await res.json()) as Array<{ event_id: string }>;
    return {
      ok: true,
      processed: Array.isArray(rows) && rows.length > 0,
    };
  } catch (err) {
    console.warn(
      `[subscriptions] select processed_webhook_events error: ${err instanceof Error ? err.name : "unknown"}`,
    );
    return { ok: false };
  }
}

export async function syncSubscriptionWebhook(
  supabaseUrl: string,
  serviceRoleKey: string,
  params: {
    eventId: string;
    eventCreated: number;
    userId: string;
    provider: "stripe";
    providerSubscriptionId: string;
    providerCustomerId: string;
    priceId: string;
    status: SubscriptionStatus;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
  },
): Promise<{ ok: true; alreadyProcessed: boolean; applied: boolean } | { ok: false }> {
  try {
    const res = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/rpc/sync_subscription_webhook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          p_event_id: params.eventId,
          p_event_created: params.eventCreated,
          p_user_id: params.userId,
          p_provider: params.provider,
          p_provider_subscription_id: params.providerSubscriptionId,
          p_provider_customer_id: params.providerCustomerId,
          p_price_id: params.priceId,
          p_status: params.status,
          p_cancel_at_period_end: params.cancelAtPeriodEnd,
          p_current_period_end: params.currentPeriodEnd,
        }),
      },
      SUBSCRIPTIONS_RPC_TIMEOUT_MS,
    );

    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      console.warn(`[subscriptions] sync_subscription_webhook failed HTTP ${res.status}`);
      return { ok: false };
    }

    const rows = (await res.json()) as Array<{ already_processed?: boolean; applied?: boolean }>;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row || typeof row.already_processed !== "boolean" || typeof row.applied !== "boolean") {
      return { ok: false };
    }

    return {
      ok: true,
      alreadyProcessed: row.already_processed,
      applied: row.applied,
    };
  } catch (err) {
    console.warn(
      `[subscriptions] sync_subscription_webhook error: ${err instanceof Error ? err.name : "unknown"}`,
    );
    return { ok: false };
  }
}
