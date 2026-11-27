import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, nextTick, onScopeDispose, reactive, ref } from "vue";
import {
  syncLegalConsent,
  useLegalConsent,
} from "@/shared/presentation/composables/useLegalConsent";

const pushMock = vi.fn(() => Promise.resolve());
const postMessageMock = vi.fn();
const clearPendingRequestMock = vi.fn();
const fetchEntitlementMock = vi.fn();
const redeemPendingInviteMock = vi.fn(async () => null);
const clearBillingMock = vi.fn();
const capturePendingInviteMock = vi.fn(() => null);
const toastMock = vi.fn();
const refreshLogsMock = vi.fn();
const handleAuthErrorMock = vi.fn(async () => true);
const watcherDisposedMock = vi.fn();
const useAuthExpirationWatcherMock = vi.fn(() => {
  onScopeDispose(() => {
    watcherDisposedMock();
  });
});
const useSheetCacheSyncMock = vi.fn();

const currentRouteRef = ref({ path: "/consent" });
const authState = reactive<{
  isLoggedIn: boolean;
  accessToken: string | null;
}>({
  isLoggedIn: true,
  accessToken: "token-1",
});

vi.mock("virtual:pwa-register/vue", () => ({
  useRegisterSW: () => ({
    needRefresh: ref(false),
    updateServiceWorker: vi.fn(),
  }),
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(),
  },
}));

vi.mock("reka-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("reka-ui")>();
  return {
    ...actual,
    ConfigProvider: defineComponent({ template: "<div><slot /></div>" }),
  };
});

vi.mock("@/shared/presentation/components/ui/UiToaster.vue", () => ({
  default: defineComponent({ template: "<div />" }),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({
    currentRoute: currentRouteRef,
    push: pushMock,
    afterEach: vi.fn(),
  }),
}));

vi.mock("@/modules/aiCoach/presentation", () => ({
  useAiOrchestratorStore: () => ({
    clearPendingRequest: clearPendingRequestMock,
  }),
}));

vi.mock("@/modules/billing/presentation", () => ({
  capturePendingInviteFromUrl: () => capturePendingInviteMock(),
  resolveInviteErrorMessage: (error: string) => `mapped:${error}`,
  useBillingStore: () => ({
    fetchEntitlement: fetchEntitlementMock,
    redeemPendingInviteIfPresent: redeemPendingInviteMock,
    clear: clearBillingMock,
  }),
}));

vi.mock("@/modules/auth/presentation", () => ({
  useAuthStore: () => authState,
  useAuthErrorHandler: () => ({
    handleAuthError: handleAuthErrorMock,
  }),
}));

vi.mock("@/modules/trainingLogs/presentation", () => ({
  useExerciseLogsStore: () => ({
    refresh: refreshLogsMock,
  }),
}));

vi.mock("@/shared/presentation/composables/useAuthExpirationWatcher", () => ({
  useAuthExpirationWatcher: () => useAuthExpirationWatcherMock(),
}));

vi.mock("@/shared/presentation/composables/useSheetCacheSync", () => ({
  useSheetCacheSync: () => useSheetCacheSyncMock(),
}));

vi.mock("@/shared/presentation/composables/useToast", () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

import App from "./App.vue";

function mountApp() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const app = createApp(App);
  app.component("RouterView", defineComponent({ template: '<div data-testid="router-view" />' }));
  app.component("UiToaster", defineComponent({ template: "<div />" }));
  app.mount(host);
  return {
    host,
    unmount: () => {
      app.unmount();
      host.remove();
    },
  };
}

