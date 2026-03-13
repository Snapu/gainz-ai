import * as Sentry from "@sentry/vue";

import { createPinia } from "pinia";
import { createApp, watch } from "vue";
import vue3GoogleLogin from "vue3-google-login";

import App from "@/App.vue";

import router from "@/router";

/* Theme variables */
import "@/theme/variables.css";
import { CLIENT_ID, useAuthStore } from "./stores/auth";
import { useExerciseLogsStore } from "./stores/exerciseLogs";
import { useExercisesStore } from "./stores/exercises";
import { useSpreadsheetStore } from "./stores/spreadsheet";
import { useUserProfileStore } from "./stores/userProfile";

const app = createApp(App).use(createPinia()).use(router).use(vue3GoogleLogin, {
  clientId: CLIENT_ID,
});

Sentry.init({
  app,
  dsn: "https://4d5bd61bc9b2ac0bdefc804ffe8abf31@o4510880320978944.ingest.de.sentry.io/4510880322617424",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: false,
});

router.isReady().then(() => {
  app.mount("#app");
});

// Register service worker and listen for background sync events
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "BACKGROUND_SYNC_SUCCESS") {
      console.log("Background sync completed, refreshing all stores...");
      // Refresh all stores after successful background sync
      const exerciseLogsStore = useExerciseLogsStore();
      const exercisesStore = useExercisesStore();
      exerciseLogsStore.refresh();
      exercisesStore.refresh();
    }
  });
}

const authStore = useAuthStore();
const userProfileStore = useUserProfileStore();
const spreadsheetStore = useSpreadsheetStore();

watch(
  [
    () => authStore.isLoggedIn,
    () => spreadsheetStore.doc,
    () => userProfileStore.isLoading,
    () => userProfileStore.setupCompleted, // CRITICAL: Must watch setupCompleted to react when it changes!
  ],
  ([isLoggedIn, doc, isLoading, setupCompleted]) => {
    console.log("[main] Watch triggered:", {
      isLoggedIn,
      hasDoc: !!doc,
      isLoading,
      setupCompleted,
    });
    if (!isLoggedIn) {
      router.push("/");
    } else if (!doc || isLoading) {
      router.push("/loading");
    } else if (!setupCompleted) {
      router.push("/wizard/fitness-goal");
    } else {
      router.push("/exercise-logs");
    }
  },
  { immediate: true },
);
