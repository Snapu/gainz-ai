import { errAsync, okAsync } from "neverthrow";
import { createPinia, getActivePinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, nextTick, ref } from "vue";
import type { Entitlement } from "@/modules/billing/domain";
import { useBillingStore } from "@/modules/billing/presentation";
import { setLocale } from "@/shared/presentation/i18n";

const toastMock = vi.fn();

vi.mock("@/modules/auth/presentation", () => ({
  useAuthStore: () => ({
    isLoggedIn: true,
    idToken: "valid-token",
    ensureValidIdToken: () => okAsync("valid-token"),
    refreshSession: vi.fn(() => okAsync("valid-token")),
  }),
}));

vi.mock("@/shared/presentation/composables/useToast", () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

vi.mock("@/shared/presentation/components/ui/UiBottomSheet.vue", () => ({
  default: defineComponent({
    props: { open: Boolean, title: String, subtitle: String },
    template: `<div v-if="open" data-testid="membership-sheet"><h2>{{ title }}</h2><p>{{ subtitle }}</p><slot /></div>`,
  }),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/modules/platform/presentation", () => ({
  useSpreadsheetStore: () => ({
    openInBrowser: vi.fn(),
    switchSpreadsheet: vi.fn(() => okAsync(undefined)),
  }),
}));

vi.mock("@/modules/profile/presentation", () => ({
  WIZARD_STEPS: [],
}));

vi.mock("@/modules/trainingLogs/presentation", () => ({
  useExerciseLogsStore: () => ({
    showPendingSync: false,
    isOnline: true,
    isSyncingPending: false,
    isRefreshing: false,
    pendingSyncCount: 0,
    refresh: vi.fn(),
  }),
}));

vi.mock("@/shared/presentation/composables/useAccountActions", () => ({
  useAccountActions: () => ({
    isDeleting: ref(false),
    hasActiveSpreadsheet: () => false,
    hasActiveSubscription: () => false,
    ensureSubscriptionStatusLoaded: vi.fn(),
    signOut: vi.fn(),
    deleteAccount: vi.fn(),
  }),
}));

vi.mock("@/shared/presentation/components/DeleteAccountSheet.vue", () => ({
  default: defineComponent({ template: "<div />" }),
}));

vi.mock("@/shared/presentation/components/ui/UiDropdownMenu.vue", () => ({
  default: defineComponent({ template: `<div><slot name="trigger" /><slot /></div>` }),
}));

vi.mock("@/shared/presentation/components/ui/UiDropdownMenuItem.vue", () => ({
  default: defineComponent({
    emits: ["select"],
    template: `<button type="button" data-testid="menu-item" @click="$emit('select')"><slot /></button>`,
  }),
}));

import GlobalHeaderActions from "@/shared/presentation/components/GlobalHeaderActions.vue";
import MembershipSheet from "./MembershipSheet.vue";
import PastDueGraceBanner from "./PastDueGraceBanner.vue";
import UpgradeCard from "./UpgradeCard.vue";

function makeEntitlement(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    source: "free_allowance",
    canUseCoach: true,
    canUseClassify: true,
    evaluatedAt: "2026-11-27T12:00:00.000Z",
    freeAllowance: {
      coachUsed: 30,
      coachLimit: 30,
      classifyUsed: 5,
      classifyLimit: 40,
    },
    subscription: null,
    inviteGrant: null,
    hasCustomerPortal: false,
    ...overrides,
  };
}

