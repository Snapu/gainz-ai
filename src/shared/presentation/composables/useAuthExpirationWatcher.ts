// src/shared/presentation/composables/useAuthExpirationWatcher.ts

import { App as CapacitorApp } from "@capacitor/app";
import * as Sentry from "@sentry/vue";
import { onUnmounted, ref, watch } from "vue";
import { AUTH_PROACTIVE_REFRESH_THRESHOLD_MS, useAuthStore } from "@/modules/auth/presentation";
import { useToast } from "@/shared/presentation/composables/useToast";

const WARNING_THRESHOLD = AUTH_PROACTIVE_REFRESH_THRESHOLD_MS;
const CHECK_INTERVAL = 30 * 1000; // 30 seconds

export function useAuthExpirationWatcher() {
  const authStore = useAuthStore();
  const { toast, dismiss } = useToast();
  const warningActive = ref(false);
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let currentToastId: string | undefined;

  async function checkExpiration() {
    if (!authStore.refreshToken && (!authStore.expiresAt || !authStore.accessToken)) return;

    let timeRemaining =
      authStore.expiresAt && authStore.accessToken ? authStore.expiresAt - Date.now() : 0;

    // Proactively refresh via refresh token when within 5 minutes of expiry or already expired
    if (timeRemaining < WARNING_THRESHOLD && authStore.refreshToken) {
      const refreshResult = await authStore.refreshSession();
      if (refreshResult.isOk()) {
        if (warningActive.value) {
          clearWarningState();
        }
        return;
      }
      if (!authStore.expiresAt || !authStore.accessToken) return;
      timeRemaining = authStore.expiresAt - Date.now();
    }

    // Edge case: token already expired and could not be refreshed
    if (timeRemaining <= 0) {
      // Preserve refreshToken on transient offline/network failures so the session recovers once online
      if (authStore.refreshToken) {
        return;
      }
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

    // Trigger warning at 5-minute threshold when no refresh token could renew the session
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

  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      void checkExpiration();
    }
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  const appStateListenerPromise = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      void checkExpiration();
    }
  });

  // Start checking once auth storage hydration completes, then every 30 seconds.
  // Naturally no-ops when logged out due to the early return in checkExpiration.
  void authStore.init().then(() => checkExpiration());
  intervalId = setInterval(() => {
    void checkExpiration();
  }, CHECK_INTERVAL);

  // Cleanup on unmount
  onUnmounted(() => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    void appStateListenerPromise.then((handle) => handle.remove());
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    clearWarningState();
  });
}
