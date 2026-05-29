// src/composables/useAuthExpirationWatcher.ts

import * as Sentry from "@sentry/vue";
import { onUnmounted, ref, watch } from "vue";
import { useAuthStore } from "@/modules/auth/presentation";
import { useToast } from "@/shared/presentation/composables/useToast";

const WARNING_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds
const CHECK_INTERVAL = 30 * 1000; // 30 seconds

export function useAuthExpirationWatcher() {
  const authStore = useAuthStore();
  const { toast, dismiss } = useToast();
  const warningActive = ref(false);
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let currentToastId: string | undefined;

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
      clearWarningState();
      authStore.logout();
      return;
    }

    // If token was refreshed (e.g. in another tab), dismiss active warning
    if (timeRemaining >= WARNING_THRESHOLD && warningActive.value) {
      clearWarningState();
    }

    // Trigger warning at 5-minute threshold
    if (timeRemaining > 0 && timeRemaining < WARNING_THRESHOLD && !warningActive.value) {
      showExpirationWarning(timeRemaining);
    }
  }

  function showExpirationWarning(timeRemaining: number) {
    warningActive.value = true;

    Sentry.captureMessage("Token expiring - showing warning to user", {
      level: "info",
      tags: { category: "auth-expiration" },
    });

    const seconds = Math.floor(timeRemaining / 1000);

    currentToastId = toast({
      title: "Session Expiring Soon",
      description: "Please log in again",
      variant: "default",
      persistent: true,
      action: {
        label: "Log in now",
        onClick: handleLogout,
      },
      countdown: {
        seconds,
        onComplete: handleLogout,
      },
    });
  }

  function handleLogout() {
    clearWarningState();
    authStore.logout();
  }

  function clearWarningState() {
    if (currentToastId) {
      dismiss(currentToastId);
      currentToastId = undefined;
    }
    warningActive.value = false;
  }

  // If the user is logged out (e.g. manually or due to 401 API error),
  // dismiss the warning toast and reset the state.
  watch(
    () => authStore.isLoggedIn,
    (isLoggedIn) => {
      if (!isLoggedIn) {
        clearWarningState();
      }
    },
  );

  // Start checking immediately and then every 30 seconds.
  // The interval keeps running for the lifetime of the composable (which in App.vue is the lifetime of the app).
  // It naturally no-ops when logged out due to the early return in checkExpiration.
  checkExpiration();
  intervalId = setInterval(checkExpiration, CHECK_INTERVAL);

  // Cleanup on unmount
  onUnmounted(() => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    clearWarningState();
  });
}
