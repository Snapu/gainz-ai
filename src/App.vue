<script setup lang="ts">
import { useRegisterSW } from "virtual:pwa-register/vue";
import { App as CapacitorApp } from "@capacitor/app";
import { ConfigProvider } from "reka-ui";
import { onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import UiToaster from "@/components/ui/UiToaster.vue";
import { useAuthExpirationWatcher } from "@/composables/useAuthExpirationWatcher";
import { useToast } from "@/composables/useToast";
import { useAuthStore } from "@/stores/auth";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";
import { useSpreadsheetStore } from "@/stores/spreadsheet";
import { useUserProfileStore } from "@/stores/userProfile";

const router = useRouter();
const authStore = useAuthStore();
const userProfileStore = useUserProfileStore();
const spreadsheetStore = useSpreadsheetStore();

// Start watching for auth expiration
useAuthExpirationWatcher();

let swUpdateInterval: ReturnType<typeof setInterval> | undefined;

const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      // Check for updates every hour
      swUpdateInterval = setInterval(
        () => {
          registration.update();
        },
        60 * 60 * 1000,
      );

      // Check for updates when the app comes to foreground
      CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) {
          registration.update();
        }
      });
    }
  },
});

onUnmounted(() => {
  clearInterval(swUpdateInterval);
});

const { toast } = useToast();

watch(needRefresh, (isNeeded) => {
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
});

// Move sync listener from main.ts to App.vue
onMounted(() => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data && event.data.type === "BACKGROUND_SYNC_SUCCESS") {
        console.log("Background sync completed, refreshing all stores...");
        const exerciseLogsStore = useExerciseLogsStore();
        exerciseLogsStore.refresh();
      }
    });
  }
});

// Reactively handle auth/state changes and redirect if necessary
// This handles transitions (e.g., session expires while on a page)
watch(
  [
    () => authStore.isLoggedIn,
    () => spreadsheetStore.doc,
    () => userProfileStore.isLoading,
    () => userProfileStore.setupCompleted,
  ],
  ([isLoggedIn, doc, isLoading, setupCompleted]) => {
    const currentPath = router.currentRoute.value.path;

    // Skip redirection for public pages
    if (currentPath === "/privacy" || currentPath === "/impressum") return;

    console.log("[App] State watch triggered:", {
      isLoggedIn,
      hasDoc: !!doc,
      isLoading,
      setupCompleted,
      currentPath,
    });

    if (!isLoggedIn) {
      if (currentPath !== "/") router.push("/");
    } else if (!doc || isLoading) {
      if (currentPath !== "/loading") router.push("/loading");
    } else if (!setupCompleted) {
      if (!currentPath.startsWith("/wizard")) router.push("/wizard/fitness-goal");
    } else {
      // If we are logged in, have a doc, and setup is complete,
      // but we are on an auth page, redirect to app.
      if (currentPath === "/" || currentPath === "/loading" || currentPath.startsWith("/wizard")) {
        router.push("/exercise-logs");
      }
    }
  },
  { immediate: false }, // navigation guard handles the immediate load
);
</script>

<template>
  <ConfigProvider locale="en" :scroll-body="false">
    <RouterView />
    <UiToaster />
  </ConfigProvider>
</template>
