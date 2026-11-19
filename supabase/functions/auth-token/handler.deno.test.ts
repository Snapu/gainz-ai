import assert from "node:assert/strict";
import { DEFAULT_GOOGLE_CLIENT_ID, MAX_REQUEST_BODY_BYTES } from "../_shared/http.ts";
import { type AuthTokenHandlerDeps, handleAuthTokenRequest } from "./handler.ts";
import {
  checkRateLimit,
  createRateLimiter,
  MAX_REQUESTS_PER_WINDOW,
  MAX_UNATTRIBUTED_REQUESTS_PER_WINDOW,
  RATE_LIMIT_WINDOW_MS,
} from "./rateLimiter.ts";

const AUTH_URL = "https://example.supabase.co/functions/v1/auth-token";

function createTestEnv(overrides: Record<string, string | undefined> = {}) {
  const vars: Record<string, string | undefined> = {
    GOOGLE_CLIENT_ID: "custom-client-id.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "super-secret-client-secret",
    ...overrides,
  };
  return (key: string) => vars[key];
}

function createDeps(overrides: Partial<AuthTokenHandlerDeps> = {}): AuthTokenHandlerDeps {
  const limiter = createRateLimiter();
  return {
    getEnv: createTestEnv(),
    checkRateLimit: (ip) => limiter.check(ip),
    ...overrides,
  };
}

function createPostRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

Deno.test("createRateLimiter enforces 30/min per IP, accurate Retry-After, and resets after window", () => {
  let nowMs = 1_000_000;
  const limiter = createRateLimiter({ now: () => nowMs });

  for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i++) {
    assert.deepEqual(limiter.check("203.0.113.10"), {
      limited: false,
      retryAfterSeconds: 0,
    });
  }

  const blockedAtStart = limiter.check("203.0.113.10");
  assert.deepEqual(blockedAtStart, { limited: true, retryAfterSeconds: 60 });

  nowMs += 25_000;
  const blockedMidWindow = limiter.check("203.0.113.10");
  assert.deepEqual(blockedMidWindow, { limited: true, retryAfterSeconds: 35 });

  // Separate attributed IP maintains an independent quota
  assert.deepEqual(limiter.check("203.0.113.11"), {
    limited: false,
    retryAfterSeconds: 0,
  });

  nowMs += RATE_LIMIT_WINDOW_MS - 25_000;
  assert.deepEqual(limiter.check("203.0.113.10"), {
    limited: false,
    retryAfterSeconds: 0,
  });
});

Deno.test("createRateLimiter shares strict fallback bucket for missing/blank IPs and caps tracked keys", () => {
  let nowMs = 1_000_000;
  const limiter = createRateLimiter({
    maxTrackedKeys: 2,
    cleanupThreshold: 10,
    now: () => nowMs,
  });

  // Undefined and whitespace-only IPs share the 10-request unattributed bucket
  for (let i = 0; i < MAX_UNATTRIBUTED_REQUESTS_PER_WINDOW; i++) {
    const input = i % 2 === 0 ? undefined : "   ";
    assert.equal(limiter.check(input).limited, false);
  }
  assert.equal(limiter.check(undefined).limited, true);
  assert.equal(limiter.check("  ").limited, true);

  // Reset and test bounded tracked keys (maxTrackedKeys: 2)
  limiter.reset();
  assert.equal(limiter.size(), 0);

  for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i++) {
    assert.equal(limiter.check("198.51.100.1").limited, false);
  }
  assert.equal(limiter.check("198.51.100.1").limited, true);
  assert.equal(limiter.check("198.51.100.2").limited, false);
  assert.equal(limiter.size(), 2);

  // Distinct IPs past maxTrackedKeys collapse into the strict unattributed bucket (10 req cap)
  // without evicting throttled tracked IPs or exceeding maxTrackedKeys
  for (let i = 0; i < MAX_UNATTRIBUTED_REQUESTS_PER_WINDOW; i++) {
    assert.equal(limiter.check(`198.51.100.${10 + i}`).limited, false);
  }
  assert.equal(limiter.size(), 2);
  assert.equal(limiter.check("198.51.100.99").limited, true);
  assert.equal(limiter.check("198.51.100.1").limited, true);

  // Expired keys free slots when window advances
  nowMs += RATE_LIMIT_WINDOW_MS;
  assert.equal(limiter.check("198.51.100.50").limited, false);
  assert.equal(limiter.size(), 1);
});

