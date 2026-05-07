import * as Sentry from "@sentry/vue";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { defineStore } from "pinia";
import { ref, watchEffect } from "vue";
import {
  loadTrainingSummary,
  migrateUnsummarizedMonths,
  migrateUnsummarizedYears,
  type TrainingSummary,
} from "@/services/trainingSummary";
import { useSpreadsheetStore } from "./spreadsheet";

export const useTrainingSummaryStore = defineStore("trainingSummary", () => {
  const spreadsheetStore = useSpreadsheetStore();
  const summaries = ref<TrainingSummary[]>([]);
  const isLoading = ref(false);
  const isInitialized = ref(false);

  async function loadAndMigrate(doc: GoogleSpreadsheet) {
    const loadResult = await loadTrainingSummary(doc);
    if (loadResult.isErr()) {
      console.error("Failed to load training summary:", loadResult.error);
      Sentry.captureMessage("Failed to load training summary", {
        level: "error",
        tags: { scope: "training-summary-store", feature: "load" },
        extra: { reason: loadResult.error },
      });
      return null;
    }

    const afterYearMigration = await migrateUnsummarizedYears(doc, loadResult.value);
    return migrateUnsummarizedMonths(doc, afterYearMigration);
  }

  async function init(doc: GoogleSpreadsheet) {
    if (isInitialized.value) return;
    await refresh(doc);
  }

  async function refresh(docOverride?: GoogleSpreadsheet) {
    const doc = docOverride ?? spreadsheetStore.doc;
    if (!doc) return;

    isLoading.value = true;

    try {
      const migratedSummaries = await loadAndMigrate(doc);
      if (!migratedSummaries) return;
      summaries.value = migratedSummaries;
      isInitialized.value = true;
    } catch (error) {
      console.error("Failed to refresh training summary:", error);
      Sentry.captureException(error, {
        tags: { scope: "training-summary-store", feature: "refresh" },
      });
    } finally {
      isLoading.value = false;
    }
  }

  watchEffect(() => {
    const doc = spreadsheetStore.doc;
    if (!doc) return;
    void init(doc);
  });

  return { summaries, isLoading, isInitialized, refresh };
});
