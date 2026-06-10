<script setup lang="ts">
import { useRegisterSW } from "virtual:pwa-register/vue";
import { App as CapacitorApp } from "@capacitor/app";
import { ConfigProvider } from "reka-ui";
import { onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/modules/auth/presentation";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import UiToaster from "@/shared/presentation/components/ui/UiToaster.vue";
import { useAuthExpirationWatcher } from "@/shared/presentation/composables/useAuthExpirationWatcher";
import { useToast } from "@/shared/presentation/composables/useToast";

const router = useRouter();
const authStore = useAuthStore();

// Start watching for auth expiration
useAuthExpirationWatcher();

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

function handleServiceWorkerMessage(event: MessageEvent) {
  if (event.data && event.data.type === "BACKGROUND_SYNC_SUCCESS") {
    const exerciseLogsStore = useExerciseLogsStore();
    exerciseLogsStore.refresh();
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

// Keep runtime session-loss handling here; router guards remain the single source
// for normal auth/setup/document routing decisions.
watch(
  () => authStore.isLoggedIn,
  (isLoggedIn) => {
    if (isLoggedIn) return;

    const currentPath = router.currentRoute.value.path;
    const isPublicRoute = currentPath === "/privacy" || currentPath === "/impressum";
    if (isPublicRoute || currentPath === "/") return;

    router.push("/");
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
