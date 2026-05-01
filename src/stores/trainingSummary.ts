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

  async function init(doc: GoogleSpreadsheet) {
    if (isInitialized.value) return;
    isLoading.value = true;

    try {
      const loadResult = await loadTrainingSummary(doc);
      if (loadResult.isErr()) {
        console.error("Failed to load training summary:", loadResult.error);
        Sentry.captureMessage("Failed to load training summary", {
          level: "error",
          tags: { scope: "training-summary-store", feature: "init-load" },
          extra: { reason: loadResult.error },
        });
        return;
      }

      const afterYearMigration = await migrateUnsummarizedYears(doc, loadResult.value);
      const migratedSummaries = await migrateUnsummarizedMonths(doc, afterYearMigration);
      summaries.value = migratedSummaries;
      isInitialized.value = true;
    } catch (error) {
      console.error("Failed to init training summary:", error);
      Sentry.captureException(error, {
        tags: { scope: "training-summary-store", feature: "init" },
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

  return { summaries, isLoading, isInitialized };
});
