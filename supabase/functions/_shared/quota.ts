import type { EntitlementRow } from "./entitlement.ts";
import { fetchWithTimeout } from "./http.ts";

const SUPABASE_RPC_TIMEOUT_MS = 5000;

export type QuotaKind = "coach" | "classify";
export type DenialReason = "payment-required" | "rate-limit-exceeded";
export type AdmittedSource = "subscription" | "invite_grant" | "free_allowance" | "none";

export interface AuthorizeAiRequestRow extends EntitlementRow {
  allowed: boolean;
  denial_reason: DenialReason | null;
  admitted_source: AdmittedSource;
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

export function formatQuotaPayload(
  quota: Pick<AuthorizeAiRequestRow, "current_count" | "daily_limit" | "reset_at">,
): QuotaPayload {
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

async function callSupabaseRpc<T>(
  supabaseUrl: string,
  serviceRoleKey: string,
  rpcName: string,
  body: Record<string, unknown>,
): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/rpc/${rpcName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify(body),
      },
      SUPABASE_RPC_TIMEOUT_MS,
    );

    if (!res.ok) return null;
    const rows = (await res.json()) as T[];
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

export async function getEntitlementStatus(
  supabaseUrl: string,
  serviceRoleKey: string,
  params: {
    userId: string;
    subjectDigest: string;
    previousSubjectDigest?: string | null;
  },
): Promise<EntitlementRow | null> {
  return callSupabaseRpc<EntitlementRow>(supabaseUrl, serviceRoleKey, "get_entitlement_status", {
    p_user_id: params.userId,
    p_subject_digest: params.subjectDigest,
    p_previous_subject_digest: params.previousSubjectDigest ?? null,
  });
}

export async function authorizeAiRequest(
  supabaseUrl: string,
  serviceRoleKey: string,
  params: {
    userId: string;
    subjectDigest: string;
    previousSubjectDigest?: string | null;
    kind: QuotaKind;
    paidDailyLimit: number;
    freeDailyLimit: number;
    globalCostCapUsdMicros?: number;
  },
): Promise<AuthorizeAiRequestRow | null> {
  return callSupabaseRpc<AuthorizeAiRequestRow>(
    supabaseUrl,
    serviceRoleKey,
    "authorize_ai_request",
    {
      p_user_id: params.userId,
      p_subject_digest: params.subjectDigest,
      p_previous_subject_digest: params.previousSubjectDigest ?? null,
      p_kind: params.kind,
      p_paid_daily_limit: params.paidDailyLimit,
      p_free_daily_limit: params.freeDailyLimit,
      ...(params.globalCostCapUsdMicros !== undefined
        ? { p_global_cost_cap_usd_micros: params.globalCostCapUsdMicros }
        : {}),
    },
  );
}

export async function refundQuota(
  supabaseUrl: string,
  serviceRoleKey: string,
  params: {
    userId: string;
    kind: QuotaKind;
    usageDate?: string;
    subjectDigest?: string;
    refundFreeAllowance: boolean;
  },
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
          p_user_id: params.userId,
          p_kind: params.kind,
          ...(params.usageDate ? { p_usage_date: params.usageDate } : {}),
          ...(params.subjectDigest ? { p_subject_digest: params.subjectDigest } : {}),
          p_refund_free_allowance: params.refundFreeAllowance,
        }),
      },
      SUPABASE_RPC_TIMEOUT_MS,
    );
    if (!res.ok) {
      console.warn("Quota refund RPC failed:", { status: res.status, kind: params.kind });
    }
  } catch (err) {
    console.error("Quota refund request error:", {
      kind: params.kind,
      error: err instanceof Error ? err.name : "unknown-error",
    });
  }
}
