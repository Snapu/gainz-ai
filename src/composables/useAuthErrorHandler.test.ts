import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "@/components/ui/useToast";
import { useAuthStore } from "@/stores/auth";
import { useAuthErrorHandler } from "./useAuthErrorHandler";

vi.mock("vue-router");
vi.mock("@/stores/auth");
vi.mock("@/components/ui/useToast");

describe("useAuthErrorHandler", () => {
  const mockLogout = vi.fn();
  const mockToast = vi.fn();
  const mockPush = vi.fn();
  const mockCurrentRoute = {
    path: "/workouts",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAuthStore).mockReturnValue({
      logout: mockLogout,
      accessToken: null,
      expiresAt: null,
      isLoggedIn: false,
      login: vi.fn(),
    } as unknown as ReturnType<typeof useAuthStore>);

    vi.mocked(useToast).mockReturnValue({
      toast: mockToast,
      dismiss: vi.fn(),
      toasts: ref([]),
    });

    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
      currentRoute: {
        value: mockCurrentRoute,
      },
    } as unknown as ReturnType<typeof useRouter>);
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

  it("should redirect to login with returnUrl query param", () => {
    const { handleAuthError } = useAuthErrorHandler();

    handleAuthError();

    expect(mockPush).toHaveBeenCalledOnce();
    expect(mockPush).toHaveBeenCalledWith({
      path: "/login",
      query: { returnUrl: "/workouts" },
    });
  });

  it("should handle case when there is no current route", () => {
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
      currentRoute: {
        value: { path: "/" },
      },
    } as unknown as ReturnType<typeof useRouter>);

    const { handleAuthError } = useAuthErrorHandler();

    handleAuthError();

    expect(mockPush).toHaveBeenCalledWith({
      path: "/login",
      query: { returnUrl: "/" },
    });
  });
});
