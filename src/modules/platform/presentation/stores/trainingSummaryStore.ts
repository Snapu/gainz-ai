import * as Sentry from "@sentry/vue";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { defineStore } from "pinia";
import { ref, watchEffect } from "vue";
import {
  findPastYearLogSheets,
  loadExerciseLogs,
  loadLogsFromYear,
} from "@/modules/trainingLogs/application";
import { createTrainingLogsRepository } from "@/modules/trainingLogs/infrastructure";
import {
  loadTrainingSummary,
  migrateUnsummarizedMonths,
  migrateUnsummarizedYears,
  type TrainingLogHistoryRepository,
  type TrainingSummary,
} from "@/modules/trainingSummary/application";
import { createTrainingSummaryRepository } from "@/modules/trainingSummary/infrastructure";
import { useSpreadsheetRepositoryFactory } from "../composables/spreadsheetRepositoryFactory";

export const useTrainingSummaryStore = defineStore("trainingSummary", () => {
  const summaryRepoFactory = useSpreadsheetRepositoryFactory(createTrainingSummaryRepository);
  const logsRepoFactory = useSpreadsheetRepositoryFactory(createTrainingLogsRepository);
  const { spreadsheetStore, getDoc } = summaryRepoFactory;

  const summaries = ref<TrainingSummary[]>([]);
  const isLoading = ref(false);
  const isInitialized = ref(false);

  function createTrainingLogHistoryRepository(
    doc: GoogleSpreadsheet,
  ): TrainingLogHistoryRepository | null {
    const logsRepository = logsRepoFactory.createRepository(doc);
    if (!logsRepository) return null;

    return {
      loadCurrentYearLogs: () => loadExerciseLogs(logsRepository),
      findPastYears: () => findPastYearLogSheets(logsRepository),
      loadYearLogs: (year: number) => loadLogsFromYear(year, logsRepository),
    };
  }

  async function loadAndMigrate(doc: GoogleSpreadsheet) {
    const summaryRepository = summaryRepoFactory.createRepository(doc);
    const logsRepository = createTrainingLogHistoryRepository(doc);
    if (!summaryRepository || !logsRepository) return null;

    const loadResult = await loadTrainingSummary(summaryRepository);
    if (loadResult.isErr()) {
      console.error("Failed to load training summary:", loadResult.error);
      Sentry.captureMessage("Failed to load training summary", {
        level: "error",
        tags: { scope: "training-summary-store", feature: "load" },
        extra: { reason: loadResult.error },
      });
      return null;
    }

    const afterYearMigration = await migrateUnsummarizedYears(
      summaryRepository,
      logsRepository,
      loadResult.value,
    );
    return migrateUnsummarizedMonths(summaryRepository, logsRepository, afterYearMigration);
  }

  async function init(doc: GoogleSpreadsheet) {
    if (isInitialized.value) return;
    await refresh(doc);
  }

  async function refresh(docOverride?: GoogleSpreadsheet) {
    const doc = getDoc(docOverride);
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
