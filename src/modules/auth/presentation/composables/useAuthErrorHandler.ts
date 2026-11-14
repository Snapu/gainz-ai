import * as Sentry from "@sentry/vue";
import { useToast } from "@/shared/presentation/composables/useToast";
import { useAuthStore } from "../stores/authStore";

/**
 * Composable for handling authentication failures.
 *
 * Provides a centralized handler that:
 * 1. Attempts silent token refresh when a refresh token is available (deduplicated across concurrent 401s)
 * 2. Logs the user out and shows a toast on unrecoverable auth expiration
 *
 * Navigation back to the login page is handled reactively by the App.vue watcher
 * on `authStore.isLoggedIn`.
 */
let inFlightAuthRecovery: Promise<boolean> | null = null;

export function useAuthErrorHandler() {
  const authStore = useAuthStore();
  const { toast } = useToast();

  function performLogout(context?: string): void {
    Sentry.captureMessage("Auth expired during API call", {
      level: "warning",
      tags: { category: "auth-expiration", context: context ?? "unknown" },
    });

    authStore.logout();

    toast({
      title: "Session Expired",
      description: "Your session expired. Please log in again.",
      variant: "destructive",
    });
  }

  function handleAuthError(context?: string): Promise<boolean> {
    // Guard: if already logged out (e.g. concurrent 401s), do nothing.
    if (!authStore.refreshToken && !authStore.accessToken) {
      return Promise.resolve(false);
    }

    if (authStore.refreshToken) {
      if (inFlightAuthRecovery) return inFlightAuthRecovery;

      inFlightAuthRecovery = Promise.resolve(
        authStore.refreshSession(true).match(
          () => true,
          (error) => {
            if (error === "refresh-token-invalid" || !authStore.refreshToken) {
              performLogout(context);
            }
            return false;
          },
        ),
      ).finally(() => {
        inFlightAuthRecovery = null;
      });
      return inFlightAuthRecovery;
    }

    performLogout(context);
    return Promise.resolve(false);
  }

  return { handleAuthError };
}
