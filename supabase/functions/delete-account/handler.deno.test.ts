import assert from "node:assert/strict";
import { type DeleteAccountHandlerDeps, handleDeleteAccountRequest } from "./handler.ts";

const DELETE_ACCOUNT_URL = "https://example.supabase.co/functions/v1/delete-account";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const SUPABASE_URL = "https://project.supabase.co";
const SERVICE_ROLE_KEY = "service-role-secret";

function createTestEnv(overrides: Record<string, string | undefined> = {}) {
  const vars: Record<string, string | undefined> = {
    GOOGLE_CLIENT_ID: "custom-client-id.apps.googleusercontent.com",
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    ...overrides,
  };
  return (key: string) => vars[key];
}

function createPostRequest(
  body: unknown,
  token: string | null = "ya29.valid-access-token",
  headers: Record<string, string> = {},
): Request {
  return new Request(DELETE_ACCOUNT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function createDeps(overrides: Partial<DeleteAccountHandlerDeps> = {}): DeleteAccountHandlerDeps {
  return {
    getEnv: createTestEnv(),
    verifyCaller: async () => ({ userId: "google-user-123" }),
    fetchImpl: async () => new Response("", { status: 200 }),
    ...overrides,
  };
}

Deno.test("handleDeleteAccountRequest responds to CORS preflight OPTIONS", async () => {
  const req = new Request(DELETE_ACCOUNT_URL, { method: "OPTIONS" });
  const res = await handleDeleteAccountRequest(req, createDeps());

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(await res.text(), "ok");
});

Deno.test("handleDeleteAccountRequest rejects non-POST methods with 405", async () => {
  const req = new Request(DELETE_ACCOUNT_URL, { method: "GET" });
  const res = await handleDeleteAccountRequest(req, createDeps());

  assert.equal(res.status, 405);
  assert.deepEqual(await res.json(), { error: "method-not-allowed" });
});

Deno.test("handleDeleteAccountRequest returns 500 when Supabase config is missing", async () => {
  const req = createPostRequest({});
  const res = await handleDeleteAccountRequest(
    req,
    createDeps({
      getEnv: createTestEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined }),
    }),
  );

  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "missing-server-config" });
});

Deno.test("handleDeleteAccountRequest returns 401 when Bearer token is missing or invalid", async () => {
  const missingHeaderRes = await handleDeleteAccountRequest(
    createPostRequest({}, null),
    createDeps(),
  );
  assert.equal(missingHeaderRes.status, 401);
  assert.deepEqual(await missingHeaderRes.json(), { error: "unauthorized" });

  let verifiedToken: string | null = null;
  let verifiedClientId: string | null = null;
  const invalidCallerRes = await handleDeleteAccountRequest(
    createPostRequest({}, "bad-token"),
    createDeps({
      verifyCaller: async (token, clientId) => {
        verifiedToken = token;
        verifiedClientId = clientId;
        return null;
      },
    }),
  );

  assert.equal(verifiedToken, "bad-token");
  assert.equal(verifiedClientId, "custom-client-id.apps.googleusercontent.com");
  assert.equal(invalidCallerRes.status, 401);
  assert.deepEqual(await invalidCallerRes.json(), { error: "unauthorized" });
});

Deno.test("handleDeleteAccountRequest returns 400 for invalid JSON or invalid revokeToken", async () => {
  const invalidJsonRes = await handleDeleteAccountRequest(
    createPostRequest("{not-json"),
    createDeps(),
  );
  assert.equal(invalidJsonRes.status, 400);
  assert.deepEqual(await invalidJsonRes.json(), { error: "invalid-json" });

  const arrayBodyRes = await handleDeleteAccountRequest(createPostRequest([]), createDeps());
  assert.equal(arrayBodyRes.status, 400);
  assert.deepEqual(await arrayBodyRes.json(), { error: "invalid-request" });

  const emptyTokenRes = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: "   " }),
    createDeps(),
  );
  assert.equal(emptyTokenRes.status, 400);
  assert.deepEqual(await emptyTokenRes.json(), { error: "invalid-request" });

  const nonStringTokenRes = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: 123 }),
    createDeps(),
  );
  assert.equal(nonStringTokenRes.status, 400);
  assert.deepEqual(await nonStringTokenRes.json(), { error: "invalid-request" });
});

Deno.test("handleDeleteAccountRequest deletes both Supabase user tables and revokes Google token", async () => {
  const calls: Array<{ url: string; method?: string; headers?: HeadersInit; body?: unknown }> = [];

  const res = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: "refresh-token-xyz" }, "header.jwt.payload"),
    createDeps({
      verifyCaller: async () => ({ userId: "user/with+chars" }),
      fetchImpl: async (url, init) => {
        calls.push({ url, method: init.method, headers: init.headers, body: init.body });
        return new Response(null, { status: 204 });
      },
    }),
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { deleted: true, googleRevoked: true });
  assert.equal(calls.length, 3);

  const encodedUserId = encodeURIComponent("user/with+chars");
  const deleteCalls = calls.slice(0, 2);
  assert.deepEqual(
    deleteCalls.map((c) => c.url).sort(),
    [
      `${SUPABASE_URL}/rest/v1/ai_daily_usage?user_id=eq.${encodedUserId}`,
      `${SUPABASE_URL}/rest/v1/ai_request_results?user_id=eq.${encodedUserId}`,
    ].sort(),
  );
  for (const call of deleteCalls) {
    assert.equal(call.method, "DELETE");
    assert.deepEqual(call.headers, {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    });
  }

  const revokeCall = calls[2];
  assert.equal(revokeCall.url, GOOGLE_REVOKE_URL);
  assert.equal(revokeCall.method, "POST");
  assert.deepEqual(revokeCall.headers, {
    "Content-Type": "application/x-www-form-urlencoded",
  });
  assert.equal(revokeCall.body, new URLSearchParams({ token: "refresh-token-xyz" }).toString());
});

