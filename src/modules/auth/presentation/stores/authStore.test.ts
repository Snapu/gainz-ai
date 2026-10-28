import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/modules/auth/presentation";

describe("useAuthStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("logout", () => {
    it("should clear accessToken", () => {
      const store = useAuthStore();
      store.accessToken = "test-token";

      store.logout();

      expect(store.accessToken).toBeNull();
    });

    it("should clear expiresAt", () => {
      const store = useAuthStore();
      store.expiresAt = Date.now() + 3600000;

      store.logout();

      expect(store.expiresAt).toBeNull();
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
});
