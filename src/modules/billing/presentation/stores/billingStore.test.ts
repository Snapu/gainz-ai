import { errAsync, okAsync } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import type { Entitlement } from "@/modules/billing/domain";

const mockIsLoggedIn = ref(true);
const mockIdToken = ref<string | null>("valid-id-token");
const mockRefreshSession = vi.fn();

vi.mock("@/modules/auth/presentation", () => ({
  useAuthStore: () => ({
    get isLoggedIn() {
      return mockIsLoggedIn.value;
    },
    get idToken() {
      return mockIdToken.value;
    },
    ensureValidIdToken: () =>
      mockIdToken.value ? okAsync(mockIdToken.value) : errAsync("token-refresh-failed" as const),
    refreshSession: (...args: unknown[]) => mockRefreshSession(...args),
  }),
}));

import { useBillingStore } from "./billingStore";

const ENTITLEMENT_CACHE_KEY = "billing:entitlement-v1";

function createEntitlement(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    source: "free_allowance",
    canUseCoach: true,
    canUseClassify: true,
    evaluatedAt: "2026-11-26T12:00:00.000Z",
    freeAllowance: {
      coachUsed: 3,
      coachLimit: 30,
      classifyUsed: 4,
      classifyLimit: 40,
    },
    subscription: null,
    inviteGrant: null,
    hasCustomerPortal: false,
    ...overrides,
  };
}