Deno.test("createRateLimiter prunes expired entries at cleanupThreshold before reaching maxTrackedKeys", () => {
  let nowMs = 1_000_000;
  const limiter = createRateLimiter({
    cleanupThreshold: 2,
    maxTrackedKeys: 10,
    now: () => nowMs,
  });

  assert.equal(limiter.check("198.51.100.1").limited, false);
  assert.equal(limiter.check("198.51.100.2").limited, false);
  assert.equal(limiter.size(), 2);

  // Within the window, earliestResetAt prevents premature pruning and keeps all live entries
  nowMs += 10_000;
  assert.equal(limiter.check("198.51.100.3").limited, false);
  assert.equal(limiter.size(), 3);

  // Once expired entries reach earliestResetAt, cleanupThreshold prunes them before hitting maxTrackedKeys
  nowMs += RATE_LIMIT_WINDOW_MS;
  assert.equal(limiter.check("198.51.100.4").limited, false);
  assert.equal(limiter.size(), 1);
});

Deno.test("createRateLimiter isolates literal __unattributed__ IP from missing-IP fallback bucket", () => {
  const limiter = createRateLimiter();

  // Exhaust unattributed bucket (10 requests)
  for (let i = 0; i < MAX_UNATTRIBUTED_REQUESTS_PER_WINDOW; i++) {
    assert.equal(limiter.check(undefined).limited, false);
  }
  assert.equal(limiter.check(undefined).limited, true);

  // Literal "__unattributed__" IP must still receive its own 30-request attributed quota
  for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i++) {
    assert.equal(limiter.check("__unattributed__").limited, false);
  }
  assert.equal(limiter.check("__unattributed__").limited, true);

  // Conversely, exhausting "__unattributed__" first must not affect undefined fallback callers
  limiter.reset();
  for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i++) {
    assert.equal(limiter.check("__unattributed__").limited, false);
  }
  assert.equal(limiter.check("__unattributed__").limited, true);
  for (let i = 0; i < MAX_UNATTRIBUTED_REQUESTS_PER_WINDOW; i++) {
    assert.equal(limiter.check(undefined).limited, false);
  }
  assert.equal(limiter.check(undefined).limited, true);

  // Default singleton helper handles checkRateLimit cleanly without throwing
  const sample = checkRateLimit("203.0.113.250");
  assert.equal(sample.limited, false);
  assert.equal(sample.retryAfterSeconds, 0);
});

Deno.test("handleAuthTokenRequest handles CORS preflight without consuming rate limit and rejects non-POST", async () => {
  let limitCalls = 0;
  const deps = createDeps({
    checkRateLimit: () => {
      limitCalls++;
      return { limited: false, retryAfterSeconds: 0 };
    },
  });

  const optionsRes = await handleAuthTokenRequest(
    new Request(AUTH_URL, { method: "OPTIONS" }),
    deps,
  );
  assert.equal(optionsRes.status, 200);
  assert.equal(await optionsRes.text(), "ok");
  assert.equal(limitCalls, 0);

  const getRes = await handleAuthTokenRequest(new Request(AUTH_URL, { method: "GET" }), deps);
  assert.equal(getRes.status, 405);
  assert.deepEqual(await getRes.json(), { error: "method-not-allowed" });
  assert.equal(limitCalls, 1);
});

