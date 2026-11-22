import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, nextTick, onScopeDispose, reactive, ref } from "vue";
import {
  syncLegalConsent,
  useLegalConsent,
} from "@/shared/presentation/composables/useLegalConsent";

const pushMock = vi.fn(() => Promise.resolve());
const postMessageMock = vi.fn();
const clearPendingRequestMock = vi.fn();
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
    toast: vi.fn(),
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
});
