import {
  corsPreflightResponse,
  DEFAULT_GOOGLE_CLIENT_ID,
  extractClientIp,
  fetchWithTimeout,
  getEnv,
  jsonResponse,
  readJsonBodyWithLimit,
} from "../_shared/http.ts";
import { checkRateLimit, type RateLimitResult } from "./rateLimiter.ts";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKEN_TIMEOUT_MS = 10_000;

interface AuthCodeRequest {
  grantType: "authorization_code";
  code: string;
}

interface RefreshTokenRequest {
  grantType: "refresh_token";
  refreshToken: string;
}

type TokenRequestBody = AuthCodeRequest | RefreshTokenRequest;

export interface AuthTokenHandlerDeps {
  getEnv?: (name: string) => string | undefined;
  checkRateLimit?: (clientIp: string | undefined) => RateLimitResult;
}

function isTokenRequestBody(value: unknown): value is TokenRequestBody {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.grantType === "authorization_code") {
    return typeof record.code === "string" && record.code.trim().length > 0;
  }
  if (record.grantType === "refresh_token") {
    return typeof record.refreshToken === "string" && record.refreshToken.trim().length > 0;
  }
  return false;
}

function buildTokenParams(
  clientId: string,
  clientSecret: string,
  body: TokenRequestBody,
): URLSearchParams {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: body.grantType,
  });

  if (body.grantType === "authorization_code") {
    params.set("code", body.code.trim());
    params.set("redirect_uri", "postmessage");
  } else {
    params.set("refresh_token", body.refreshToken.trim());
  }

  return params;
}

function formatTokenSuccess(payload: Record<string, unknown>): Response {
  return jsonResponse({
    access_token: payload.access_token,
    refresh_token: typeof payload.refresh_token === "string" ? payload.refresh_token : undefined,
    id_token: typeof payload.id_token === "string" ? payload.id_token : undefined,
    expires_in: typeof payload.expires_in === "number" ? payload.expires_in : 3600,
    scope: typeof payload.scope === "string" ? payload.scope : undefined,
    token_type: typeof payload.token_type === "string" ? payload.token_type : "Bearer",
  });
}

function mapTokenUpstreamErrorStatus(googleStatus: number): number {
  if (googleStatus === 400 || googleStatus === 401) return 401;
  if (googleStatus === 429) return 429;
  return 502;
}

async function exchangeGoogleToken(
  body: TokenRequestBody,
  clientId: string,
  clientSecret: string,
): Promise<Response> {
  const params = buildTokenParams(clientId, clientSecret, body);
  const errorCode =
    body.grantType === "authorization_code" ? "token-exchange-failed" : "token-refresh-failed";

  try {
    const googleRes = await fetchWithTimeout(
      GOOGLE_TOKEN_ENDPOINT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
      GOOGLE_TOKEN_TIMEOUT_MS,
    );

    const payload = (await googleRes.json()) as Record<string, unknown>;

    if (!googleRes.ok || typeof payload.access_token !== "string") {
      return jsonResponse(
        {
          error: errorCode,
          details:
            typeof payload.error_description === "string" ? payload.error_description : undefined,
        },
        mapTokenUpstreamErrorStatus(googleRes.status),
      );
    }

    return formatTokenSuccess(payload);
  } catch {
    return jsonResponse({ error: errorCode }, 502);
  }
}

export async function handleAuthTokenRequest(
  req: Request,
  deps: AuthTokenHandlerDeps = {},
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse();
  }

  const clientIp = extractClientIp(req);
  if (!clientIp) {
    // Surfaces header/routing regressions: all unattributed callers share one strict bucket.
    console.warn("auth-token: request without client IP header, using shared fallback bucket");
  }
  const rateLimit = (deps.checkRateLimit ?? checkRateLimit)(clientIp);
  if (rateLimit.limited) {
    return jsonResponse(
      {
        error: "rate-limited",
        message: "Too many authentication requests. Please try again later.",
      },
      429,
      {
        "Retry-After": String(rateLimit.retryAfterSeconds),
        "Access-Control-Expose-Headers": "Retry-After",
      },
    );
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method-not-allowed" }, 405);
  }

  const readEnv = deps.getEnv ?? getEnv;
  const clientId = (readEnv("GOOGLE_CLIENT_ID") ?? "").trim() || DEFAULT_GOOGLE_CLIENT_ID;
  const clientSecret = readEnv("GOOGLE_CLIENT_SECRET");
  if (!clientSecret) {
    return jsonResponse({ error: "missing-server-config" }, 500);
  }

  const bodyResult = await readJsonBodyWithLimit(req);
  if (!bodyResult.ok) {
    return jsonResponse({ error: bodyResult.error }, bodyResult.status);
  }

  if (!isTokenRequestBody(bodyResult.data)) {
    return jsonResponse({ error: "invalid-request" }, 400);
  }

  return exchangeGoogleToken(bodyResult.data, clientId, clientSecret);
}
