import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useAuthStore } from "@/modules/auth/presentation";
import { useToast } from "@/shared/presentation/composables/useToast";
import { useAuthErrorHandler } from "./useAuthErrorHandler";

vi.mock("@/modules/auth/presentation");
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
});
