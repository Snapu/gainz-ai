import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAuthTokens,
  loadAuthTokens,
  readSynchronousWebTokens,
  saveAuthTokens,
} from "./authStorage";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
}));

describe("authStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("when running on a native platform (Capacitor)", () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    });

    it("persists tokens to native Preferences", async () => {
      await saveAuthTokens({
        accessToken: "access-123",
        refreshToken: "refresh-456",
        idToken: "id-789",
        expiresAt: 1700000000000,
      });

      expect(Preferences.set).toHaveBeenCalledWith({
        key: "auth:accessToken",
        value: "access-123",
      });
      expect(Preferences.set).toHaveBeenCalledWith({
        key: "auth:refreshToken",
        value: "refresh-456",
      });
      expect(Preferences.set).toHaveBeenCalledWith({
        key: "auth:idToken",
        value: "id-789",
      });
      expect(Preferences.set).toHaveBeenCalledWith({
        key: "auth:expiresAt",
        value: "1700000000000",
      });
    });

    it("loads tokens from native Preferences", async () => {
      const tokenMap: Record<string, string> = {
        "auth:accessToken": "native-access",
        "auth:refreshToken": "native-refresh",
        "auth:idToken": "native-id",
        "auth:expiresAt": "1700000000000",
      };
      vi.mocked(Preferences.get).mockImplementation(async ({ key }) => ({
        value: tokenMap[key] ?? null,
      }));

      const tokens = await loadAuthTokens();

      expect(tokens).toEqual({
        accessToken: "native-access",
        refreshToken: "native-refresh",
        idToken: "native-id",
        expiresAt: 1700000000000,
      });
    });

    it("clears tokens from native Preferences", async () => {
      await clearAuthTokens();

      expect(Preferences.remove).toHaveBeenCalledWith({ key: "auth:accessToken" });
      expect(Preferences.remove).toHaveBeenCalledWith({ key: "auth:refreshToken" });
      expect(Preferences.remove).toHaveBeenCalledWith({ key: "auth:idToken" });
      expect(Preferences.remove).toHaveBeenCalledWith({ key: "auth:expiresAt" });
    });

    it("returns empty tokens for synchronous read on native platform", () => {
      localStorage.setItem("auth:accessToken", "should-be-ignored");

      const tokens = readSynchronousWebTokens();

      expect(tokens).toEqual({
        accessToken: null,
        refreshToken: null,
        idToken: null,
        expiresAt: null,
      });
    });
  });

  describe("when running on web", () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    });

    it("persists tokens to localStorage", async () => {
      await saveAuthTokens({
        accessToken: "web-access",
        refreshToken: "web-refresh",
        idToken: "web-id",
        expiresAt: 1700000000000,
      });

      expect(localStorage.getItem("auth:accessToken")).toBe("web-access");
      expect(localStorage.getItem("auth:refreshToken")).toBe("web-refresh");
      expect(localStorage.getItem("auth:idToken")).toBe("web-id");
      expect(localStorage.getItem("auth:expiresAt")).toBe("1700000000000");
    });

    it("loads tokens from localStorage", async () => {
      localStorage.setItem("auth:accessToken", "web-access-2");
      localStorage.setItem("auth:refreshToken", "web-refresh-2");
      localStorage.setItem("auth:idToken", "web-id-2");
      localStorage.setItem("auth:expiresAt", "1700000000500");

      const tokens = await loadAuthTokens();

      expect(tokens).toEqual({
        accessToken: "web-access-2",
        refreshToken: "web-refresh-2",
        idToken: "web-id-2",
        expiresAt: 1700000000500,
      });
    });

    it("clears tokens from localStorage", async () => {
      localStorage.setItem("auth:accessToken", "web-access-2");
      localStorage.setItem("auth:refreshToken", "web-refresh-2");

      await clearAuthTokens();

      expect(localStorage.getItem("auth:accessToken")).toBeNull();
      expect(localStorage.getItem("auth:refreshToken")).toBeNull();
    });

    it("reads synchronous web tokens from localStorage", () => {
      localStorage.setItem("auth:accessToken", "web-sync-access");
      localStorage.setItem("auth:refreshToken", "web-sync-refresh");
      localStorage.setItem("auth:idToken", "web-sync-id");
      localStorage.setItem("auth:expiresAt", "1700000000888");

      const tokens = readSynchronousWebTokens();

      expect(tokens).toEqual({
        accessToken: "web-sync-access",
        refreshToken: "web-sync-refresh",
        idToken: "web-sync-id",
        expiresAt: 1700000000888,
      });
    });
  });
});
