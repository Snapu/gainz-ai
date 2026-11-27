import type { Entitlement } from "../domain";
import { parseEntitlement } from "./entitlementSchema";

const ENTITLEMENT_CACHE_KEY = "billing:entitlement-v1";

export function createLocalStorageEntitlementCache() {
  return {
    load(): Entitlement | null {
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(ENTITLEMENT_CACHE_KEY);
      if (!raw) return null;
      try {
        const parsed = parseEntitlement(JSON.parse(raw));
        if (!parsed) {
          localStorage.removeItem(ENTITLEMENT_CACHE_KEY);
          return null;
        }
        return parsed;
      } catch {
        localStorage.removeItem(ENTITLEMENT_CACHE_KEY);
        return null;
      }
    },

    save(entitlement: Entitlement): void {
      if (typeof localStorage === "undefined") return;
      try {
        localStorage.setItem(ENTITLEMENT_CACHE_KEY, JSON.stringify(entitlement));
      } catch {
        // Best-effort local cache persistence
      }
    },

    clear(): void {
      if (typeof localStorage === "undefined") return;
      localStorage.removeItem(ENTITLEMENT_CACHE_KEY);
    },
  };
}
