import assert from "node:assert/strict";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type KeyLike,
  SignJWT,
} from "npm:jose@5.10.0";
import { extractBearerToken, verifyGoogleCaller } from "./auth.ts";

const CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";

async function createSigningFixture(alg: "RS256" | "ES256" = "RS256", kid = "google-key-1") {
  const { publicKey, privateKey } = await generateKeyPair(alg, { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const jwks = createLocalJWKSet({
    keys: [{ ...publicJwk, kid, alg, use: "sig" }],
  });
  return { privateKey, jwks, kid };
}

async function signTestIdToken(options: {
  privateKey: KeyLike;
  alg?: "RS256" | "ES256";
  kid?: string;
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: number | string;
}): Promise<string> {
  const builder = new SignJWT(options.sub !== undefined ? { sub: options.sub } : {})
    .setProtectedHeader({ alg: options.alg ?? "RS256", kid: options.kid ?? "google-key-1" })
    .setIssuedAt();

  if (options.iss !== undefined) builder.setIssuer(options.iss);
  if (options.aud !== undefined) builder.setAudience(options.aud);
  if (options.exp !== undefined) {
    builder.setExpirationTime(options.exp);
  } else {
    builder.setExpirationTime("5m");
  }

  return builder.sign(options.privateKey);
}

Deno.test("extractBearerToken handles casing, trimming, missing, and non-Bearer headers", () => {
  const reqUpper = new Request("https://example.test", {
    headers: { Authorization: "Bearer   token-123  " },
  });
  assert.equal(extractBearerToken(reqUpper), "token-123");

  const reqLower = new Request("https://example.test", {
    headers: { authorization: "Bearer lower-456" },
  });
  assert.equal(extractBearerToken(reqLower), "lower-456");

  const reqMissing = new Request("https://example.test");
  assert.equal(extractBearerToken(reqMissing), null);

  const reqBasic = new Request("https://example.test", {
    headers: { Authorization: "Basic dXNlcjpwYXNz" },
  });
  assert.equal(extractBearerToken(reqBasic), null);

  const reqBlank = new Request("https://example.test", {
    headers: { Authorization: "Bearer    " },
  });
  assert.equal(extractBearerToken(reqBlank), null);
});

Deno.test("verifyGoogleCaller validates RS256 ID token claims against real npm:jose@5.10.0", async () => {
  const { privateKey, jwks } = await createSigningFixture();
  const otherPair = await createSigningFixture();
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    const validHttpsIss = await signTestIdToken({
      privateKey,
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
      sub: "  google-sub-123  ",
    });
    assert.deepEqual(await verifyGoogleCaller(validHttpsIss, CLIENT_ID, { jwks }), {
      userId: "google-sub-123",
    });

    const validBareIss = await signTestIdToken({
      privateKey,
      iss: "accounts.google.com",
      aud: CLIENT_ID,
      sub: "google-sub-456",
    });
    assert.deepEqual(await verifyGoogleCaller(validBareIss, CLIENT_ID, { jwks }), {
      userId: "google-sub-456",
    });

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expired = await signTestIdToken({
      privateKey,
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
      sub: "google-sub-123",
      exp: nowSeconds - 120,
    });
    assert.equal(await verifyGoogleCaller(expired, CLIENT_ID, { jwks }), null);

    const wrongAud = await signTestIdToken({
      privateKey,
      iss: "https://accounts.google.com",
      aud: "other-client-id.apps.googleusercontent.com",
      sub: "google-sub-123",
    });
    assert.equal(await verifyGoogleCaller(wrongAud, CLIENT_ID, { jwks }), null);

    const wrongIss = await signTestIdToken({
      privateKey,
      iss: "https://evil.example.com",
      aud: CLIENT_ID,
      sub: "google-sub-123",
    });
    assert.equal(await verifyGoogleCaller(wrongIss, CLIENT_ID, { jwks }), null);

    const wrongSignature = await signTestIdToken({
      privateKey: otherPair.privateKey,
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
      sub: "google-sub-123",
    });
    assert.equal(await verifyGoogleCaller(wrongSignature, CLIENT_ID, { jwks }), null);

    const missingSub = await signTestIdToken({
      privateKey,
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
    });
    assert.equal(await verifyGoogleCaller(missingSub, CLIENT_ID, { jwks }), null);

    const blankSub = await signTestIdToken({
      privateKey,
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
      sub: "   ",
    });
    assert.equal(await verifyGoogleCaller(blankSub, CLIENT_ID, { jwks }), null);

    const es256Pair = await createSigningFixture("ES256", "ec-key-1");
    const es256Token = await signTestIdToken({
      privateKey: es256Pair.privateKey,
      alg: "ES256",
      kid: "ec-key-1",
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
      sub: "google-sub-123",
    });
    assert.equal(await verifyGoogleCaller(es256Token, CLIENT_ID, { jwks: es256Pair.jwks }), null);
  } finally {
    console.warn = originalWarn;
  }
});

Deno.test("verifyGoogleCaller never falls back to tokeninfo for malformed 3-segment JWTs", async () => {
  const { jwks } = await createSigningFixture();
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  let fetchCalled = false;

  console.warn = () => {};
  globalThis.fetch = () => {
    fetchCalled = true;
    return Promise.resolve(new Response(JSON.stringify({ sub: "should-not-hit", aud: CLIENT_ID })));
  };

  try {
    const result = await verifyGoogleCaller("malformed.jwt.token", CLIENT_ID, { jwks });
    assert.equal(result, null);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

Deno.test("verifyGoogleCaller verifies opaque OAuth access tokens via tokeninfo", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedMethod = "";
  let capturedContentType = "";
  let capturedBody = "";
  let nextResponseFactory: () => Promise<Response> = async () =>
    new Response(JSON.stringify({ sub: "sub-aud", aud: CLIENT_ID }), { status: 200 });

  globalThis.fetch = (input, init) => {
    capturedUrl = String(input);
    capturedMethod = init?.method ?? "";
    capturedContentType = new Headers(init?.headers).get("Content-Type") ?? "";
    capturedBody = String(init?.body ?? "");
    return nextResponseFactory();
  };

  try {
    const audMatch = await verifyGoogleCaller("ya29.opaque-access-token", CLIENT_ID);
    assert.deepEqual(audMatch, { userId: "sub-aud" });
    assert.equal(capturedUrl, "https://oauth2.googleapis.com/tokeninfo");
    assert.equal(capturedMethod, "POST");
    assert.equal(capturedContentType, "application/x-www-form-urlencoded");
    assert.equal(capturedBody, "access_token=ya29.opaque-access-token");

    nextResponseFactory = async () =>
      new Response(JSON.stringify({ sub: "sub-azp", aud: "other", azp: CLIENT_ID }), {
        status: 200,
      });
    assert.deepEqual(await verifyGoogleCaller("ya29.azp-token", CLIENT_ID), { userId: "sub-azp" });

    nextResponseFactory = async () => new Response("invalid", { status: 401 });
    assert.equal(await verifyGoogleCaller("ya29.rejected", CLIENT_ID), null);

    nextResponseFactory = async () =>
      new Response(JSON.stringify({ aud: CLIENT_ID, sub: "  " }), { status: 200 });
    assert.equal(await verifyGoogleCaller("ya29.empty-sub", CLIENT_ID), null);

    nextResponseFactory = async () =>
      new Response(JSON.stringify({ sub: "sub-1", aud: "wrong", azp: "also-wrong" }), {
        status: 200,
      });
    assert.equal(await verifyGoogleCaller("ya29.wrong-client", CLIENT_ID), null);

    nextResponseFactory = () => Promise.reject(new Error("network down"));
    assert.equal(await verifyGoogleCaller("ya29.network-error", CLIENT_ID), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
