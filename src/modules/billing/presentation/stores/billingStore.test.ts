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

import { hasPendingCheckoutRoute, useBillingStore } from "./billingStore";

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

  function disposeActivePinia(): void {
    const storeMap = (activePinia as { _s?: Map<string, { $dispose: () => void }> } | undefined)
      ?._s;
    storeMap?.forEach((store) => {
      store.$dispose();
    });
    (
      activePinia as (ReturnType<typeof createPinia> & { _e?: { stop: () => void } }) | undefined
    )?._e?.stop();
    activePinia = undefined;
  }

  function replaceActivePinia(): void {
    disposeActivePinia();
    activePinia = createPinia();
    setActivePinia(activePinia);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockIsLoggedIn.value = true;
    mockIdToken.value = "valid-id-token";
    vi.stubGlobal("fetch", fetchMock);
    replaceActivePinia();
  });

  afterEach(() => {
    disposeActivePinia();
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
    replaceActivePinia();
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
    replaceActivePinia();

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

  it("redeems an invite code, retries once on 401, updates entitlement + cache, and maps typed invite errors", async () => {
    const inviteEntitlement = createEntitlement({
      source: "invite_grant",
      canUseCoach: true,
      canUseClassify: true,
      evaluatedAt: "2026-11-27T16:15:00.000Z",
      inviteGrant: { expiresAt: "2026-12-27T00:00:00.000Z" },
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
        json: async () => ({ entitlement: inviteEntitlement }),
      });

    const store = useBillingStore();
    const okRes = await store.redeemInvite("  beta-2026 ");

    expect(okRes.isOk()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      action: "redeem-invite",
      code: "BETA-2026",
    });
    expect(store.entitlement).toEqual(inviteEntitlement);
    expect(store.isInviteGrant).toBe(true);
    expect(store.inviteExpiresAt).toBe("2026-12-27T00:00:00.000Z");

    const errorCases = [
      { status: 400, error: "invite-invalid" },
      { status: 409, error: "invite-exhausted" },
      { status: 409, error: "invite-already-redeemed" },
      { status: 410, error: "invite-expired" },
      { status: 429, error: "rate-limit-exceeded" },
    ] as const;

    for (const c of errorCases) {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: c.status,
        json: async () => ({ error: c.error }),
      });
      const errRes = await store.redeemInvite("SOME-CODE");
      expect(errRes.isErr()).toBe(true);
      if (errRes.isErr()) {
        expect(errRes.error).toBe(c.error);
      }
      expect(store.lastError).toBe(c.error);
    }

    const emptyRes = await store.redeemInvite("   ");
    expect(emptyRes.isErr()).toBe(true);
    if (emptyRes.isErr()) {
      expect(emptyRes.error).toBe("invite-invalid");
    }
  });

  it("redeems captured sessionStorage invite code once authenticated and preserves pending code across offline/transient failures", async () => {
    sessionStorage.setItem("gainz-pending-invite-code", "TESTER2026");

    // Logged out -> preserves pending code and makes zero network calls
    mockIsLoggedIn.value = false;
    const loggedOutStore = useBillingStore();
    const skipped = await loggedOutStore.redeemPendingInviteIfPresent();
    expect(skipped).toBeNull();
    expect(sessionStorage.getItem("gainz-pending-invite-code")).toBe("TESTER2026");
    expect(fetchMock).not.toHaveBeenCalled();

    // Logged in, transient HTTP 500 -> keeps pending code for later retry
    mockIsLoggedIn.value = true;
    replaceActivePinia();
    const store = useBillingStore();

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "billing-unavailable" }),
    });
    const transientOutcome = await store.redeemPendingInviteIfPresent();
    expect(transientOutcome?.isErr()).toBe(true);
    expect(sessionStorage.getItem("gainz-pending-invite-code")).toBe("TESTER2026");

    // Logged in, terminal invite error -> clears pending code so it does not loop forever
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 410,
      json: async () => ({ error: "invite-expired" }),
    });
    const terminalOutcome = await store.redeemPendingInviteIfPresent();
    expect(terminalOutcome?.isErr()).toBe(true);
    expect(sessionStorage.getItem("gainz-pending-invite-code")).toBeNull();

    // Logged in, success -> redeems and clears pending code
    sessionStorage.setItem("gainz-pending-invite-code", "FRESH2026");
    const inviteEntitlement = createEntitlement({
      source: "invite_grant",
      inviteGrant: { expiresAt: null },
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ entitlement: inviteEntitlement }),
    });
    const okOutcome = await store.redeemPendingInviteIfPresent();
    expect(okOutcome?.isOk()).toBe(true);
    expect(sessionStorage.getItem("gainz-pending-invite-code")).toBeNull();
    expect(store.isInviteGrant).toBe(true);
  });

  it("prevents earlier in-flight fetchEntitlement from overwriting a newly redeemed invite_grant even with identical timestamps", async () => {
    const sameTimestamp = "2026-11-27T16:30:00.000Z";
    const staleStatusEntitlement = createEntitlement({
      source: "free_allowance",
      evaluatedAt: sameTimestamp,
      freeAllowance: { coachUsed: 29, coachLimit: 30, classifyUsed: 0, classifyLimit: 40 },
    });
    const freshInviteEntitlement = createEntitlement({
      source: "invite_grant",
      evaluatedAt: sameTimestamp,
      inviteGrant: { expiresAt: null },
    });

    let resolveStatusFetch!: (val: unknown) => void;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStatusFetch = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ entitlement: freshInviteEntitlement }),
      });

    const store = useBillingStore();
    const statusPromise = store.fetchEntitlement();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const redeemRes = await store.redeemInvite("RACEFREE");
    expect(redeemRes.isOk()).toBe(true);
    expect(store.entitlement?.source).toBe("invite_grant");

    resolveStatusFetch({
      ok: true,
      status: 200,
      json: async () => ({ entitlement: staleStatusEntitlement }),
    });
    await statusPromise;

    expect(store.entitlement?.source).toBe("invite_grant");
    expect(store.isInviteGrant).toBe(true);
  });

  it("deduplicates concurrent pending redemptions, handles offline, and clears sessionStorage on explicit sign-out", async () => {
    sessionStorage.setItem("gainz-pending-invite-code", "DEDUP99");
    const hadOwnOnLine = Object.getOwnPropertyDescriptor(navigator, "onLine");
    let isOnline = false;
    Object.defineProperty(navigator, "onLine", { get: () => isOnline, configurable: true });

    try {
      const store = useBillingStore();
      expect(await store.redeemPendingInviteIfPresent()).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();

      isOnline = true;
      let resolveRedeem!: (val: unknown) => void;
      fetchMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRedeem = resolve;
          }),
      );

      const p1 = store.redeemPendingInviteIfPresent();
      const p2 = store.redeemPendingInviteIfPresent();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      // Sign-out invalidates in-flight pending redemption and clears stale sessionStorage key
      mockIsLoggedIn.value = false;
      await nextTick();
      expect(sessionStorage.getItem("gainz-pending-invite-code")).toBeNull();

      resolveRedeem({
        ok: true,
        status: 200,
        json: async () => ({
          entitlement: createEntitlement({
            source: "invite_grant",
            inviteGrant: { expiresAt: null },
          }),
        }),
      });
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBeNull();
      expect(r2).toBeNull();
      expect(store.entitlement).toBeNull();
    } finally {
      if (hadOwnOnLine) Object.defineProperty(navigator, "onLine", hadOwnOnLine);
      else delete (navigator as unknown as Record<string, unknown>).onLine;
    }
  });

  it("prevents a stale fetchEntitlement from clobbering isFetching or inFlightFetch of a newer fetch started after redeemInvite", async () => {
    const staleEntitlement = createEntitlement({ source: "free_allowance" });
    const inviteEntitlement = createEntitlement({
      source: "invite_grant",
      inviteGrant: { expiresAt: null },
    });

    let resolveFetch1!: (val: unknown) => void;
    let resolveFetch2!: (val: unknown) => void;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFetch1 = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ entitlement: inviteEntitlement }),
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFetch2 = resolve;
          }),
      );

    const store = useBillingStore();
    const fetch1 = store.fetchEntitlement();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await store.redeemInvite("REDEEM2026");

    const fetch2 = store.fetchEntitlement();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(store.isFetching).toBe(true);

    // Settling stale fetch1 after fetchEpoch bumped must NOT clear fetch2's loading/dedup state
    resolveFetch1({
      ok: true,
      status: 200,
      json: async () => ({ entitlement: staleEntitlement }),
    });
    await fetch1;

    expect(store.isFetching).toBe(true);
    expect(store.entitlement?.source).toBe("invite_grant");
    expect(store.fetchEntitlement()).toBe(fetch2);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    resolveFetch2({
      ok: true,
      status: 200,
      json: async () => ({ entitlement: inviteEntitlement }),
    });
    await fetch2;
    expect(store.isFetching).toBe(false);
  });

  it("does not clear a newer pending invite code stored in sessionStorage while an older redemption is in-flight", async () => {
    sessionStorage.setItem("gainz-pending-invite-code", "CODE_A");
    let resolveRedeemA!: (val: unknown) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRedeemA = resolve;
        }),
    );

    const store = useBillingStore();
    const pendingPromise = store.redeemPendingInviteIfPresent();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    sessionStorage.setItem("gainz-pending-invite-code", "CODE_B");
    resolveRedeemA({
      ok: false,
      status: 410,
      json: async () => ({ error: "invite-expired" }),
    });

    await pendingPromise;
    expect(sessionStorage.getItem("gainz-pending-invite-code")).toBe("CODE_B");
  });

  it("validates Stripe URLs on startCheckout and openPortal before top-level navigation", async () => {
    const store = useBillingStore();
    const navigated: string[] = [];
    const navFn = (url: string) => {
      navigated.push(url);
      return true;
    };

    // Untrusted redirect URL rejected at ACL boundary
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        checkoutUrl: "https://evil.example.com/pay",
        redirectedToPortal: false,
      }),
    });
    const badRes = await store.startCheckout(navFn);
    expect(badRes.isErr()).toBe(true);
    expect(navigated).toEqual([]);
    expect(store.isRedirectingToCheckout).toBe(false);

    // Trusted Stripe Checkout URL triggers navigation
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_99",
        redirectedToPortal: false,
      }),
    });
    const okCheckout = await store.startCheckout(navFn);
    expect(okCheckout.isOk()).toBe(true);
    expect(navigated).toEqual(["https://checkout.stripe.com/c/pay/cs_test_99"]);

    // Trusted Stripe Customer Portal URL triggers navigation
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        portalUrl: "https://billing.stripe.com/p/session/bps_test_99",
      }),
    });
    const okPortal = await store.openPortal(navFn);
    expect(okPortal.isOk()).toBe(true);
    expect(navigated).toEqual([
      "https://checkout.stripe.com/c/pay/cs_test_99",
      "https://billing.stripe.com/p/session/bps_test_99",
    ]);
  });

  it("polls server status on ?checkout=success without unlocking from URL flag alone and clears flag on activation or timeout", async () => {
    sessionStorage.setItem("gainz-pending-checkout-return", "success");
    const store = useBillingStore();

    // Never unlocks Pro locally from URL flag alone before webhook settles
    expect(store.isSubscription).toBe(false);

    const freeSnapshot = createEntitlement({ source: "free_allowance" });
    const proSnapshot = createEntitlement({
      source: "subscription",
      evaluatedAt: "2026-11-27T18:00:00.000Z",
      subscription: {
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: "2026-12-27T00:00:00.000Z",
        graceEndsAt: null,
      },
      hasCustomerPortal: true,
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ entitlement: freeSnapshot }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ entitlement: proSnapshot }),
      });

    const outcome = await store.pollCheckoutEntitlementIfPending({ delaysMs: [0, 0, 0] });
    expect(outcome).toBe("activated");
    expect(store.isSubscription).toBe(true);
    expect(store.hasCustomerPortal).toBe(true);
    expect(sessionStorage.getItem("gainz-pending-checkout-return")).toBeNull();

    // Timeout clears pending poll flag cleanly while keeping one-shot checkout route intact
    localStorage.clear();
    replaceActivePinia();
    const freshStore = useBillingStore();
    sessionStorage.setItem("gainz-pending-checkout-return", "success");
    sessionStorage.setItem("gainz-pending-checkout-route", "coach");
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ entitlement: freeSnapshot }),
    });

    const timeoutOutcome = await freshStore.pollCheckoutEntitlementIfPending({ delaysMs: [0, 0] });
    expect(timeoutOutcome).toBe("pending");
    expect(freshStore.isSubscription).toBe(false);
    expect(sessionStorage.getItem("gainz-pending-checkout-return")).toBeNull();
    expect(sessionStorage.getItem("gainz-pending-checkout-route")).toBe("coach");
  });

  it("deduplicates concurrent checkout polls, aborts cleanly on sign-out, and preserves poll flag while offline", async () => {
    const store = useBillingStore();
    const hadOwnOnLine = Object.getOwnPropertyDescriptor(navigator, "onLine");
    let isOnline = false;
    Object.defineProperty(navigator, "onLine", { get: () => isOnline, configurable: true });

    try {
      sessionStorage.setItem("gainz-pending-checkout-return", "success");
      sessionStorage.setItem("gainz-pending-checkout-route", "coach");

      // Offline preserves poll flag and avoids network fetch
      expect(await store.pollCheckoutEntitlementIfPending({ delaysMs: [0] })).toBeNull();
      expect(sessionStorage.getItem("gainz-pending-checkout-return")).toBe("success");
      expect(fetchMock).not.toHaveBeenCalled();

      // Deduplicates concurrent polls onto one single status sequence
      isOnline = true;
      let resolveFirstStatus!: (val: unknown) => void;
      fetchMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstStatus = resolve;
          }),
      );
      const p1 = store.pollCheckoutEntitlementIfPending({ delaysMs: [0] });
      const p2 = store.pollCheckoutEntitlementIfPending({ delaysMs: [0] });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      resolveFirstStatus({
        ok: true,
        status: 200,
        json: async () => ({
          entitlement: createEntitlement({
            source: "subscription",
            subscription: {
              status: "active",
              cancelAtPeriodEnd: false,
              currentPeriodEnd: "2026-12-27T00:00:00.000Z",
              graceEndsAt: null,
            },
            hasCustomerPortal: true,
          }),
        }),
      });
      expect(await Promise.all([p1, p2])).toEqual(["activated", "activated"]);
      expect(hasPendingCheckoutRoute()).toBe(true);

      // Sign-out mid-poll aborts and clears both checkout flags
      sessionStorage.setItem("gainz-pending-checkout-return", "success");
      sessionStorage.setItem("gainz-pending-checkout-route", "coach");
      let resolveSignedOutFetch!: (val: unknown) => void;
      fetchMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSignedOutFetch = resolve;
          }),
      );
      const abortPoll = store.pollCheckoutEntitlementIfPending({ delaysMs: [0] });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

      mockIsLoggedIn.value = false;
      await nextTick();
      expect(sessionStorage.getItem("gainz-pending-checkout-return")).toBeNull();
      expect(sessionStorage.getItem("gainz-pending-checkout-route")).toBeNull();

      resolveSignedOutFetch({
        ok: true,
        status: 200,
        json: async () => ({ entitlement: createEntitlement({ source: "subscription" }) }),
      });
      expect(await abortPoll).toBeNull();
    } finally {
      if (hadOwnOnLine) Object.defineProperty(navigator, "onLine", hadOwnOnLine);
      else delete (navigator as unknown as Record<string, unknown>).onLine;
    }
  });
});
