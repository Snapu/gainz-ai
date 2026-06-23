import * as Sentry from "@sentry/vue";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { errAsync, type ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { ref, watchEffect } from "vue";
import { createExerciseLogRepository } from "@/modules/trainingLogs/infrastructure";
import {
  findPastYearLogSheets,
  loadExerciseLogs,
  loadLogsFromYear,
} from "@/modules/trainingLogs/presentation";
import { createTrainingSummaryRepository } from "@/modules/trainingSummary/infrastructure";
import {
  loadTrainingSummary,
  migrateUnsummarizedMonths,
  migrateUnsummarizedYears,
  rebuildAllTrainingSummaries,
  type TrainingLogHistoryRepository,
  type TrainingSummary,
} from "@/modules/trainingSummary/presentation";
import { useSpreadsheetRepositoryFactory } from "../composables/spreadsheetRepositoryFactory";

export const useTrainingSummaryStore = defineStore("trainingSummary", () => {
  const summaryRepoFactory = useSpreadsheetRepositoryFactory(createTrainingSummaryRepository);
  const logsRepoFactory = useSpreadsheetRepositoryFactory(createExerciseLogRepository);
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

  function loadAndMigrate(
    doc: GoogleSpreadsheet,
  ): ResultAsync<TrainingSummary[], "repository-unavailable" | "refresh-failed"> {
    const summaryRepository = summaryRepoFactory.createRepository(doc);
    const logsRepository = createTrainingLogHistoryRepository(doc);
    if (!summaryRepository || !logsRepository) return errAsync("repository-unavailable");

    return loadTrainingSummary(summaryRepository)
      .orTee((error: unknown) => {
        console.error("Failed to load training summary:", error);
        Sentry.captureMessage("Failed to load training summary", {
          level: "error",
          tags: { scope: "training-summary-store", feature: "load" },
          extra: { reason: error },
        });
      })
      .andThen((loadedSummaries) =>
        migrateUnsummarizedYears(summaryRepository, logsRepository, loadedSummaries),
      )
      .andThen((afterYearMigration) =>
        migrateUnsummarizedMonths(summaryRepository, logsRepository, afterYearMigration),
      )
      .mapErr(() => "refresh-failed" as const);
  }

  async function init(doc: GoogleSpreadsheet) {
    if (isInitialized.value) return;
    await refresh(doc);
  }

  async function refresh(docOverride?: GoogleSpreadsheet) {
    const doc = getDoc(docOverride);
    if (!doc) return;

    isLoading.value = true;

    const result = await loadAndMigrate(doc).orTee((error) => {
      console.error("Failed to refresh training summary:", error);
      Sentry.captureMessage("Failed to refresh training summary", {
        level: "error",
        tags: { scope: "training-summary-store", feature: "refresh" },
        extra: { reason: error },
      });
    });

    if (result.isOk()) {
      summaries.value = result.value;
      isInitialized.value = true;
    }

    isLoading.value = false;
  }

  function rebuildAllSummaries(docOverride?: GoogleSpreadsheet) {
    const doc = getDoc(docOverride);
    if (!doc) return errAsync("repository-unavailable" as const);

    isLoading.value = true;
    const summaryRepository = createTrainingSummaryRepository(doc);
    const logsRepository = createTrainingLogHistoryRepository(doc);
    if (!logsRepository) return errAsync("repository-unavailable" as const);

    return rebuildAllTrainingSummaries(summaryRepository, logsRepository)
      .orTee((error: any) => {
        console.error("Failed to rebuild all training summaries:", error);
        Sentry.captureMessage("Failed to rebuild training summary", {
          level: "error",
          tags: { scope: "training-summary-store", feature: "rebuild" },
          extra: { reason: error },
        });
      })
      .map((summariesResult: TrainingSummary[]) => {
        summaries.value = summariesResult;
        isLoading.value = false;
        return summariesResult;
      })
      .mapErr((err: any) => {
        isLoading.value = false;
        return err;
      });
  }

  watchEffect(() => {
    const doc = spreadsheetStore.doc;
    if (!doc) return;
    void init(doc);
  });

  return { summaries, isLoading, isInitialized, refresh, rebuildAllSummaries };
});
