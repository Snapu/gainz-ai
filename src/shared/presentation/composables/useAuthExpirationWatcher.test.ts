// src/composables/useAuthExpirationWatcher.test.ts
import { errAsync, okAsync } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, ref } from "vue";
import { useAuthStore } from "@/modules/auth/presentation";
import { useToast } from "@/shared/presentation/composables/useToast";
import { useAuthExpirationWatcher } from "./useAuthExpirationWatcher";

vi.mock("@/shared/presentation/composables/useToast");
vi.mock("@/modules/auth/presentation");

function mountWatcherComposable() {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const app = createApp(
    defineComponent({
      setup() {
        useAuthExpirationWatcher();
        return () => h("div");
      },
    }),
  );

  app.mount(host);

  return () => {
    app.unmount();
    host.remove();
  };
}

describe("useAuthExpirationWatcher", () => {
  const mockToast = vi.fn();
  const mockDismiss = vi.fn();
  const mockLogout = vi.fn();

  let cleanupMount: (() => void) | null = null;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();

    vi.mocked(useToast).mockReturnValue({
      toast: mockToast,
      dismiss: mockDismiss,
      toasts: ref([]),
    });
  });

  afterEach(() => {
    if (cleanupMount) {
      cleanupMount();
      cleanupMount = null;
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should trigger warning when < 5 minutes remain", async () => {
    const now = Date.now();
    vi.mocked(useAuthStore).mockReturnValue({
      accessToken: "test-token",
      expiresAt: now + 4 * 60 * 1000, // 4 minutes
      isLoggedIn: true,
      init: vi.fn().mockResolvedValue(undefined),
      logout: mockLogout,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    cleanupMount = mountWatcherComposable();

    // First check happens immediately
    await vi.advanceTimersByTimeAsync(100);

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("Expiring"),
        persistent: true,
        countdown: expect.objectContaining({
          seconds: 4 * 60, // 4 minutes remaining → 240 seconds
        }),
      }),
    );
  });

  it("should not trigger warning when > 5 minutes remain", async () => {
    const now = Date.now();
    vi.mocked(useAuthStore).mockReturnValue({
      accessToken: "test-token",
      expiresAt: now + 10 * 60 * 1000, // 10 minutes
      isLoggedIn: true,
      init: vi.fn().mockResolvedValue(undefined),
      logout: mockLogout,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    cleanupMount = mountWatcherComposable();

    await vi.advanceTimersByTimeAsync(100);

    expect(mockToast).not.toHaveBeenCalled();
  });

  it("should logout immediately if token already expired", async () => {
    const now = Date.now();
    vi.mocked(useAuthStore).mockReturnValue({
      accessToken: "test-token",
      expiresAt: now - 1000, // Already expired
      isLoggedIn: false,
      init: vi.fn().mockResolvedValue(undefined),
      logout: mockLogout,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    cleanupMount = mountWatcherComposable();

    // Check happens immediately
    await vi.advanceTimersByTimeAsync(0);

    expect(mockLogout).toHaveBeenCalledOnce();
  });

  it("silently refreshes session without warning toast when refreshToken is available", async () => {
    const now = Date.now();
    const mockRefreshSession = vi.fn().mockReturnValue(okAsync("new-access-token"));
    vi.mocked(useAuthStore).mockReturnValue({
      accessToken: "test-token",
      refreshToken: "refresh-token-123",
      expiresAt: now + 4 * 60 * 1000, // 4 minutes
      isLoggedIn: true,
      init: vi.fn().mockResolvedValue(undefined),
      refreshSession: mockRefreshSession,
      logout: mockLogout,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    cleanupMount = mountWatcherComposable();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockRefreshSession).toHaveBeenCalledOnce();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("shows warning toast when refreshSession fails and < 5 minutes remain", async () => {
    const now = Date.now();
    const mockRefreshSession = vi.fn().mockReturnValue(errAsync("token-refresh-failed" as const));
    vi.mocked(useAuthStore).mockReturnValue({
      accessToken: "test-token",
      refreshToken: "refresh-token-123",
      expiresAt: now + 4 * 60 * 1000,
      isLoggedIn: true,
      init: vi.fn().mockResolvedValue(undefined),
      refreshSession: mockRefreshSession,
      logout: mockLogout,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    cleanupMount = mountWatcherComposable();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockRefreshSession).toHaveBeenCalledOnce();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("Expiring"),
      }),
    );
  });

  it("does not wipe refreshToken via logout when offline refresh fails after accessToken expiry", async () => {
    const now = Date.now();
    const mockRefreshSession = vi.fn().mockReturnValue(errAsync("token-refresh-failed" as const));
    vi.mocked(useAuthStore).mockReturnValue({
      accessToken: "expired-token",
      refreshToken: "valid-refresh-token",
      expiresAt: now - 5_000,
      isLoggedIn: false,
      init: vi.fn().mockResolvedValue(undefined),
      refreshSession: mockRefreshSession,
      logout: mockLogout,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    cleanupMount = mountWatcherComposable();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockRefreshSession).toHaveBeenCalledOnce();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("proactively refreshes on startup when refreshToken exists but accessToken is null", async () => {
    const mockRefreshSession = vi.fn().mockReturnValue(okAsync("restored-token"));
    vi.mocked(useAuthStore).mockReturnValue({
      accessToken: null,
      refreshToken: "valid-refresh-token",
      expiresAt: null,
      isLoggedIn: true,
      init: vi.fn().mockResolvedValue(undefined),
      refreshSession: mockRefreshSession,
      logout: mockLogout,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    cleanupMount = mountWatcherComposable();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockRefreshSession).toHaveBeenCalledOnce();
  });

  it("waits for authStore.init() hydration before running initial expiration check", async () => {
    let resolveInit: (() => void) | undefined;
    const initPromise = new Promise<void>((resolve) => {
      resolveInit = resolve;
    });
    const mockRefreshSession = vi.fn().mockReturnValue(okAsync("restored-token"));
    const authState = {
      accessToken: null as string | null,
      refreshToken: null as string | null,
      expiresAt: null as number | null,
      isLoggedIn: false,
      init: vi.fn(() => initPromise),
      refreshSession: mockRefreshSession,
      logout: mockLogout,
      login: vi.fn(),
    };
    vi.mocked(useAuthStore).mockReturnValue(
      authState as unknown as ReturnType<typeof useAuthStore>,
    );

    cleanupMount = mountWatcherComposable();
    await vi.advanceTimersByTimeAsync(0);
    expect(mockRefreshSession).not.toHaveBeenCalled();

    authState.refreshToken = "hydrated-refresh-token";
    resolveInit?.();
    await vi.advanceTimersByTimeAsync(0);

    expect(mockRefreshSession).toHaveBeenCalledOnce();
  });
});
