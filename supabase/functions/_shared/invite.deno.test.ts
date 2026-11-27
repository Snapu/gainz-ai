import assert from "node:assert/strict";
import { checkInviteRedeemRateLimit, extractClientIp, redeemInviteCode } from "./invite.ts";

const SUPABASE_URL = "https://example.supabase.co";
const SERVICE_KEY = "service-role-secret";

Deno.test("extractClientIp prioritizes cf-connecting-ip then x-real-ip and ignores spoofable x-forwarded-for", () => {
  assert.equal(
    extractClientIp(
      new Request("https://example.com", {
        headers: { "cf-connecting-ip": "203.0.113.5", "x-real-ip": "198.51.100.2" },
      }),
    ),
    "203.0.113.5",
  );
  assert.equal(
    extractClientIp(
      new Request("https://example.com", { headers: { "x-real-ip": "2001:db8::1" } }),
    ),
    "2001:db8::1",
  );
  assert.equal(
    extractClientIp(
      new Request("https://example.com", {
        headers: { "x-forwarded-for": " 198.51.100.2, 10.0.0.1 " },
      }),
    ),
    null,
  );
  assert.equal(extractClientIp(new Request("https://example.com")), null);
  assert.equal(
    extractClientIp(
      new Request("https://example.com", { headers: { "x-real-ip": "x".repeat(65) } }),
    ),
    null,
  );
});

Deno.test("checkInviteRedeemRateLimit maps boolean RPC output to allowed / rate-limited / error", async () => {
  const originalFetch = globalThis.fetch;
  const capturedBodies: Record<string, unknown>[] = [];
  let nextResponse = () => new Response(JSON.stringify(true), { status: 200 });

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    capturedBodies.push(typeof init?.body === "string" ? JSON.parse(init.body) : {});
    return nextResponse();
  }) as typeof fetch;

  try {
    assert.equal(
      await checkInviteRedeemRateLimit(SUPABASE_URL, SERVICE_KEY, {
        userKey: "u:digest1",
        ipKey: "ip:digest2",
      }),
      "allowed",
    );
    assert.deepEqual(capturedBodies[0], {
      p_user_key: "u:digest1",
      p_ip_key: "ip:digest2",
    });

    nextResponse = () => new Response(JSON.stringify(false), { status: 200 });
    assert.equal(
      await checkInviteRedeemRateLimit(SUPABASE_URL, SERVICE_KEY, {
        userKey: "u:digest1",
      }),
      "rate-limited",
    );

    nextResponse = () => new Response("server down", { status: 503 });
    assert.equal(
      await checkInviteRedeemRateLimit(SUPABASE_URL, SERVICE_KEY, {
        userKey: "u:digest1",
      }),
      "error",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("redeemInviteCode maps RPC results cleanly and logs zero PII or raw invite codes on errors", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnCalls: unknown[][] = [];
  let nextResponse = () =>
    new Response(
      JSON.stringify([{ ok: true, error_code: null, invite_expires_at: "2026-12-31T00:00:00Z" }]),
      { status: 200 },
    );

  console.warn = (...args: unknown[]) => {
    warnCalls.push(args);
  };
  globalThis.fetch = (async () => nextResponse()) as typeof fetch;

  try {
    assert.deepEqual(
      await redeemInviteCode(SUPABASE_URL, SERVICE_KEY, {
        userId: "google-sub-secret-777",
        code: "SECRET-CODE-999",
      }),
      { ok: true, inviteExpiresAt: "2026-12-31T00:00:00Z" },
    );

    for (const errorCode of [
      "invite-invalid",
      "invite-exhausted",
      "invite-expired",
      "invite-already-redeemed",
    ] as const) {
      nextResponse = () =>
        new Response(
          JSON.stringify([{ ok: false, error_code: errorCode, invite_expires_at: null }]),
          { status: 200 },
        );
      assert.deepEqual(
        await redeemInviteCode(SUPABASE_URL, SERVICE_KEY, {
          userId: "google-sub-secret-777",
          code: "SECRET-CODE-999",
        }),
        { ok: false, error: errorCode },
      );
    }

    nextResponse = () =>
      new Response(
        JSON.stringify([
          { ok: false, error_code: "unexpected-future-error", invite_expires_at: null },
        ]),
        { status: 200 },
      );
    assert.deepEqual(
      await redeemInviteCode(SUPABASE_URL, SERVICE_KEY, {
        userId: "google-sub-secret-777",
        code: "SECRET-CODE-999",
      }),
      { ok: false, error: "billing-unavailable" },
    );

    nextResponse = () => new Response('{"message":"db failure"}', { status: 500 });
    assert.deepEqual(
      await redeemInviteCode(SUPABASE_URL, SERVICE_KEY, {
        userId: "google-sub-secret-777",
        code: "SECRET-CODE-999",
      }),
      { ok: false, error: "billing-unavailable" },
    );

    assert.equal(warnCalls.length, 1);
    const serialized = JSON.stringify(warnCalls);
    assert.equal(serialized.includes("google-sub-secret-777"), false);
    assert.equal(serialized.includes("SECRET-CODE-999"), false);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});
