import { extractBearerToken, verifyGoogleCaller } from "../_shared/auth.ts";
import {
  corsPreflightResponse,
  DEFAULT_GOOGLE_CLIENT_ID,
  fetchWithTimeout,
  getEnv,
  jsonResponse,
  readJsonBodyWithLimit,
} from "../_shared/http.ts";
import { cancelStripeSubscription } from "../_shared/stripe.ts";
import { deleteUserAccountData, getUserSubscriptionSummary } from "../_shared/subscriptions.ts";

const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const GOOGLE_REVOKE_TIMEOUT_MS = 10_000;
const INTERACTIVE_STRIPE_CANCEL_TIMEOUT_MS = 5_000;

const NON_TERMINATED_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
]);

interface DeleteAccountRequestBody {
  revokeToken?: string;
}

export interface DeleteAccountHandlerDeps {
  getEnv?: (name: string) => string | undefined;
  verifyCaller?: typeof verifyGoogleCaller;
  fetchImpl?: typeof fetchWithTimeout;
  getUserSubscriptionSummary?: typeof getUserSubscriptionSummary;
  cancelStripeSubscription?: typeof cancelStripeSubscription;
  deleteUserAccountData?: typeof deleteUserAccountData;
}

function parseDeleteAccountBody(value: unknown): DeleteAccountRequestBody | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if ("revokeToken" in record && record.revokeToken !== undefined) {
    if (typeof record.revokeToken !== "string" || record.revokeToken.trim().length === 0) {
      return null;
    }
    return { revokeToken: record.revokeToken.trim() };
  }

  return {};
}

async function revokeGoogleOAuthToken(
  fetchFn: typeof fetchWithTimeout,
  tokenToRevoke: string,
): Promise<boolean> {
  try {
    const res = await fetchFn(
      GOOGLE_REVOKE_ENDPOINT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ token: tokenToRevoke }).toString(),
      },
      GOOGLE_REVOKE_TIMEOUT_MS,
    );

    if (res.ok) {
      void res.body?.cancel().catch(() => {});
      return true;
    }

    if (res.status === 400) {
      try {
        const payload = (await res.json()) as Record<string, unknown>;
        if (payload && typeof payload === "object" && payload.error === "invalid_token") {
          return true;
        }
      } catch {
        // Fall through to warning if error payload is not valid JSON
      }
    } else {
      void res.body?.cancel().catch(() => {});
    }

    console.warn("delete-account Google token revocation failed:", { status: res.status });
    return false;
  } catch (err) {
    console.warn("delete-account Google token revocation error:", {
      error: err instanceof Error ? err.name : "unknown-error",
    });
    return false;
  }
}

function resolveEnvConfig(readEnv: (name: string) => string | undefined): {
  clientId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  stripeSecretKey: string | undefined;
} | null {
  const clientId = (readEnv("GOOGLE_CLIENT_ID") ?? "").trim() || DEFAULT_GOOGLE_CLIENT_ID;
  const supabaseUrl = readEnv("SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }
  const stripeSecretKey = readEnv("STRIPE_SECRET_KEY")?.trim() || undefined;
  return { clientId, supabaseUrl, serviceRoleKey, stripeSecretKey };
}

function selectTokenToRevoke(
  explicitRevokeToken: string | undefined,
  bearerToken: string,
): string | null {
  if (explicitRevokeToken) return explicitRevokeToken;
  return bearerToken.split(".").length !== 3 ? bearerToken : null;
}

async function resolveSubscriptionCancellation(
  config: { supabaseUrl: string; serviceRoleKey: string; stripeSecretKey: string | undefined },
  userId: string,
  deps: DeleteAccountHandlerDeps,
): Promise<
  | {
      ok: true;
      canceledSubscriptionId: string | null;
      pendingCancelSubscriptionId: string | null;
      pendingCancelError: string | null;
    }
  | { ok: false }
> {
  const getSummary = deps.getUserSubscriptionSummary ?? getUserSubscriptionSummary;
  const summaryResult = await getSummary(config.supabaseUrl, config.serviceRoleKey, userId);
  if (!summaryResult.ok) {
    return { ok: false };
  }

  const row = summaryResult.row;
  if (!row || !NON_TERMINATED_SUBSCRIPTION_STATUSES.has(row.status)) {
    return {
      ok: true,
      canceledSubscriptionId: null,
      pendingCancelSubscriptionId: null,
      pendingCancelError: null,
    };
  }

  if (!config.stripeSecretKey) {
    return {
      ok: true,
      canceledSubscriptionId: null,
      pendingCancelSubscriptionId: row.provider_subscription_id,
      pendingCancelError: "missing-stripe-secret",
    };
  }

  const cancelSub = deps.cancelStripeSubscription ?? cancelStripeSubscription;
  const cancelRes = await cancelSub(config.stripeSecretKey, row.provider_subscription_id, {
    timeoutMs: INTERACTIVE_STRIPE_CANCEL_TIMEOUT_MS,
  });
  if (cancelRes.ok) {
    return {
      ok: true,
      canceledSubscriptionId: row.provider_subscription_id,
      pendingCancelSubscriptionId: null,
      pendingCancelError: null,
    };
  }

  return {
    ok: true,
    canceledSubscriptionId: null,
    pendingCancelSubscriptionId: row.provider_subscription_id,
    pendingCancelError: cancelRes.error,
  };
}

export async function handleDeleteAccountRequest(
  req: Request,
  deps: DeleteAccountHandlerDeps = {},
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method-not-allowed" }, 405);
  }

  const config = resolveEnvConfig(deps.getEnv ?? getEnv);
  if (!config) {
    return jsonResponse({ error: "missing-server-config" }, 500);
  }

  const bearerToken = extractBearerToken(req);
  const verifyCaller = deps.verifyCaller ?? verifyGoogleCaller;
  const caller = bearerToken ? await verifyCaller(bearerToken, config.clientId) : null;
  if (!bearerToken || !caller) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const bodyResult = await readJsonBodyWithLimit(req);
  if (!bodyResult.ok) {
    return jsonResponse({ error: bodyResult.error }, bodyResult.status);
  }

  const parsedBody = parseDeleteAccountBody(bodyResult.data);
  if (!parsedBody) {
    return jsonResponse({ error: "invalid-request" }, 400);
  }

  const cancelPrep = await resolveSubscriptionCancellation(config, caller.userId, deps);
  if (!cancelPrep.ok) {
    return jsonResponse({ error: "account-deletion-failed" }, 502);
  }

  const deleteAccountData = deps.deleteUserAccountData ?? deleteUserAccountData;
  const eraseResult = await deleteAccountData(config.supabaseUrl, config.serviceRoleKey, {
    userId: caller.userId,
    canceledSubscriptionId: cancelPrep.canceledSubscriptionId,
    pendingCancelSubscriptionId: cancelPrep.pendingCancelSubscriptionId,
    pendingCancelError: cancelPrep.pendingCancelError,
  });
  if (!eraseResult.ok) {
    return jsonResponse({ error: "account-deletion-failed" }, 502);
  }

  const fetchFn = deps.fetchImpl ?? fetchWithTimeout;
  const tokenToRevoke = selectTokenToRevoke(parsedBody.revokeToken, bearerToken);
  const googleRevoked = tokenToRevoke
    ? await revokeGoogleOAuthToken(fetchFn, tokenToRevoke)
    : false;

  return jsonResponse({
    deleted: true,
    googleRevoked,
    billingCancellationPending: eraseResult.billingCancellationPending,
  });
}
