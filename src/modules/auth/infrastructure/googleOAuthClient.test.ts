import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vue3-google-login", () => ({
  googleSdkLoaded: vi.fn(),
}));

vi.mock("@/modules/platform/infrastructure", () => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "anon-key-123",
}));

import { createAccountDeletionService } from "./googleOAuthClient";

describe("createAccountDeletionService", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses billingCancellationPending: true and defaults omitted flag to false", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            deleted: true,
            googleRevoked: true,
            billingCancellationPending: true,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            deleted: true,
            googleRevoked: false,
          }),
          { status: 200 },
        ),
      ) as typeof fetch;

    const service = createAccountDeletionService();
    const pendingRes = await service.deleteAccount({
      authToken: "oauth-token",
      revokeToken: "refresh-token",
    });
    expect(pendingRes.isOk()).toBe(true);
    if (pendingRes.isOk()) {
      expect(pendingRes.value).toEqual({
        deleted: true,
        googleRevoked: true,
        billingCancellationPending: true,
      });
    }

    const legacyRes = await service.deleteAccount({ authToken: "oauth-token" });
    expect(legacyRes.isOk()).toBe(true);
    if (legacyRes.isOk()) {
      expect(legacyRes.value).toEqual({
        deleted: true,
        googleRevoked: false,
        billingCancellationPending: false,
      });
    }
  });

  it("maps 401 to unauthorized and 500 to account-deletion-failed", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "server" }), { status: 500 }),
      ) as typeof fetch;

    const service = createAccountDeletionService();
    const unauth = await service.deleteAccount({ authToken: "bad" });
    expect(unauth.isErr()).toBe(true);
    if (unauth.isErr()) {
      expect(unauth.error).toBe("unauthorized");
    }

    const failed = await service.deleteAccount({ authToken: "ok" });
    expect(failed.isErr()).toBe(true);
    if (failed.isErr()) {
      expect(failed.error).toBe("account-deletion-failed");
    }
  });
});