describe("App.vue", () => {
  const originalServiceWorker = navigator.serviceWorker;
  let messageListener: ((event: MessageEvent) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    syncLegalConsent();
    authState.isLoggedIn = true;
    authState.accessToken = "token-1";
    currentRouteRef.value = { path: "/consent" };
    messageListener = undefined;
    handleAuthErrorMock.mockResolvedValue(true);

    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        controller: { postMessage: postMessageMock },
        addEventListener: vi.fn((type: string, listener: (event: MessageEvent) => void) => {
          if (type === "message") messageListener = listener;
        }),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "serviceWorker", {
      value: originalServiceWorker,
      configurable: true,
    });
  });

  it("blocks auth watcher, sheet cache sync, and service worker token updates until consent is accepted", async () => {
    const mounted = mountApp();
    try {
      await nextTick();
      expect(useAuthExpirationWatcherMock).not.toHaveBeenCalled();
      expect(useSheetCacheSyncMock).not.toHaveBeenCalled();
      expect(postMessageMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "AUTH_TOKEN_UPDATED" }),
      );

      useLegalConsent().acceptLegalConsent("2026-11-22T20:00:00.000Z");
      await nextTick();

      expect(useAuthExpirationWatcherMock).toHaveBeenCalledTimes(1);
      expect(useSheetCacheSyncMock).toHaveBeenCalledTimes(1);
      expect(postMessageMock).toHaveBeenCalledWith({
        type: "AUTH_TOKEN_UPDATED",
        accessToken: "token-1",
      });

      useLegalConsent().revokeLegalConsent();
      await nextTick();

      expect(watcherDisposedMock).toHaveBeenCalledTimes(1);
    } finally {
      mounted.unmount();
    }
  });

  it("refreshes billing entitlement on consent + online events and clears billing state on sign-out", async () => {
    const mounted = mountApp();
    try {
      await nextTick();
      expect(fetchEntitlementMock).not.toHaveBeenCalled();

      useLegalConsent().acceptLegalConsent("2026-11-22T20:00:00.000Z");
      await nextTick();
      await vi.waitFor(() => {
        expect(fetchEntitlementMock).toHaveBeenCalledTimes(1);
      });

      window.dispatchEvent(new Event("online"));
      await vi.waitFor(() => {
        expect(fetchEntitlementMock).toHaveBeenCalledTimes(2);
      });

      authState.isLoggedIn = false;
      await nextTick();

      expect(clearPendingRequestMock).toHaveBeenCalledTimes(1);
      expect(clearBillingMock).toHaveBeenCalledTimes(1);

      // Online listener disposed after stopping consented services
      window.dispatchEvent(new Event("online"));
      await nextTick();
      expect(fetchEntitlementMock).toHaveBeenCalledTimes(2);
    } finally {
      mounted.unmount();
    }
  });

  it("ignores service worker sync messages until legal consent is granted", async () => {
    const mounted = mountApp();
    try {
      await nextTick();
      expect(messageListener).toBeDefined();

      messageListener?.({ data: { type: "BACKGROUND_SYNC_SUCCESS" } } as MessageEvent);
      messageListener?.({ data: { type: "BACKGROUND_SYNC_AUTH_REQUIRED" } } as MessageEvent);
      await nextTick();

      expect(refreshLogsMock).not.toHaveBeenCalled();
      expect(handleAuthErrorMock).not.toHaveBeenCalled();
      expect(postMessageMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "AUTH_TOKEN_UPDATED" }),
      );

      useLegalConsent().acceptLegalConsent("2026-11-22T20:00:00.000Z");
      await nextTick();
      postMessageMock.mockClear();

      messageListener?.({ data: { type: "BACKGROUND_SYNC_SUCCESS" } } as MessageEvent);
      messageListener?.({ data: { type: "BACKGROUND_SYNC_AUTH_REQUIRED" } } as MessageEvent);

      await vi.waitFor(() => {
        expect(postMessageMock).toHaveBeenCalledWith({
          type: "AUTH_TOKEN_UPDATED",
          accessToken: "token-1",
        });
      });

      expect(refreshLogsMock).toHaveBeenCalledTimes(1);
      expect(handleAuthErrorMock).toHaveBeenCalledWith("service-worker-sync");
    } finally {
      mounted.unmount();
    }
  });

  it("automatically redeems a captured pending invite code once logged in and consented with localized toast feedback", async () => {
    redeemPendingInviteMock.mockResolvedValueOnce({
      isOk: () => true,
      isErr: () => false,
    } as never);

    const mounted = mountApp();
    try {
      await nextTick();
      expect(redeemPendingInviteMock).not.toHaveBeenCalled();

      useLegalConsent().acceptLegalConsent("2026-11-22T20:00:00.000Z");
      await nextTick();
      await vi.waitFor(() => {
        expect(redeemPendingInviteMock).toHaveBeenCalledTimes(1);
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: "default",
          }),
        );
      });
      // Successful auto-redemption skips redundant parallel fetchEntitlement()
      expect(fetchEntitlementMock).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it("shows localized destructive toast on failed auto-redemption, suppresses stale toasts after sign-out, and handles live hashchange invite links", async () => {
    redeemPendingInviteMock.mockResolvedValueOnce({
      isOk: () => false,
      isErr: () => true,
      error: "invite-expired",
    } as never);

    const mounted = mountApp();
    try {
      useLegalConsent().acceptLegalConsent("2026-11-22T20:00:00.000Z");
      await vi.waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: "destructive",
            description: "mapped:invite-expired",
          }),
        );
        expect(fetchEntitlementMock).toHaveBeenCalledTimes(1);
      });

      toastMock.mockClear();
      let resolveSlowRedeem!: (val: unknown) => void;
      redeemPendingInviteMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSlowRedeem = resolve;
          }) as never,
      );
      capturePendingInviteMock.mockReturnValueOnce("LIVE2026" as never);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      await vi.waitFor(() => {
        expect(redeemPendingInviteMock).toHaveBeenCalledTimes(2);
      });

      // Signing out while in-flight suppresses any stale toast when promise settles
      authState.isLoggedIn = false;
      await nextTick();
      resolveSlowRedeem({
        isOk: () => true,
        isErr: () => false,
      });
      await nextTick();
      expect(toastMock).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it("deduplicates overlapping online events during in-flight pending invite redemption so only one toast is shown", async () => {
    let resolvePending!: (val: unknown) => void;
    redeemPendingInviteMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePending = resolve;
        }) as never,
    );

    const mounted = mountApp();
    try {
      useLegalConsent().acceptLegalConsent("2026-11-22T20:00:00.000Z");
      await vi.waitFor(() => {
        expect(redeemPendingInviteMock).toHaveBeenCalledTimes(1);
      });

      window.dispatchEvent(new Event("online"));
      await nextTick();

      resolvePending({
        isOk: () => true,
        isErr: () => false,
      });

      await vi.waitFor(() => {
        expect(toastMock).toHaveBeenCalledTimes(1);
        expect(redeemPendingInviteMock).toHaveBeenCalledTimes(2);
      });
    } finally {
      mounted.unmount();
    }
  });

  it("immediately runs a resync for a newer hashchange invite captured while an earlier sync is in-flight", async () => {
    let resolveFirst!: (val: unknown) => void;
    redeemPendingInviteMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }) as never,
      )
      .mockResolvedValueOnce({
        isOk: () => true,
        isErr: () => false,
      } as never);

    const mounted = mountApp();
    try {
      useLegalConsent().acceptLegalConsent("2026-11-22T20:00:00.000Z");
      await vi.waitFor(() => {
        expect(redeemPendingInviteMock).toHaveBeenCalledTimes(1);
      });

      capturePendingInviteMock.mockReturnValueOnce("CODE_B" as never);
      window.dispatchEvent(new HashChangeEvent("hashchange"));

      resolveFirst({
        isOk: () => false,
        isErr: () => true,
        error: "invite-expired",
      });

      await vi.waitFor(() => {
        expect(redeemPendingInviteMock).toHaveBeenCalledTimes(2);
        expect(toastMock).toHaveBeenCalledTimes(2);
      });
      expect(toastMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ variant: "destructive", description: "mapped:invite-expired" }),
      );
      expect(toastMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ variant: "default" }));
    } finally {
      mounted.unmount();
    }
  });
});
