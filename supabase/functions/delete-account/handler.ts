import { extractBearerToken, verifyGoogleCaller } from "../_shared/auth.ts";
import {
  corsPreflightResponse,
  DEFAULT_GOOGLE_CLIENT_ID,
  fetchWithTimeout,
  getEnv,
  jsonResponse,
  readJsonBodyWithLimit,
} from "../_shared/http.ts";

const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const SUPABASE_DELETE_TIMEOUT_MS = 10_000;
const GOOGLE_REVOKE_TIMEOUT_MS = 10_000;

interface DeleteAccountRequestBody {
  revokeToken?: string;
}

export interface DeleteAccountHandlerDeps {
  getEnv?: (name: string) => string | undefined;
  verifyCaller?: typeof verifyGoogleCaller;
  fetchImpl?: typeof fetchWithTimeout;
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

async function deleteUserTableRows(
  fetchFn: typeof fetchWithTimeout,
  supabaseUrl: string,
  serviceRoleKey: string,
  table: "ai_daily_usage" | "ai_request_results",
  userId: string,
): Promise<boolean> {
  const url = `${supabaseUrl}/rest/v1/${table}?user_id=eq.${encodeURIComponent(userId)}`;
  try {
    const res = await fetchFn(
      url,
      {
        method: "DELETE",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
      SUPABASE_DELETE_TIMEOUT_MS,
    );
    void res.body?.cancel().catch(() => {});
    if (!res.ok) {
      console.warn("delete-account table deletion failed:", { table, status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    console.warn("delete-account table deletion error:", {
      table,
      error: err instanceof Error ? err.name : "unknown-error",
    });
    return false;
  }
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
} | null {
  const clientId = (readEnv("GOOGLE_CLIENT_ID") ?? "").trim() || DEFAULT_GOOGLE_CLIENT_ID;
  const supabaseUrl = readEnv("SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }
  return { clientId, supabaseUrl, serviceRoleKey };
}

function selectTokenToRevoke(
  explicitRevokeToken: string | undefined,
  bearerToken: string,
): string | null {
  if (explicitRevokeToken) return explicitRevokeToken;
  return bearerToken.split(".").length !== 3 ? bearerToken : null;
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

  const fetchFn = deps.fetchImpl ?? fetchWithTimeout;
  const deleteResults = await Promise.all([
    deleteUserTableRows(
      fetchFn,
      config.supabaseUrl,
      config.serviceRoleKey,
      "ai_daily_usage",
      caller.userId,
    ),
    deleteUserTableRows(
      fetchFn,
      config.supabaseUrl,
      config.serviceRoleKey,
      "ai_request_results",
      caller.userId,
    ),
  ]);
  if (deleteResults.some((deleted) => !deleted)) {
    return jsonResponse({ error: "account-deletion-failed" }, 502);
  }

  const tokenToRevoke = selectTokenToRevoke(parsedBody.revokeToken, bearerToken);
  const googleRevoked = tokenToRevoke
    ? await revokeGoogleOAuthToken(fetchFn, tokenToRevoke)
    : false;

  return jsonResponse({ deleted: true, googleRevoked });
}
