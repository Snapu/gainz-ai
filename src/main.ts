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

// Migrate old pending operations from previous localStorage-based queue to Workbox
async function migrateOldPendingOperations() {
  try {
    // Check if migration already ran
    const migrationCompleted = localStorage.getItem("migration:v1:completed");
    if (migrationCompleted === "true") {
      console.log("Migration already completed, skipping...");
      return;
    }

    const oldLogsQueue = localStorage.getItem("pending:exerciseLogs");
    const oldExercisesQueue = localStorage.getItem("pending:exercise");

    if (oldLogsQueue || oldExercisesQueue) {
      console.log("Migrating old pending operations to Workbox...");

      const exerciseLogsStore = useExerciseLogsStore();
      const exercisesStore = useExercisesStore();

      // Migrate exercise logs
      if (oldLogsQueue) {
        const operations = JSON.parse(oldLogsQueue);
        for (const op of operations) {
          // Add UUID if missing (old data didn't have UUIDs)
          if (!op.item.id) {
            op.item.id = crypto.randomUUID();
          }

          // Convert date strings back to Date objects
          if (op.item.loggedAt && typeof op.item.loggedAt === "string") {
            op.item.loggedAt = new Date(op.item.loggedAt);
          }

          if (op.type === "add") await exerciseLogsStore.addExerciseLog(op.item);
          else if (op.type === "remove") await exerciseLogsStore.removeExerciseLog(op.item);
        }
      }

      // Migrate exercises (exercises use name as ID, so no UUID needed)
      if (oldExercisesQueue) {
        const operations = JSON.parse(oldExercisesQueue);
        for (const op of operations) {
          if (op.type === "add") await exercisesStore.addExercise(op.item);
          else if (op.type === "remove") await exercisesStore.removeExerciseByName(op.item.name);
        }
      }

      console.log("Migration complete - Workbox will handle queued requests");
    }

    // Always mark migration as complete and clean up, even if queues were empty
    localStorage.setItem("migration:v1:completed", "true");
    localStorage.removeItem("pending:exerciseLogs");
    localStorage.removeItem("pending:exercise");
    localStorage.removeItem("cache:exerciseLogs");
    localStorage.removeItem("cache:exercise");
  } catch (error) {
    console.error("Failed to migrate old pending operations:", error);
    // Don't mark as complete if migration failed
  }
}

router.isReady().then(() => {
  app.mount("#app");
  migrateOldPendingOperations();
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