Deno.test("handleDeleteAccountRequest returns 502 and does not revoke Google token if Supabase deletion fails", async () => {
  const calls: string[] = [];

  const res = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: "refresh-token-xyz" }),
    createDeps({
      fetchImpl: async (url) => {
        calls.push(url);
        if (url.includes("ai_request_results")) {
          return new Response("db down", { status: 500 });
        }
        return new Response(null, { status: 204 });
      },
    }),
  );

  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: "account-deletion-failed" });
  assert.equal(calls.length, 2);
  assert.equal(
    calls.some((u) => u === GOOGLE_REVOKE_URL),
    false,
  );
});

Deno.test("handleDeleteAccountRequest returns 502 if a Supabase delete request throws", async () => {
  const calls: string[] = [];

  const res = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: "refresh-token-xyz" }),
    createDeps({
      fetchImpl: async (url) => {
        calls.push(url);
        if (url.includes("ai_daily_usage")) {
          throw new Error("network timeout");
        }
        return new Response(null, { status: 204 });
      },
    }),
  );

  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: "account-deletion-failed" });
  assert.equal(
    calls.some((u) => u === GOOGLE_REVOKE_URL),
    false,
  );
});

Deno.test("handleDeleteAccountRequest treats Google 400 invalid_token as googleRevoked: true", async () => {
  const res = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: "already-revoked-token" }),
    createDeps({
      fetchImpl: async (url) => {
        if (url === GOOGLE_REVOKE_URL) {
          return new Response(JSON.stringify({ error: "invalid_token" }), { status: 400 });
        }
        return new Response(null, { status: 204 });
      },
    }),
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { deleted: true, googleRevoked: true });
});

Deno.test("handleDeleteAccountRequest still returns deleted: true with googleRevoked: false on Google revoke failure", async () => {
  const upstreamErrorRes = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: "refresh-token-xyz" }),
    createDeps({
      fetchImpl: async (url) => {
        if (url === GOOGLE_REVOKE_URL) {
          return new Response("upstream error", { status: 503 });
        }
        return new Response(null, { status: 204 });
      },
    }),
  );

  assert.equal(upstreamErrorRes.status, 200);
  assert.deepEqual(await upstreamErrorRes.json(), { deleted: true, googleRevoked: false });

  const networkErrorRes = await handleDeleteAccountRequest(
    createPostRequest({ revokeToken: "refresh-token-xyz" }),
    createDeps({
      fetchImpl: async (url) => {
        if (url === GOOGLE_REVOKE_URL) {
          throw new Error("network unreachable");
        }
        return new Response(null, { status: 204 });
      },
    }),
  );

  assert.equal(networkErrorRes.status, 200);
  assert.deepEqual(await networkErrorRes.json(), { deleted: true, googleRevoked: false });
});

Deno.test("handleDeleteAccountRequest falls back to non-JWT bearer access token and skips 3-part JWT when revokeToken is omitted", async () => {
  const accessRevokeCalls: Array<{ url: string; body?: unknown }> = [];
  const accessRes = await handleDeleteAccountRequest(
    createPostRequest({}, "ya29.opaque-access-token"),
    createDeps({
      fetchImpl: async (url, init) => {
        if (url === GOOGLE_REVOKE_URL) {
          accessRevokeCalls.push({ url, body: init.body });
        }
        return new Response("", { status: 200 });
      },
    }),
  );

  assert.equal(accessRes.status, 200);
  assert.deepEqual(await accessRes.json(), { deleted: true, googleRevoked: true });
  assert.equal(accessRevokeCalls.length, 1);
  assert.equal(
    accessRevokeCalls[0]?.body,
    new URLSearchParams({ token: "ya29.opaque-access-token" }).toString(),
  );

  const jwtRevokeCalls: string[] = [];
  const jwtRes = await handleDeleteAccountRequest(
    createPostRequest({}, "header.payload.signature"),
    createDeps({
      fetchImpl: async (url) => {
        if (url === GOOGLE_REVOKE_URL) {
          jwtRevokeCalls.push(url);
        }
        return new Response("", { status: 200 });
      },
    }),
  );

  assert.equal(jwtRes.status, 200);
  assert.deepEqual(await jwtRes.json(), { deleted: true, googleRevoked: false });
  assert.equal(jwtRevokeCalls.length, 0);
});
