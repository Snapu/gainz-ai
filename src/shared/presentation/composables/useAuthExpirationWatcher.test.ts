// src/composables/useAuthExpirationWatcher.test.ts
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

  it("should trigger warning when < 5 minutes remain", () => {
    const now = Date.now();
    vi.mocked(useAuthStore).mockReturnValue({
      accessToken: "test-token",
      expiresAt: now + 4 * 60 * 1000, // 4 minutes
      isLoggedIn: true,
      logout: mockLogout,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    cleanupMount = mountWatcherComposable();

    // First check happens immediately
    vi.advanceTimersByTime(100);

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

  it("should not trigger warning when > 5 minutes remain", () => {
    const now = Date.now();
    vi.mocked(useAuthStore).mockReturnValue({
      accessToken: "test-token",
      expiresAt: now + 10 * 60 * 1000, // 10 minutes
      isLoggedIn: true,
      logout: mockLogout,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    cleanupMount = mountWatcherComposable();

    vi.advanceTimersByTime(100);

    expect(mockToast).not.toHaveBeenCalled();
  });

  it("should logout immediately if token already expired", () => {
    const now = Date.now();
    vi.mocked(useAuthStore).mockReturnValue({
      accessToken: "test-token",
      expiresAt: now - 1000, // Already expired
      isLoggedIn: false,
      logout: mockLogout,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    cleanupMount = mountWatcherComposable();

    // Check happens immediately
    vi.advanceTimersByTime(0);

    expect(mockLogout).toHaveBeenCalledOnce();
  });
});
