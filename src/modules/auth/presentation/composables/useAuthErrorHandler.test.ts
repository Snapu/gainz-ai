import { errAsync, okAsync } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useToast } from "@/shared/presentation/composables/useToast";
import { useAuthStore } from "../stores/authStore";
import { useAuthErrorHandler } from "./useAuthErrorHandler";

vi.mock("../stores/authStore");
vi.mock("@/shared/presentation/composables/useToast");

describe("useAuthErrorHandler", () => {
  const mockLogout = vi.fn();
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAuthStore).mockReturnValue({
      logout: mockLogout,
      accessToken: "token",
      expiresAt: Date.now() + 3600000,
      isLoggedIn: true,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    vi.mocked(useToast).mockReturnValue({
      toast: mockToast,
      dismiss: vi.fn(),
      toasts: ref([]),
    });
  });

  it("should call logout from auth store", () => {
    const { handleAuthError } = useAuthErrorHandler();

    handleAuthError();

    expect(mockLogout).toHaveBeenCalledOnce();
  });

  it("should show toast with error message", () => {
    const { handleAuthError } = useAuthErrorHandler();

    handleAuthError();

    expect(mockToast).toHaveBeenCalledOnce();
    expect(mockToast).toHaveBeenCalledWith({
      title: "Session Expired",
      description: "Your session expired. Please log in again.",
      variant: "destructive",
    });
  });

  it("should do nothing if already logged out (deduplication guard)", () => {
    vi.mocked(useAuthStore).mockReturnValue({
      logout: mockLogout,
      accessToken: null,
      expiresAt: null,
      isLoggedIn: false,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    const { handleAuthError } = useAuthErrorHandler();

    handleAuthError();

    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("still logs out and shows toast when accessToken exists but isLoggedIn evaluated to false after expiry", () => {
    vi.mocked(useAuthStore).mockReturnValue({
      logout: mockLogout,
      accessToken: "expired-token",
      expiresAt: Date.now() - 1000,
      isLoggedIn: false,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    const { handleAuthError } = useAuthErrorHandler();

    handleAuthError();

    expect(mockLogout).toHaveBeenCalledOnce();
    expect(mockToast).toHaveBeenCalledOnce();
  });

  it("attempts refreshSession() before logging out when refreshToken is present", async () => {
    const mockRefreshSession = vi.fn().mockReturnValue(okAsync("renewed-token"));
    vi.mocked(useAuthStore).mockReturnValue({
      logout: mockLogout,
      accessToken: "expired-token",
      refreshToken: "refresh-token-123",
      expiresAt: Date.now() - 1000,
      isLoggedIn: true,
      refreshSession: mockRefreshSession,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    const { handleAuthError } = useAuthErrorHandler();
    const recovered = await handleAuthError("spreadsheet-load");

    expect(recovered).toBe(true);
    expect(mockRefreshSession).toHaveBeenCalledWith(true);
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("attempts refreshSession() when accessToken is null but refreshToken exists", async () => {
    const mockRefreshSession = vi.fn().mockReturnValue(okAsync("renewed-token"));
    vi.mocked(useAuthStore).mockReturnValue({
      logout: mockLogout,
      accessToken: null,
      refreshToken: "refresh-token-123",
      expiresAt: null,
      isLoggedIn: true,
      refreshSession: mockRefreshSession,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    const { handleAuthError } = useAuthErrorHandler();
    const recovered = await handleAuthError("spreadsheet-load");

    expect(recovered).toBe(true);
    expect(mockRefreshSession).toHaveBeenCalledWith(true);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("does not log out or wipe refreshToken on transient token-refresh-failed error", async () => {
    const mockRefreshSession = vi.fn().mockReturnValue(errAsync("token-refresh-failed" as const));
    vi.mocked(useAuthStore).mockReturnValue({
      logout: mockLogout,
      accessToken: "expired-token",
      refreshToken: "refresh-token-123",
      expiresAt: Date.now() - 1000,
      isLoggedIn: true,
      refreshSession: mockRefreshSession,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    const { handleAuthError } = useAuthErrorHandler();
    const recovered = await handleAuthError("spreadsheet-load");

    expect(recovered).toBe(false);
    expect(mockRefreshSession).toHaveBeenCalledWith(true);
    expect(mockLogout).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("logs out and shows toast when refreshSession() fails with refresh-token-invalid", async () => {
    const mockRefreshSession = vi.fn().mockReturnValue(errAsync("refresh-token-invalid" as const));
    vi.mocked(useAuthStore).mockReturnValue({
      logout: mockLogout,
      accessToken: "expired-token",
      refreshToken: "test-refresh-token",
      expiresAt: Date.now() - 1000,
      isLoggedIn: true,
      refreshSession: mockRefreshSession,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    const { handleAuthError } = useAuthErrorHandler();
    const recovered = await handleAuthError("spreadsheet-load");

    expect(recovered).toBe(false);
    expect(mockRefreshSession).toHaveBeenCalledWith(true);
    expect(mockLogout).toHaveBeenCalledOnce();
    expect(mockToast).toHaveBeenCalledOnce();
  });

  it("deduplicates concurrent 401 refresh and logout calls", async () => {
    const mockRefreshSession = vi.fn().mockReturnValue(errAsync("refresh-token-invalid" as const));
    vi.mocked(useAuthStore).mockReturnValue({
      logout: mockLogout,
      accessToken: "expired-token",
      refreshToken: "test-refresh-token",
      expiresAt: Date.now() - 1000,
      isLoggedIn: true,
      refreshSession: mockRefreshSession,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    const { handleAuthError } = useAuthErrorHandler();
    const results = await Promise.all([handleAuthError("call-1"), handleAuthError("call-2")]);

    expect(results).toEqual([false, false]);
    expect(mockRefreshSession).toHaveBeenCalledOnce();
    expect(mockLogout).toHaveBeenCalledOnce();
    expect(mockToast).toHaveBeenCalledOnce();
  });
});
