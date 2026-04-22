import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useToast } from "@/components/ui/useToast";

/**
 * Composable for handling authentication failures.
 *
 * Provides a centralized handler that:
 * 1. Logs the user out
 * 2. Shows a toast notification
 * 3. Redirects to login with return URL
 *
 * @param context - Optional context string for logging (e.g., "spreadsheet-load", "exercise-create")
 */
export function useAuthErrorHandler() {
  const authStore = useAuthStore();
  const { toast } = useToast();
  const router = useRouter();

  function handleAuthError(context?: string): void {
    // Log context if provided (for debugging)
    if (context) {
      console.error(`Auth error in context: ${context}`);
    }

    // 1. Log the user out
    authStore.logout();

    // 2. Show toast notification
    toast({
      title: "Session Expired",
      description: "Your session expired. Please log in again.",
      variant: "destructive",
    });

    // 3. Redirect to login with return URL
    const returnUrl = router.currentRoute.value.path;
    router.push({
      path: "/login",
      query: { returnUrl },
    });
  }

  return { handleAuthError };
}
