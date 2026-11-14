import { errAsync, okAsync } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as authInfra from "@/modules/auth/infrastructure";
import { useAuthStore } from "@/modules/auth/presentation";

describe("useAuthStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("logout", () => {
    it("should clear accessToken, idToken, and refreshToken", () => {
      const store = useAuthStore();
      store.accessToken = "test-token";
      store.idToken = "test-id-token";
      store.refreshToken = "test-refresh-token";

      store.logout();

      expect(store.accessToken).toBeNull();
      expect(store.idToken).toBeNull();
      expect(store.refreshToken).toBeNull();
    });

    it("should clear expiresAt", () => {
      const store = useAuthStore();
      store.expiresAt = Date.now() + 3600000;

      store.logout();

      expect(store.expiresAt).toBeNull();
    });

    it("calls clearAuthTokens on logout", () => {
      const clearSpy = vi.spyOn(authInfra, "clearAuthTokens");
      const store = useAuthStore();
      store.logout();
      expect(clearSpy).toHaveBeenCalled();
    });

    it("should make isLoggedIn return false", () => {
      const store = useAuthStore();
      store.accessToken = "test-token";
      store.expiresAt = Date.now() + 3600000;
      expect(store.isLoggedIn).toBe(true);

      store.logout();

      expect(store.isLoggedIn).toBe(false);
    });

    it("reactively updates isLoggedIn to false when token expires over time", () => {
      const store = useAuthStore();
      store.accessToken = "test-token";
      store.expiresAt = Date.now() + 5000;
      expect(store.isLoggedIn).toBe(true);

      vi.advanceTimersByTime(15000);

      expect(store.isLoggedIn).toBe(false);
    });
  });

  describe("refreshSession & ensureValidAccessToken", () => {
    it("refreshes an expiring access token using the stored refresh token", async () => {
      vi.spyOn(authInfra, "createGoogleAccessTokenService").mockReturnValue({
        requestAuthCode: vi.fn(),
        exchangeAuthorizationCode: vi.fn(),
        refreshAccessToken: vi.fn().mockReturnValue(
          okAsync({
            access_token: "fresh-access-token",
            expires_in: 3600,
          }),
        ),
      });

      const store = useAuthStore();
      store.accessToken = "expiring-token";
      store.refreshToken = "stored-refresh-token";
      store.expiresAt = Date.now() + 10_000; // < 60s buffer

      const result = await store.ensureValidAccessToken();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe("fresh-access-token");
      }
      expect(store.accessToken).toBe("fresh-access-token");
      expect(store.isLoggedIn).toBe(true);
    });

    it("preserves refreshToken on transient token-refresh-failed error", async () => {
      vi.spyOn(authInfra, "createGoogleAccessTokenService").mockReturnValue({
        requestAuthCode: vi.fn(),
        exchangeAuthorizationCode: vi.fn(),
        refreshAccessToken: vi.fn().mockReturnValue(errAsync("token-refresh-failed" as const)),
      });

      const store = useAuthStore();
      store.accessToken = null;
      store.refreshToken = "offline-refresh-token";
      store.expiresAt = Date.now() - 1000;

      const result = await store.ensureValidAccessToken();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("token-refresh-failed");
      }
      expect(store.refreshToken).toBe("offline-refresh-token");
    });

    it("clears refreshToken and logs out when refresh token is rejected with refresh-token-invalid", async () => {
      vi.spyOn(authInfra, "createGoogleAccessTokenService").mockReturnValue({
        requestAuthCode: vi.fn(),
        exchangeAuthorizationCode: vi.fn(),
        refreshAccessToken: vi.fn().mockReturnValue(errAsync("refresh-token-invalid" as const)),
      });

      const store = useAuthStore();
      store.accessToken = "expired-token";
      store.refreshToken = "revoked-refresh-token";
      store.expiresAt = Date.now() - 1000;

      const result = await store.ensureValidAccessToken();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("refresh-token-invalid");
      }
      expect(store.refreshToken).toBeNull();
      expect(store.accessToken).toBeNull();
      expect(store.expiresAt).toBeNull();
    });

    it("returns idToken when valid and refreshes when expiring", async () => {
      vi.spyOn(authInfra, "createGoogleAccessTokenService").mockReturnValue({
        requestAuthCode: vi.fn(),
        exchangeAuthorizationCode: vi.fn(),
        refreshAccessToken: vi.fn().mockReturnValue(
          okAsync({
            access_token: "new-access-token",
            id_token: "new-id-token",
            expires_in: 3600,
          }),
        ),
      });

      const store = useAuthStore();
      store.idToken = "old-id-token";
      store.refreshToken = "valid-refresh-token";
      store.expiresAt = Date.now() - 1000;

      const result = await store.ensureValidIdToken();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe("new-id-token");
      }
      expect(store.idToken).toBe("new-id-token");
      expect(store.accessToken).toBe("new-access-token");
    });

    it("falls back to fresh accessToken when refresh response omits id_token", async () => {
      vi.spyOn(authInfra, "createGoogleAccessTokenService").mockReturnValue({
        requestAuthCode: vi.fn(),
        exchangeAuthorizationCode: vi.fn(),
        refreshAccessToken: vi.fn().mockReturnValue(
          okAsync({
            access_token: "refreshed-access-token",
            expires_in: 3600,
          }),
        ),
      });

      const store = useAuthStore();
      store.idToken = null;
      store.refreshToken = "valid-refresh-token";
      store.expiresAt = Date.now() - 1000;

      const result = await store.ensureValidIdToken();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe("refreshed-access-token");
      }
    });

    it("falls back to fresh accessToken when idToken JWT exp is expired and refresh omits id_token", async () => {
      // JWT with payload { exp: 100 } (timestamp in the past)
      const expiredPayload = btoa(JSON.stringify({ exp: 100 }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const expiredJwt = `eyJhbGciOiJSUzI1NiJ9.${expiredPayload}.dummy-sig`;

      vi.spyOn(authInfra, "createGoogleAccessTokenService").mockReturnValue({
        requestAuthCode: vi.fn(),
        exchangeAuthorizationCode: vi.fn(),
        refreshAccessToken: vi.fn().mockReturnValue(
          okAsync({
            access_token: "refreshed-access-token-2",
            expires_in: 3600,
          }),
        ),
      });

      const store = useAuthStore();
      store.idToken = expiredJwt;
      store.refreshToken = "valid-refresh-token";
      store.expiresAt = Date.now() - 1000;

      const result = await store.ensureValidIdToken();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe("refreshed-access-token-2");
      }
    });

    it("persists refreshed tokens via saveAuthTokens", async () => {
      const saveSpy = vi.spyOn(authInfra, "saveAuthTokens");
      vi.spyOn(authInfra, "createGoogleAccessTokenService").mockReturnValue({
        requestAuthCode: vi.fn(),
        exchangeAuthorizationCode: vi.fn(),
        refreshAccessToken: vi.fn().mockReturnValue(
          okAsync({
            access_token: "new-access-token",
            id_token: "new-id-token",
            expires_in: 3600,
          }),
        ),
      });

      const store = useAuthStore();
      store.refreshToken = "existing-refresh-token";
      store.expiresAt = Date.now() - 1000;

      await store.refreshSession();

      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: "new-access-token",
          idToken: "new-id-token",
          refreshToken: "existing-refresh-token",
        }),
      );
    });

    it("ignores stale loadAuthTokens hydration if logout runs before async storage resolves", async () => {
      let resolveStorage!: (value: {
        accessToken: string | null;
        refreshToken: string | null;
        idToken: string | null;
        expiresAt: number | null;
      }) => void;
      vi.spyOn(authInfra, "loadAuthTokens").mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveStorage = resolve;
          }),
      );

      const store = useAuthStore();
      const initPromise = store.init();
      store.logout();

      resolveStorage({
        accessToken: "stale-access",
        refreshToken: "stale-refresh",
        idToken: "stale-id",
        expiresAt: Date.now() + 60_000,
      });
      await initPromise;

      expect(store.accessToken).toBeNull();
      expect(store.refreshToken).toBeNull();
      expect(store.idToken).toBeNull();
      expect(store.isLoggedIn).toBe(false);
    });

    it("clears stale idToken when refresh response omits id_token", async () => {
      const saveSpy = vi.spyOn(authInfra, "saveAuthTokens");
      vi.spyOn(authInfra, "createGoogleAccessTokenService").mockReturnValue({
        requestAuthCode: vi.fn(),
        exchangeAuthorizationCode: vi.fn(),
        refreshAccessToken: vi.fn().mockReturnValue(
          okAsync({
            access_token: "fresh-access-token",
            expires_in: 3600,
          }),
        ),
      });

      const store = useAuthStore();
      store.idToken = "rejected-or-stale-id-token";
      store.refreshToken = "valid-refresh-token";
      store.expiresAt = Date.now() + 600_000;

      const result = await store.refreshSession(true);

      expect(result.isOk()).toBe(true);
      expect(store.idToken).toBeNull();
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: "fresh-access-token",
          idToken: null,
        }),
      );
    });
  });
});
