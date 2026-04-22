import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "./auth";

describe("useAuthStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
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
  });
});
