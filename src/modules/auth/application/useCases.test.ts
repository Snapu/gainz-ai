import { errAsync, okAsync } from "neverthrow";
import { describe, expect, it, vi } from "vitest";
import {
  CLIENT_ID,
  type GoogleAccessTokenService,
  refreshAccessToken,
  requestAccessToken,
  SCOPES,
} from "./useCases";

function createMockAuthService(
  overrides: Partial<GoogleAccessTokenService> = {},
): GoogleAccessTokenService {
  return {
    requestAuthCode: vi.fn().mockReturnValue(
      okAsync({
        code: "auth-code-123",
        scope: SCOPES.join(" "),
      }),
    ),
    exchangeAuthorizationCode: vi.fn().mockReturnValue(
      okAsync({
        access_token: "access-token-abc",
        refresh_token: "refresh-token-xyz",
        expires_in: 3600,
        scope: SCOPES.join(" "),
      }),
    ),
    refreshAccessToken: vi.fn().mockReturnValue(
      okAsync({
        access_token: "refreshed-access-token",
        expires_in: 3600,
      }),
    ),
    ...overrides,
  };
}

describe("auth application useCases", () => {
  describe("requestAccessToken", () => {
    it("requests an authorization code and exchanges it for access and refresh tokens", async () => {
      const service = createMockAuthService();

      const result = await requestAccessToken(service);

      expect(service.requestAuthCode).toHaveBeenCalledWith(CLIENT_ID, SCOPES);
      expect(service.exchangeAuthorizationCode).toHaveBeenCalledWith("auth-code-123");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          access_token: "access-token-abc",
          refresh_token: "refresh-token-xyz",
          expires_in: 3600,
          scope: SCOPES.join(" "),
        });
      }
    });

    it("returns missing-scopes without exchanging code when required scopes were not granted", async () => {
      const service = createMockAuthService({
        requestAuthCode: vi.fn().mockReturnValue(
          okAsync({
            code: "auth-code-123",
            scope: "openid email",
          }),
        ),
      });

      const result = await requestAccessToken(service);

      expect(service.exchangeAuthorizationCode).not.toHaveBeenCalled();
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("missing-scopes");
      }
    });

    it("returns missing-scopes when Google omits openid from scope string", async () => {
      const service = createMockAuthService({
        requestAuthCode: vi.fn().mockReturnValue(
          okAsync({
            code: "auth-code-123",
            scope: "https://www.googleapis.com/auth/drive.file",
          }),
        ),
      });

      const result = await requestAccessToken(service);

      expect(service.exchangeAuthorizationCode).not.toHaveBeenCalled();
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("missing-scopes");
      }
    });

    it("returns missing-scopes when scopes only match as substrings (e.g. drive.file.readonly)", async () => {
      const service = createMockAuthService({
        requestAuthCode: vi.fn().mockReturnValue(
          okAsync({
            code: "auth-code-123",
            scope: "openid https://www.googleapis.com/auth/drive.file.readonly",
          }),
        ),
      });

      const result = await requestAccessToken(service);

      expect(service.exchangeAuthorizationCode).not.toHaveBeenCalled();
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("missing-scopes");
      }
    });

    it("returns token-request-failed when the OAuth code popup fails", async () => {
      const service = createMockAuthService({
        requestAuthCode: vi.fn().mockReturnValue(errAsync("token-request-failed" as const)),
      });

      const result = await requestAccessToken(service);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("token-request-failed");
      }
    });

    it("returns token-exchange-failed when backend code exchange fails", async () => {
      const service = createMockAuthService({
        exchangeAuthorizationCode: vi
          .fn()
          .mockReturnValue(errAsync("token-exchange-failed" as const)),
      });

      const result = await requestAccessToken(service);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("token-exchange-failed");
      }
    });
  });

  describe("refreshAccessToken", () => {
    it("exchanges a refresh token for a new access token via the backend service", async () => {
      const service = createMockAuthService();

      const result = await refreshAccessToken(service, "refresh-token-xyz");

      expect(service.refreshAccessToken).toHaveBeenCalledWith("refresh-token-xyz");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.access_token).toBe("refreshed-access-token");
      }
    });

    it("returns token-refresh-failed when backend refresh fails", async () => {
      const service = createMockAuthService({
        refreshAccessToken: vi.fn().mockReturnValue(errAsync("token-refresh-failed" as const)),
      });

      const result = await refreshAccessToken(service, "bad-refresh-token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("token-refresh-failed");
      }
    });
  });
});
