import { fetchWithTimeout } from "./http.ts";

const SUPABASE_RPC_TIMEOUT_MS = 5000;

export type QuotaKind = "coach" | "classify";

export interface QuotaRow {
  allowed: boolean;
  current_count: number;
  daily_limit: number;
  reset_at: string;
  global_capped?: boolean;
}

export interface QuotaPayload {
  currentCount: number;
  dailyLimit: number;
  resetAt: string;
}

export function formatQuotaPayload(quota: QuotaRow): QuotaPayload {
  return {
    currentCount: quota.current_count,
    dailyLimit: quota.daily_limit,
    resetAt: quota.reset_at,
  };
}

export function deriveUsageDateFromResetAt(resetAt: string): string | undefined {
  const resetMs = Date.parse(resetAt);
  if (!Number.isFinite(resetMs)) return undefined;
  return new Date(resetMs - 86_400_000).toISOString().slice(0, 10);
}

export async function consumeQuota(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  kind: QuotaKind,
  dailyLimit: number,
): Promise<QuotaRow | null> {
  try {
    const res = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/rpc/consume_ai_quota`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          p_user_id: userId,
          p_kind: kind,
          p_daily_limit: dailyLimit,
        }),
      },
      SUPABASE_RPC_TIMEOUT_MS,
    );

    if (!res.ok) return null;
    const rows = (await res.json()) as QuotaRow[];
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function refundQuota(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  kind: QuotaKind,
  usageDate?: string,
): Promise<void> {
  try {
    const res = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/rpc/refund_ai_quota`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          p_user_id: userId,
          p_kind: kind,
          ...(usageDate ? { p_usage_date: usageDate } : {}),
        }),
      },
      SUPABASE_RPC_TIMEOUT_MS,
    );
    if (!res.ok) {
      console.warn("Quota refund RPC failed:", { status: res.status, kind });
    }
  } catch (err) {
    console.error("Quota refund request error:", {
      kind,
      error: err instanceof Error ? err.name : "unknown-error",
    });
  }
}
