import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DEFAULT_GOOGLE_CLIENT_ID =
  "804592774481-hvo962fnjn23g9tt4i0s5d62f17pegg7.apps.googleusercontent.com";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AuthCodeRequest {
  grantType: "authorization_code";
  code: string;
}

interface RefreshTokenRequest {
  grantType: "refresh_token";
  refreshToken: string;
}

type TokenRequestBody = AuthCodeRequest | RefreshTokenRequest;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
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

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  if (rateLimitMap.size > 500) {
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetAt) rateLimitMap.delete(key);
    }
  }

  const current = rateLimitMap.get(ip);
  if (!current || now > current.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  current.count++;
  return current.count > MAX_REQUESTS_PER_WINDOW;
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

const GOOGLE_TOKEN_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractClientIp(req: Request): string | undefined {
  // Supabase sits behind Cloudflare (`cf-connecting-ip`); reverse proxies append hops at the tail of x-forwarded-for
  const forwardedFor = req.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return (
    req.headers.get("cf-connecting-ip")?.trim() ||
    forwardedFor?.at(-1) ||
    req.headers.get("x-real-ip")?.trim() ||
    undefined
  );
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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const clientIp = extractClientIp(req);
  if (clientIp && isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({
        error: "rate-limited",
        message: "Too many authentication requests. Please try again later.",
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      },
    );
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method-not-allowed" }, 405);
  }

  const clientId = (Deno.env.get("GOOGLE_CLIENT_ID") ?? "").trim() || DEFAULT_GOOGLE_CLIENT_ID;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientSecret) {
    return jsonResponse({ error: "missing-server-config" }, 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid-json" }, 400);
  }

  if (!isTokenRequestBody(body)) {
    return jsonResponse({ error: "invalid-request" }, 400);
  }

  return exchangeGoogleToken(body, clientId, clientSecret);
});
