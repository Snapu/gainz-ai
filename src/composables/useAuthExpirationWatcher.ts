// src/composables/useAuthExpirationWatcher.ts

import * as Sentry from "@sentry/vue";
import { onUnmounted, ref } from "vue";
import { useToast } from "@/components/ui/useToast";
import { useAuthStore } from "@/stores/auth";

const WARNING_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds
const CHECK_INTERVAL = 30 * 1000; // 30 seconds

export function useAuthExpirationWatcher() {
  const authStore = useAuthStore();
  const { toast } = useToast();
  const warningActive = ref(false);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function checkExpiration() {
    // If no expiresAt or no access token, nothing to check
    if (!authStore.expiresAt || !authStore.accessToken) return;

    const timeRemaining = authStore.expiresAt - Date.now();

    // Edge case: token already expired
    if (timeRemaining <= 0) {
      Sentry.captureMessage("Token already expired on check", {
        level: "warning",
        tags: { category: "auth-expiration" },
      });
      cleanup();
      authStore.logout();
      return;
    }

    // Trigger warning at 5-minute threshold
    if (timeRemaining > 0 && timeRemaining < WARNING_THRESHOLD && !warningActive.value) {
      showExpirationWarning();
    }
  }

  function showExpirationWarning() {
    warningActive.value = true;

    Sentry.captureMessage("Token expiring - showing warning to user", {
      level: "info",
      tags: { category: "auth-expiration" },
    });

    toast({
      title: "Session Expiring Soon",
      description: "Please log in again",
      variant: "default",
      persistent: true,
      action: {
        label: "Log in now",
        onClick: handleLogout,
      },
      countdown: {
        seconds: 30,
        onComplete: handleLogout,
      },
    });
  }

  function handleLogout() {
    warningActive.value = false;
    cleanup();
    authStore.logout();
  }

  function cleanup() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  // Start checking immediately and then every 30 seconds
  checkExpiration();
  intervalId = setInterval(checkExpiration, CHECK_INTERVAL);

  // Cleanup on unmount
  onUnmounted(cleanup);

  return { checkExpiration };
}