function mountWithPinia(component: object, props: Record<string, unknown> = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const app = createApp(component, props);
  app.use(getActivePinia() ?? createPinia());
  app.mount(host);
  return {
    host,
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

describe("InviteCodeForm, UpgradeCard, and MembershipSheet flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    setLocale("en");
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("toggles collapsible invite code form on UpgradeCard, shows inline localized error, and redeems validly", async () => {
    const mounted = mountWithPinia(UpgradeCard);
    try {
      const store = useBillingStore();
      const redeemSpy = vi
        .spyOn(store, "redeemInvite")
        .mockReturnValueOnce(errAsync("invite-exhausted"))
        .mockReturnValueOnce(
          okAsync(
            makeEntitlement({
              source: "invite_grant",
              inviteGrant: { expiresAt: "2026-12-27T00:00:00.000Z" },
            }),
          ),
        );

      expect(mounted.host.querySelector("input")).toBeNull();
      const toggleBtn = Array.from(mounted.host.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Have an invite code?"),
      );
      expect(toggleBtn).toBeDefined();
      toggleBtn?.click();
      await nextTick();

      const input = mounted.host.querySelector("input") as HTMLInputElement | null;
      expect(input).not.toBeNull();
      if (!input) return;

      input.value = "usedup99";
      input.dispatchEvent(new Event("input"));
      await nextTick();

      const form = mounted.host.querySelector("form");
      form?.dispatchEvent(new Event("submit", { cancelable: true }));
      await vi.waitFor(() => {
        expect(redeemSpy).toHaveBeenCalledWith("USEDUP99");
        expect(mounted.host.textContent).toContain("redemption limit");
      });

      // Editing clears stale inline error immediately
      input.value = "fresh99";
      input.dispatchEvent(new Event("input"));
      await nextTick();
      expect(mounted.host.textContent).not.toContain("redemption limit");
      form?.dispatchEvent(new Event("submit", { cancelable: true }));
      await vi.waitFor(() => {
        expect(redeemSpy).toHaveBeenCalledWith("FRESH99");
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: "default",
            title: "Tester Access Activated",
          }),
        );
      });
    } finally {
      mounted.unmount();
    }
  });

  it("handles cold-cache/loading/unlimited states and closes MembershipSheet on manual redeem", async () => {
    const store = useBillingStore();
    const fetchSpy = vi
      .spyOn(store, "fetchEntitlement")
      .mockReturnValue(errAsync("billing-unavailable"));

    const openRef = ref(true);
    const Wrapper = defineComponent({
      setup() {
        return { openRef };
      },
      components: { MembershipSheet },
      template: `<MembershipSheet v-model:open="openRef" />`,
    });

    const mounted = mountWithPinia(Wrapper);
    try {
      // Cold cache (entitlement === null) triggers fetch & shows neutral unavailable status, never exhausted starter copy
      await nextTick();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(mounted.host.textContent).toContain("Status Unavailable");
      expect(mounted.host.textContent).not.toContain("30 complimentary");

      store.isFetching = true;
      await nextTick();
      expect(mounted.host.textContent).toContain("Loading membership status...");
      store.isFetching = false;

      store.applyEntitlement(
        makeEntitlement({
          source: "free_allowance",
          freeAllowance: { coachUsed: 5, coachLimit: 30, classifyUsed: 0, classifyLimit: 40 },
        }),
      );
      await nextTick();

      expect(mounted.host.textContent).toContain("Starter Budget");
      expect(mounted.host.textContent).toContain("25 / 30");
      const inviteSection = mounted.host.querySelector(
        '[data-testid="membership-invite-section"]',
      ) as HTMLElement | null;
      expect(inviteSection?.style.display).not.toBe("none");

      // Submitting inside MembershipSheet closes sheet on success
      vi.spyOn(store, "redeemInvite").mockImplementationOnce((code) => {
        const next = makeEntitlement({
          source: "invite_grant",
          inviteGrant: { expiresAt: "2026-12-27T00:00:00.000Z" },
        });
        store.applyEntitlement(next);
        expect(code).toBe("BETA-2026");
        return okAsync(next);
      });
      const input = mounted.host.querySelector("input") as HTMLInputElement;
      input.value = "beta-2026";
      input.dispatchEvent(new Event("input"));
      await nextTick();
      mounted.host.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }));

      await vi.waitFor(() => {
        expect(openRef.value).toBe(false);
      });

      // Re-open to verify expiry & unlimited grant formatting
      openRef.value = true;
      await nextTick();
      expect(mounted.host.textContent).toContain("Tester Access");
      expect(mounted.host.textContent).toContain("Dec 27, 2026");
      const hiddenInviteSection = mounted.host.querySelector(
        '[data-testid="membership-invite-section"]',
      ) as HTMLElement | null;
      expect(hiddenInviteSection?.style.display).toBe("none");

      store.applyEntitlement(
        makeEntitlement({
          source: "invite_grant",
          evaluatedAt: "2026-11-27T12:05:00.000Z",
          inviteGrant: { expiresAt: null },
        }),
      );
      await nextTick();
      expect(mounted.host.textContent).toContain("Ongoing tester access (no expiration date)");
    } finally {
      mounted.unmount();
    }
  });

  it("renders Membership section cleanly in GlobalHeaderActions without duplicate label text and opens MembershipSheet", async () => {
    const store = useBillingStore();
    store.applyEntitlement(
      makeEntitlement({
        source: "invite_grant",
        inviteGrant: { expiresAt: "2026-12-27T00:00:00.000Z" },
      }),
    );

    const mounted = mountWithPinia(GlobalHeaderActions);
    try {
      await nextTick();
      const membershipItem = Array.from(
        mounted.host.querySelectorAll('[data-testid="menu-item"]'),
      ).find((el) => el.textContent?.includes("Valid until Dec 27, 2026"));
      expect(membershipItem).toBeDefined();

      // Label ("Membership") + single badge ("Tester Access"), zero duplicated "Tester Access" text, plus ChevronRight SVG
      const itemText = membershipItem?.textContent ?? "";
      expect(itemText.match(/Tester Access/g)?.length).toBe(1);
      expect(membershipItem?.querySelector("svg")).not.toBeNull();

      // Selecting opens MembershipSheet
      expect(mounted.host.querySelector('[data-testid="membership-sheet"]')).toBeNull();
      (membershipItem as HTMLElement).click();
      await nextTick();
      expect(mounted.host.querySelector('[data-testid="membership-sheet"]')).not.toBeNull();
    } finally {
      mounted.unmount();
    }
  });

  it("launches checkout from UpgradeCard primary CTA, handles PastDueGraceBanner portal recovery, and shows portal access even for canceled customers", async () => {
    const store = useBillingStore();
    const startCheckoutSpy = vi.spyOn(store, "startCheckout").mockReturnValue(okAsync(undefined));
    const openPortalSpy = vi.spyOn(store, "openPortal").mockReturnValue(okAsync(undefined));

    // UpgradeCard subscribe CTA launches checkout
    const upgradeMounted = mountWithPinia(UpgradeCard);
    try {
      const subscribeBtn = Array.from(upgradeMounted.host.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Subscribe to GainzAI Pro"),
      );
      expect(subscribeBtn).toBeDefined();
      subscribeBtn?.click();
      expect(startCheckoutSpy).toHaveBeenCalledTimes(1);
    } finally {
      upgradeMounted.unmount();
    }

    // PastDueGraceBanner shows deadline and opens Stripe Portal in 1 tap
    store.applyEntitlement(
      makeEntitlement({
        source: "subscription",
        subscription: {
          status: "past_due",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: "2026-12-01T00:00:00.000Z",
          graceEndsAt: "2026-11-30T00:00:00.000Z",
        },
        hasCustomerPortal: true,
      }),
    );

    const bannerMounted = mountWithPinia(PastDueGraceBanner);
    try {
      expect(bannerMounted.host.textContent).toContain("Nov 30, 2026");
      const updateBtn = Array.from(bannerMounted.host.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Update Payment Method"),
      );
      expect(updateBtn).toBeDefined();
      updateBtn?.click();
      expect(openPortalSpy).toHaveBeenCalledTimes(1);
    } finally {
      bannerMounted.unmount();
    }

    // MembershipSheet shows cancelling expiry & retains invoice/receipt portal access after cancellation
    store.applyEntitlement(
      makeEntitlement({
        source: "subscription",
        evaluatedAt: "2026-11-27T13:00:00.000Z",
        subscription: {
          status: "active",
          cancelAtPeriodEnd: true,
          currentPeriodEnd: "2026-12-27T00:00:00.000Z",
          graceEndsAt: null,
        },
        hasCustomerPortal: true,
      }),
    );

    const sheetMounted = mountWithPinia(MembershipSheet, { open: true });
    try {
      await nextTick();
      expect(sheetMounted.host.textContent).toContain("Ends Dec 27, 2026");

      store.applyEntitlement(
        makeEntitlement({
          source: "none",
          canUseCoach: false,
          canUseClassify: false,
          evaluatedAt: "2026-11-27T14:00:00.000Z",
          subscription: {
            status: "canceled",
            cancelAtPeriodEnd: false,
            currentPeriodEnd: "2026-10-27T00:00:00.000Z",
            graceEndsAt: null,
          },
          hasCustomerPortal: true,
        }),
      );
      await nextTick();
      const receiptsBtn = Array.from(sheetMounted.host.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Download Receipts / Invoices"),
      );
      expect(receiptsBtn).toBeDefined();
      receiptsBtn?.click();
      expect(openPortalSpy).toHaveBeenCalledTimes(2);
    } finally {
      sheetMounted.unmount();
    }
  });

  it("allows upgrading to Pro directly from MembershipSheet during free allowance or after cancellation while hiding upgrade for testers, non-terminated subscriptions, cold cache, and checkout polling", async () => {
    const store = useBillingStore();
    vi.spyOn(store, "fetchEntitlement").mockReturnValue(errAsync("billing-unavailable"));
    const startCheckoutSpy = vi
      .spyOn(store, "startCheckout")
      .mockReturnValueOnce(okAsync(undefined))
      .mockReturnValueOnce(errAsync("billing-unavailable"));

    const sheetMounted = mountWithPinia(MembershipSheet, { open: true });
    try {
      // 1. Cold cache (entitlement === null): upgrade section hidden
      await nextTick();
      expect(
        sheetMounted.host.querySelector('[data-testid="membership-upgrade-section"]'),
      ).toBeNull();

      // 2. Active free_allowance with remaining starter calls: upgrade section shown & triggers checkout
      store.applyEntitlement(
        makeEntitlement({
          source: "free_allowance",
          evaluatedAt: "2026-11-27T12:00:00.000Z",
          freeAllowance: { coachUsed: 5, coachLimit: 30, classifyUsed: 0, classifyLimit: 40 },
        }),
      );
      await nextTick();

      const upgradeSection = sheetMounted.host.querySelector(
        '[data-testid="membership-upgrade-section"]',
      );
      expect(upgradeSection).not.toBeNull();
      expect(upgradeSection?.textContent).toContain("€7.99 / month incl. VAT, cancel monthly");

      const upgradeBtn = Array.from(upgradeSection?.querySelectorAll("button") ?? []).find((btn) =>
        btn.textContent?.includes("Subscribe to GainzAI Pro"),
      );
      expect(upgradeBtn).toBeDefined();
      upgradeBtn?.click();
      await vi.waitFor(() => {
        expect(startCheckoutSpy).toHaveBeenCalledTimes(1);
      });

      upgradeBtn?.click();
      await vi.waitFor(() => {
        expect(startCheckoutSpy).toHaveBeenCalledTimes(2);
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: "destructive",
            title: "Checkout Unavailable",
          }),
        );
      });

      // 3. While polling checkout return: upgrade section replaced with syncing loader
      store.isPollingCheckout = true;
      await nextTick();
      expect(
        sheetMounted.host.querySelector('[data-testid="membership-upgrade-section"]'),
      ).toBeNull();
      expect(
        sheetMounted.host.querySelector('[data-testid="membership-checkout-syncing"]')?.textContent,
      ).toContain("Confirming subscription status...");
      store.isPollingCheckout = false;
      await nextTick();

      // 4. Invite grant & non-terminated subscriptions (active, expired past_due grace, unpaid): hidden
      for (const entitlementOverride of [
        {
          source: "invite_grant" as const,
          evaluatedAt: "2026-11-27T12:01:00.000Z",
          inviteGrant: { expiresAt: null },
        },
        {
          source: "subscription" as const,
          evaluatedAt: "2026-11-27T12:02:00.000Z",
          inviteGrant: null,
          subscription: {
            status: "active" as const,
            cancelAtPeriodEnd: false,
            currentPeriodEnd: "2026-12-27T00:00:00.000Z",
            graceEndsAt: null,
          },
          hasCustomerPortal: true,
        },
        {
          source: "none" as const,
          canUseCoach: false,
          canUseClassify: false,
          evaluatedAt: "2026-11-27T12:03:00.000Z",
          subscription: {
            status: "past_due" as const,
            cancelAtPeriodEnd: false,
            currentPeriodEnd: "2026-12-01T00:00:00.000Z",
            graceEndsAt: "2026-11-20T00:00:00.000Z",
          },
          hasCustomerPortal: true,
        },
        {
          source: "none" as const,
          canUseCoach: false,
          canUseClassify: false,
          evaluatedAt: "2026-11-27T12:04:00.000Z",
          subscription: {
            status: "unpaid" as const,
            cancelAtPeriodEnd: false,
            currentPeriodEnd: "2026-12-01T00:00:00.000Z",
            graceEndsAt: null,
          },
          hasCustomerPortal: true,
        },
      ]) {
        store.applyEntitlement(makeEntitlement(entitlementOverride));
        await nextTick();
        expect(
          sheetMounted.host.querySelector('[data-testid="membership-upgrade-section"]'),
        ).toBeNull();
      }

      // 5. Canceled subscription with portal receipts: both upgrade CTA and portal receipts button shown
      store.applyEntitlement(
        makeEntitlement({
          source: "none",
          canUseCoach: false,
          canUseClassify: false,
          evaluatedAt: "2026-11-27T12:05:00.000Z",
          subscription: {
            status: "canceled",
            cancelAtPeriodEnd: false,
            currentPeriodEnd: "2026-10-27T00:00:00.000Z",
            graceEndsAt: null,
          },
          hasCustomerPortal: true,
        }),
      );
      await nextTick();
      expect(
        sheetMounted.host.querySelector('[data-testid="membership-upgrade-section"]'),
      ).not.toBeNull();
      expect(sheetMounted.host.textContent).toContain("Download Receipts / Invoices");
    } finally {
      sheetMounted.unmount();
    }
  });
});
