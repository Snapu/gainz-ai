<script setup lang="ts">
import { useRegisterSW } from "virtual:pwa-register/vue";
import { App as CapacitorApp } from "@capacitor/app";
import { ConfigProvider } from "reka-ui";
import { onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useAiOrchestratorStore } from "@/modules/aiCoach/presentation";
import { useAuthErrorHandler, useAuthStore } from "@/modules/auth/presentation";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import UiToaster from "@/shared/presentation/components/ui/UiToaster.vue";
import { useAuthExpirationWatcher } from "@/shared/presentation/composables/useAuthExpirationWatcher";
import { useSheetCacheSync } from "@/shared/presentation/composables/useSheetCacheSync";
import { useToast } from "@/shared/presentation/composables/useToast";

const router = useRouter();
const authStore = useAuthStore();
const { handleAuthError } = useAuthErrorHandler();

// Start watching for auth expiration and sheet switches
useAuthExpirationWatcher();
useSheetCacheSync();

let swUpdateInterval: ReturnType<typeof setInterval> | undefined;

const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      // Check for updates every 30 minutes
      swUpdateInterval = setInterval(
        () => {
          registration.update().catch(() => {});
        },
        30 * 60 * 1000,
      );

      // Check for updates when the app comes to foreground (Mobile via Capacitor)
      CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) {
          registration.update().catch(() => {});
        }
      });

      // Check for updates when the browser tab becomes visible again (Web)
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          registration.update().catch(() => {});
        }
      });

      // Check for updates on route changes
      router.afterEach(() => {
        registration.update().catch(() => {});
      });
    }
  },
});

function postToServiceWorker(message: Record<string, unknown>): void {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(message);
  }
}

function handleServiceWorkerMessage(event: MessageEvent) {
  const type = (event.data as { type?: string } | null)?.type;
  if (type === "BACKGROUND_SYNC_SUCCESS") {
    void useExerciseLogsStore().refresh();
  } else if (type === "BACKGROUND_SYNC_AUTH_REQUIRED") {
    const previousToken = authStore.accessToken;
    void handleAuthError("service-worker-sync").then((recovered) => {
      if (recovered && authStore.accessToken && authStore.accessToken === previousToken) {
        postToServiceWorker({ type: "AUTH_TOKEN_UPDATED", accessToken: authStore.accessToken });
      }
    });
  }
}

onUnmounted(() => {
  clearInterval(swUpdateInterval);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage);
  }
});

const { toast } = useToast();

watch(
  needRefresh,
  (isNeeded) => {
    if (isNeeded) {
      toast({
        title: "Update Available",
        description: "A new version of GainzAI is ready.",
        duration: 100000,
        action: {
          label: "Reload",
          onClick: () => updateServiceWorker(true),
        },
      });
    }
  },
  { immediate: true },
);

// Move sync listener from main.ts to App.vue
onMounted(() => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);
  }
});

watch(
  () => authStore.accessToken,
  (token) => {
    if (token) {
      postToServiceWorker({ type: "AUTH_TOKEN_UPDATED", accessToken: token });
    }
  },
  { immediate: true },
);

// Keep runtime session-loss handling here; router guards remain the single source
// for normal auth/setup/document routing decisions.
watch(
  () => authStore.isLoggedIn,
  (isLoggedIn) => {
    if (isLoggedIn) return;

    useAiOrchestratorStore().clearPendingRequest();
    postToServiceWorker({ type: "CLEAR_SYNC_QUEUE" });
    const currentPath = router.currentRoute.value.path;
    const isPublicRoute = currentPath === "/privacy" || currentPath === "/impressum";
    if (isPublicRoute || currentPath === "/") return;

    void router.push("/").catch(() => {});
  },
  { immediate: false },
);
</script>

<template>
  <ConfigProvider locale="en" :scroll-body="false">
    <RouterView />
    <UiToaster />
  </ConfigProvider>
</template>
