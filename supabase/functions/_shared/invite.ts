import { fetchWithTimeout } from "./http.ts";

const INVITE_RPC_TIMEOUT_MS = 5_000;

export type InviteRedeemErrorCode =
  | "invite-invalid"
  | "invite-exhausted"
  | "invite-expired"
  | "invite-already-redeemed";

const KNOWN_INVITE_REDEEM_ERRORS: ReadonlySet<string> = new Set<InviteRedeemErrorCode>([
  "invite-invalid",
  "invite-exhausted",
  "invite-expired",
  "invite-already-redeemed",
]);

export type InviteRateLimitOutcome = "allowed" | "rate-limited" | "error";

export type RedeemInviteResult =
  | { ok: true; inviteExpiresAt: string | null }
  | { ok: false; error: InviteRedeemErrorCode | "billing-unavailable" };

interface RedeemInviteRpcRow {
  ok: boolean;
  error_code: string | null;
  invite_expires_at: string | null;
}

export function extractClientIp(req: Request): string | null {
  // Trust only proxy-overwritten edge/gateway headers; ignore spoofable leftmost x-forwarded-for
  const candidates = [req.headers.get("cf-connecting-ip"), req.headers.get("x-real-ip")];
  for (const raw of candidates) {
    const trimmed = raw?.trim();
    if (trimmed && trimmed.length > 0 && trimmed.length <= 64) {
      return trimmed;
    }
  }
  return null;
}

export async function checkInviteRedeemRateLimit(
  supabaseUrl: string,
  serviceRoleKey: string,
  params: {
    userKey: string;
    ipKey?: string | null;
  },
): Promise<InviteRateLimitOutcome> {
  try {
    const body: Record<string, unknown> = {
      p_user_key: params.userKey,
    };
    if (params.ipKey) {
      body.p_ip_key = params.ipKey;
    }

    const res = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/rpc/check_invite_redeem_rate_limit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify(body),
      },
      INVITE_RPC_TIMEOUT_MS,
    );

    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      console.warn(`[invite] rate_limit check failed HTTP ${res.status}`);
      return "error";
    }

    const allowed = (await res.json()) as unknown;
    return allowed === true ? "allowed" : allowed === false ? "rate-limited" : "error";
  } catch (err) {
    console.warn(`[invite] rate_limit check error: ${err instanceof Error ? err.name : "unknown"}`);
    return "error";
  }
}

export async function redeemInviteCode(
  supabaseUrl: string,
  serviceRoleKey: string,
  params: {
    userId: string;
    code: string;
  },
): Promise<RedeemInviteResult> {
  try {
    const res = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/rpc/redeem_invite_code`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          p_user_id: params.userId,
          p_code: params.code,
        }),
      },
      INVITE_RPC_TIMEOUT_MS,
    );

    if (!res.ok) {
      void res.body?.cancel().catch(() => {});
      console.warn(`[invite] redeem_invite_code failed HTTP ${res.status}`);
      return { ok: false, error: "billing-unavailable" };
    }

    const rows = (await res.json()) as RedeemInviteRpcRow[];
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!row || typeof row.ok !== "boolean") {
      return { ok: false, error: "billing-unavailable" };
    }

    if (row.ok) {
      return { ok: true, inviteExpiresAt: row.invite_expires_at ?? null };
    }

    const mappedError =
      typeof row.error_code === "string" && KNOWN_INVITE_REDEEM_ERRORS.has(row.error_code)
        ? (row.error_code as InviteRedeemErrorCode)
        : "billing-unavailable";

    return {
      ok: false,
      error: mappedError,
    };
  } catch (err) {
    console.warn(
      `[invite] redeem_invite_code error: ${err instanceof Error ? err.name : "unknown"}`,
    );
    return { ok: false, error: "billing-unavailable" };
  }
}