describe("useBillingStore", () => {
  const fetchMock = vi.fn();
  let activePinia: ReturnType<typeof createPinia> | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockIsLoggedIn.value = true;
    mockIdToken.value = "valid-id-token";
    vi.stubGlobal("fetch", fetchMock);
    activePinia = createPinia();
    setActivePinia(activePinia);
  });

  afterEach(() => {
    (
      activePinia as (ReturnType<typeof createPinia> & { _e?: { stop: () => void } }) | undefined
    )?._e?.stop();
    activePinia = undefined;
    vi.unstubAllGlobals();
  });

  it("hydrates synchronously from valid localStorage cache and drops corrupt entries", () => {
    const cached = createEntitlement({
      freeAllowance: { coachUsed: 29, coachLimit: 30, classifyUsed: 10, classifyLimit: 40 },
    });
    localStorage.setItem(ENTITLEMENT_CACHE_KEY, JSON.stringify(cached));

    const store = useBillingStore();
    expect(store.entitlement).toEqual(cached);
    expect(store.freeCoachRemaining).toBe(1);
    expect(store.isFreeAllowance).toBe(true);
    expect(store.canUseCoach).toBe(true);

    localStorage.setItem(ENTITLEMENT_CACHE_KEY, "{not-valid-entitlement");
    activePinia = createPinia();
    setActivePinia(activePinia);
    const cleanStore = useBillingStore();
    expect(cleanStore.entitlement).toBeNull();
    expect(cleanStore.canUseCoach).toBe(true);
    expect(localStorage.getItem(ENTITLEMENT_CACHE_KEY)).toBeNull();
  });

  it("fetches Entitlement from billing Edge Function via Zod ACL and retries once on 401", async () => {
    const serverEntitlement = createEntitlement({
      source: "none",
      canUseCoach: false,
      canUseClassify: true,
      evaluatedAt: "2026-11-26T12:10:00.000Z",
      freeAllowance: { coachUsed: 30, coachLimit: 30, classifyUsed: 8, classifyLimit: 40 },
    });

    mockRefreshSession.mockReturnValueOnce(okAsync("fresh-id-token"));
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "unauthorized" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ entitlement: serverEntitlement }),
      });

    const store = useBillingStore();
    const res = await store.fetchEntitlement();

    expect(res.isOk()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.entitlement).toEqual(serverEntitlement);
    expect(store.canUseCoach).toBe(false);
    expect(store.canUseClassify).toBe(true);
    expect(JSON.parse(localStorage.getItem(ENTITLEMENT_CACHE_KEY) ?? "null")).toEqual(
      serverEntitlement,
    );
  });

  it("ignores stale snapshots with older evaluatedAt timestamps", () => {
    const store = useBillingStore();
    const newer = createEntitlement({
      evaluatedAt: "2026-11-26T12:10:00.000Z",
      freeAllowance: { coachUsed: 20, coachLimit: 30, classifyUsed: 5, classifyLimit: 40 },
    });
    const stale = createEntitlement({
      evaluatedAt: "2026-11-26T12:05:00.000Z",
      freeAllowance: { coachUsed: 15, coachLimit: 30, classifyUsed: 4, classifyLimit: 40 },
    });

    store.applyEntitlement(newer);
    store.applyEntitlement(stale);

    expect(store.entitlement).toEqual(newer);
    expect(store.freeCoachRemaining).toBe(10);
  });

  it("clears memory and localStorage reactively when user signs out", async () => {
    const store = useBillingStore();
    store.applyEntitlement(createEntitlement());
    expect(localStorage.getItem(ENTITLEMENT_CACHE_KEY)).not.toBeNull();

    mockIsLoggedIn.value = false;
    await nextTick();

    expect(store.entitlement).toBeNull();
    expect(localStorage.getItem(ENTITLEMENT_CACHE_KEY)).toBeNull();
  });

  it("clears stale localStorage immediately if instantiated while already signed out", () => {
    localStorage.setItem(ENTITLEMENT_CACHE_KEY, JSON.stringify(createEntitlement()));
    mockIsLoggedIn.value = false;
    activePinia = createPinia();
    setActivePinia(activePinia);

    const store = useBillingStore();
    expect(store.entitlement).toBeNull();
    expect(localStorage.getItem(ENTITLEMENT_CACHE_KEY)).toBeNull();
  });

  it("deduplicates concurrent fetchEntitlement calls and tracks isFetching cleanly", async () => {
    let resolveFetch!: (val: unknown) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const store = useBillingStore();
    const p1 = store.fetchEntitlement();
    const p2 = store.fetchEntitlement();

    expect(p1).toBe(p2);
    expect(store.isFetching).toBe(true);
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const serverEntitlement = createEntitlement({
      freeAllowance: { coachUsed: 7, coachLimit: 30, classifyUsed: 2, classifyLimit: 40 },
    });
    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({ entitlement: serverEntitlement }),
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.isOk()).toBe(true);
    expect(r2.isOk()).toBe(true);
    expect(store.isFetching).toBe(false);
    expect(store.entitlement).toEqual(serverEntitlement);
  });

  it("ignores in-flight fetchEntitlement response if user signed out or clear() ran meanwhile", async () => {
    let resolveFetch!: (val: unknown) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const store = useBillingStore();
    const pending = store.fetchEntitlement();
    expect(store.isFetching).toBe(true);
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    store.clear();
    mockIsLoggedIn.value = false;
    expect(store.isFetching).toBe(false);

    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({ entitlement: createEntitlement() }),
    });
    await pending;

    expect(store.entitlement).toBeNull();
    expect(localStorage.getItem(ENTITLEMENT_CACHE_KEY)).toBeNull();
    expect(store.isFetching).toBe(false);
  });

  it("skips network when offline and maps HTTP 500 to billing-unavailable", async () => {
    const hadOwnOnLine = Object.getOwnPropertyDescriptor(navigator, "onLine");
    let isOnline = false;
    Object.defineProperty(navigator, "onLine", { get: () => isOnline, configurable: true });
    try {
      const store = useBillingStore();
      const offlineRes = await store.fetchEntitlement();
      expect(offlineRes.isErr()).toBe(true);
      if (offlineRes.isErr()) {
        expect(offlineRes.error).toBe("billing-unavailable");
      }
      expect(fetchMock).not.toHaveBeenCalled();

      isOnline = true;
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });
      const errRes = await store.fetchEntitlement();
      expect(errRes.isErr()).toBe(true);
      if (errRes.isErr()) {
        expect(errRes.error).toBe("billing-unavailable");
      }
      expect(store.lastError).toBe("billing-unavailable");
      expect(store.isFetching).toBe(false);
    } finally {
      if (hadOwnOnLine) Object.defineProperty(navigator, "onLine", hadOwnOnLine);
      else delete (navigator as unknown as Record<string, unknown>).onLine;
    }
  });
});