Deno.test("handleAuthTokenRequest throttles missing-IP and over-limit IP requests with Retry-After", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = () => {
    fetchCalled = true;
    return Promise.resolve(
      new Response(JSON.stringify({ access_token: "ya29.ok", expires_in: 3600 }), { status: 200 }),
    );
  };

  try {
    const deps = createDeps();

    // 10 unattributed requests allowed; 11th must return 429 without upstream fetch
    for (let i = 0; i < MAX_UNATTRIBUTED_REQUESTS_PER_WINDOW; i++) {
      const okRes = await handleAuthTokenRequest(
        createPostRequest({ grantType: "authorization_code", code: "abc" }),
        deps,
      );
      assert.equal(okRes.status, 200);
    }

    fetchCalled = false;
    const unattributedBlocked = await handleAuthTokenRequest(
      createPostRequest({ grantType: "authorization_code", code: "abc" }),
      deps,
    );
    assert.equal(unattributedBlocked.status, 429);
    assert.equal(fetchCalled, false);
    assert.equal(Number(unattributedBlocked.headers.get("Retry-After")) > 0, true);
    assert.equal(unattributedBlocked.headers.get("Access-Control-Expose-Headers"), "Retry-After");
    assert.deepEqual(await unattributedBlocked.json(), {
      error: "rate-limited",
      message: "Too many authentication requests. Please try again later.",
    });

    // Attributed IP allows 30 requests; 31st returns 429
    for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i++) {
      const res = await handleAuthTokenRequest(
        createPostRequest(
          { grantType: "refresh_token", refreshToken: "1//refresh" },
          { "cf-connecting-ip": "203.0.113.42" },
        ),
        deps,
      );
      assert.equal(res.status, 200);
    }

    const ipBlocked = await handleAuthTokenRequest(
      createPostRequest(
        { grantType: "refresh_token", refreshToken: "1//refresh" },
        { "cf-connecting-ip": "203.0.113.42" },
      ),
      deps,
    );
    assert.equal(ipBlocked.status, 429);
    assert.equal(Number(ipBlocked.headers.get("Retry-After")) > 0, true);
    assert.equal(ipBlocked.headers.get("Access-Control-Expose-Headers"), "Retry-After");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("handleAuthTokenRequest validates config, body size, JSON syntax, and request schema", async () => {
  const missingSecretDeps = createDeps({
    getEnv: createTestEnv({ GOOGLE_CLIENT_SECRET: undefined }),
  });
  const missingSecretRes = await handleAuthTokenRequest(
    createPostRequest({ grantType: "authorization_code", code: "abc" }),
    missingSecretDeps,
  );
  assert.equal(missingSecretRes.status, 500);
  assert.deepEqual(await missingSecretRes.json(), { error: "missing-server-config" });

  const deps = createDeps();

  const oversizedRes = await handleAuthTokenRequest(
    createPostRequest(
      JSON.stringify({
        grantType: "authorization_code",
        code: "a".repeat(MAX_REQUEST_BODY_BYTES + 10),
      }),
    ),
    deps,
  );
  assert.equal(oversizedRes.status, 413);
  assert.deepEqual(await oversizedRes.json(), { error: "payload-too-large" });

  const invalidJsonRes = await handleAuthTokenRequest(createPostRequest("{bad-json"), deps);
  assert.equal(invalidJsonRes.status, 400);
  assert.deepEqual(await invalidJsonRes.json(), { error: "invalid-json" });

  const invalidGrantRes = await handleAuthTokenRequest(
    createPostRequest({ grantType: "client_credentials", code: "abc" }),
    deps,
  );
  assert.equal(invalidGrantRes.status, 400);
  assert.deepEqual(await invalidGrantRes.json(), { error: "invalid-request" });

  const blankCodeRes = await handleAuthTokenRequest(
    createPostRequest({ grantType: "authorization_code", code: "   " }),
    deps,
  );
  assert.equal(blankCodeRes.status, 400);
  assert.deepEqual(await blankCodeRes.json(), { error: "invalid-request" });

  const blankRefreshRes = await handleAuthTokenRequest(
    createPostRequest({ grantType: "refresh_token", refreshToken: "" }),
    deps,
  );
  assert.equal(blankRefreshRes.status, 400);
  assert.deepEqual(await blankRefreshRes.json(), { error: "invalid-request" });
});

Deno.test("handleAuthTokenRequest exchanges authorization_code and refresh_token with defaults", async () => {
  const originalFetch = globalThis.fetch;
  const capturedRequests: Array<{ url: string; body: URLSearchParams }> = [];
  let nextPayload: Record<string, unknown> = {
    access_token: "ya29.auth-code-token",
    refresh_token: "1//new-refresh",
    id_token: "eyJ.id.token",
    scope: "openid",
  };

  globalThis.fetch = (input, init) => {
    capturedRequests.push({
      url: String(input),
      body: new URLSearchParams(String(init?.body ?? "")),
    });
    return Promise.resolve(new Response(JSON.stringify(nextPayload), { status: 200 }));
  };

  try {
    const fallbackClientDeps = createDeps({
      getEnv: createTestEnv({ GOOGLE_CLIENT_ID: "   " }),
    });
    const codeRes = await handleAuthTokenRequest(
      createPostRequest({ grantType: "authorization_code", code: "  4/0AeanS0  " }),
      fallbackClientDeps,
    );
    assert.equal(codeRes.status, 200);
    assert.deepEqual(await codeRes.json(), {
      access_token: "ya29.auth-code-token",
      refresh_token: "1//new-refresh",
      id_token: "eyJ.id.token",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "openid",
    });
    assert.equal(capturedRequests[0]?.url, "https://oauth2.googleapis.com/token");
    assert.equal(capturedRequests[0]?.body.get("client_id"), DEFAULT_GOOGLE_CLIENT_ID);
    assert.equal(capturedRequests[0]?.body.get("client_secret"), "super-secret-client-secret");
    assert.equal(capturedRequests[0]?.body.get("grant_type"), "authorization_code");
    assert.equal(capturedRequests[0]?.body.get("code"), "4/0AeanS0");
    assert.equal(capturedRequests[0]?.body.get("redirect_uri"), "postmessage");

    nextPayload = {
      access_token: "ya29.refreshed-token",
      expires_in: 1800,
      token_type: "Bearer",
    };
    const refreshRes = await handleAuthTokenRequest(
      createPostRequest({ grantType: "refresh_token", refreshToken: " 1//stored-refresh " }),
      createDeps(),
    );
    assert.equal(refreshRes.status, 200);
    assert.deepEqual(await refreshRes.json(), {
      access_token: "ya29.refreshed-token",
      expires_in: 1800,
      token_type: "Bearer",
    });
    assert.equal(
      capturedRequests[1]?.body.get("client_id"),
      "custom-client-id.apps.googleusercontent.com",
    );
    assert.equal(capturedRequests[1]?.body.get("grant_type"), "refresh_token");
    assert.equal(capturedRequests[1]?.body.get("refresh_token"), "1//stored-refresh");
    assert.equal(capturedRequests[1]?.body.get("redirect_uri"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("handleAuthTokenRequest maps upstream OAuth errors and network failures cleanly", async () => {
  const originalFetch = globalThis.fetch;
  let nextResponseFactory: () => Promise<Response> = async () =>
    new Response(JSON.stringify({ error_description: "Bad code" }), { status: 400 });

  globalThis.fetch = () => nextResponseFactory();

  try {
    const deps = createDeps();

    // Google 400 -> 401 token-exchange-failed
    const res400 = await handleAuthTokenRequest(
      createPostRequest({ grantType: "authorization_code", code: "bad-code" }),
      deps,
    );
    assert.equal(res400.status, 401);
    assert.deepEqual(await res400.json(), {
      error: "token-exchange-failed",
      details: "Bad code",
    });

    // Google 401 on refresh -> 401 token-refresh-failed
    nextResponseFactory = async () =>
      new Response(JSON.stringify({ error_description: "Token revoked" }), { status: 401 });
    const res401 = await handleAuthTokenRequest(
      createPostRequest({ grantType: "refresh_token", refreshToken: "revoked" }),
      deps,
    );
    assert.equal(res401.status, 401);
    assert.deepEqual(await res401.json(), {
      error: "token-refresh-failed",
      details: "Token revoked",
    });

    // Google 429 -> 429
    nextResponseFactory = async () =>
      new Response(JSON.stringify({ error_description: "Rate exceeded" }), { status: 429 });
    const res429 = await handleAuthTokenRequest(
      createPostRequest({ grantType: "refresh_token", refreshToken: "1//ok" }),
      deps,
    );
    assert.equal(res429.status, 429);
    assert.deepEqual(await res429.json(), {
      error: "token-refresh-failed",
      details: "Rate exceeded",
    });

    // Google 503 -> 502
    nextResponseFactory = async () => new Response(JSON.stringify({}), { status: 503 });
    const res503 = await handleAuthTokenRequest(
      createPostRequest({ grantType: "authorization_code", code: "code" }),
      deps,
    );
    assert.equal(res503.status, 502);
    assert.deepEqual(await res503.json(), { error: "token-exchange-failed" });

    // Google 200 missing string access_token -> 502
    nextResponseFactory = async () =>
      new Response(JSON.stringify({ expires_in: 3600 }), { status: 200 });
    const resMissingToken = await handleAuthTokenRequest(
      createPostRequest({ grantType: "authorization_code", code: "code" }),
      deps,
    );
    assert.equal(resMissingToken.status, 502);
    assert.deepEqual(await resMissingToken.json(), { error: "token-exchange-failed" });

    // Non-JSON upstream response -> 502
    nextResponseFactory = async () => new Response("<html>Bad Gateway</html>", { status: 502 });
    const resNonJson = await handleAuthTokenRequest(
      createPostRequest({ grantType: "refresh_token", refreshToken: "1//ok" }),
      deps,
    );
    assert.equal(resNonJson.status, 502);
    assert.deepEqual(await resNonJson.json(), { error: "token-refresh-failed" });

    // Network rejection -> 502
    nextResponseFactory = () => Promise.reject(new Error("ECONNRESET"));
    const resNetworkErr = await handleAuthTokenRequest(
      createPostRequest({ grantType: "authorization_code", code: "code" }),
      deps,
    );
    assert.equal(resNetworkErr.status, 502);
    assert.deepEqual(await resNetworkErr.json(), { error: "token-exchange-failed" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
