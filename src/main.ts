import { IonicVue } from "@ionic/vue";

import { createPinia } from "pinia";
import { createApp, watch } from "vue";

import App from "@/App.vue";

import router from "@/router";

/* Core CSS required for Ionic components to work properly */
import "@ionic/vue/css/core.css";

/* Basic CSS for apps built with Ionic */
import "@ionic/vue/css/normalize.css";
import "@ionic/vue/css/structure.css";
import "@ionic/vue/css/typography.css";

/* Optional CSS utils that can be commented out */
import "@ionic/vue/css/padding.css";
import "@ionic/vue/css/float-elements.css";
import "@ionic/vue/css/text-alignment.css";
import "@ionic/vue/css/text-transformation.css";
import "@ionic/vue/css/flex-utils.css";
import "@ionic/vue/css/display.css";

/**
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */

/* @import '@ionic/vue/css/palettes/dark.always.css'; */
/* @import '@ionic/vue/css/palettes/dark.class.css'; */
import "@ionic/vue/css/palettes/dark.system.css";

/* Theme variables */
import "@/theme/variables.css";
import { useAuthStore } from "./stores/auth";
import { useExerciseLogsStore } from "./stores/exerciseLogs";
import { useExercisesStore } from "./stores/exercises";
import { useSpreadsheetStore } from "./stores/spreadsheet";
import { useUserProfileStore } from "./stores/userProfile";

const app = createApp(App).use(IonicVue).use(createPinia()).use(router);

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

// Auto-refresh token when it's about to expire
watch(
  () => authStore.needsRefresh,
  async (needsRefresh) => {
    if (needsRefresh && authStore.isLoggedIn) {
      console.log("Access token expiring soon, refreshing...");
      try {
        await authStore.refreshAccessToken();
        console.log("Access token refreshed successfully");
      } catch (error) {
        console.error("Failed to refresh access token:", error);
      }
    }
  },
  { immediate: true },
);

watch(
  [() => authStore.isLoggedIn, () => spreadsheetStore.doc],
  ([isLoggedIn, doc]) => {
    if (!isLoggedIn) {
      router.push("/");
    } else if (!userProfileStore.setupCompleted) {
      router.push("/wizard/fitness-goal");
    } else if (!doc) {
      router.push("/spreadsheet-init");
    } else {
      router.push("/exercise-logs");
    }
  },
  { immediate: true },
);
