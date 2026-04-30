import * as Sentry from "@sentry/vue";
import { useToast } from "@/composables/useToast";
import { useAuthStore } from "@/stores/auth";

/**
 * Composable for handling authentication failures.
 *
 * Provides a centralized handler that:
 * 1. Logs the user out (idempotent — skips if already logged out)
 * 2. Shows a toast notification
 *
 * Navigation back to the login page is handled reactively by the App.vue watcher
 * on `authStore.isLoggedIn`.
 *
 * @param context - Optional context string for logging (e.g., "spreadsheet-load", "exercise-create")
 */
export function useAuthErrorHandler() {
  const authStore = useAuthStore();
  const { toast } = useToast();

  function handleAuthError(context?: string): void {
    // Guard: if already logged out (e.g. concurrent 401s), do nothing.
    // authStore.logout() is synchronous, so the first caller clears the token
    // immediately and subsequent callers see isLoggedIn === false.
    if (!authStore.isLoggedIn) return;

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

  return { handleAuthError };
}
