import * as Sentry from "@sentry/vue";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { errAsync, type ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { retryOnAuthError } from "@/modules/auth/presentation";
import { useSpreadsheetRepositoryFactory } from "@/modules/platform/presentation";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import {
  loadTrainingSummary,
  migrateUnsummarizedMonths,
  migrateUnsummarizedYears,
  rebuildAllTrainingSummaries,
  type TrainingSummary,
} from "@/modules/trainingSummary/application";
import { createTrainingSummaryRepository } from "@/modules/trainingSummary/infrastructure";

export const useTrainingSummaryStore = defineStore("trainingSummary", () => {
  const summaryRepoFactory = useSpreadsheetRepositoryFactory(createTrainingSummaryRepository);
  const { spreadsheetStore, getDoc } = summaryRepoFactory;
  const logsStore = useExerciseLogsStore();

  const summaries = ref<TrainingSummary[]>([]);
  const isRefreshing = ref(false);
  const isRebuilding = ref(false);
  const isLoading = computed(() => isRefreshing.value || isRebuilding.value);
  const isInitialized = ref(false);
  let latestRefreshId = 0;
  let latestRebuildId = 0;

  function loadAndMigrate(
    doc: GoogleSpreadsheet,
  ): ResultAsync<TrainingSummary[], "repository-unavailable" | "refresh-failed" | "auth-failed"> {
    const summaryRepository = summaryRepoFactory.createRepository(doc);
    const logsReader = logsStore.createHistoryReader(doc);
    if (!summaryRepository || !logsReader) return errAsync("repository-unavailable");

    return loadTrainingSummary(summaryRepository)
      .andThen((loadedSummaries) =>
        migrateUnsummarizedYears(summaryRepository, logsReader, loadedSummaries),
      )
      .andThen((afterYearMigration) =>
        migrateUnsummarizedMonths(summaryRepository, logsReader, afterYearMigration),
      )
      .mapErr((error) =>
        error === "auth-failed" ? ("auth-failed" as const) : ("refresh-failed" as const),
      );
  }

  async function init(doc: GoogleSpreadsheet) {
    if (isInitialized.value) return;
    await refresh(doc);
  }

  async function refresh(docOverride?: GoogleSpreadsheet) {
    const doc = getDoc(docOverride);
    if (!doc) return;

    const callId = ++latestRefreshId;
    const isStale = () =>
      callId !== latestRefreshId || (!docOverride && spreadsheetStore.doc !== doc);
    isRefreshing.value = true;

    const result = await retryOnAuthError("training-summary-refresh", () => loadAndMigrate(doc), {
      fallbackError: "refresh-failed",
      isCancelled: isStale,
    }).orTee((error) => {
      if (error === "auth-failed" || isStale()) return;
      console.error("Failed to refresh training summary:", error);
      Sentry.captureMessage("Failed to refresh training summary", {
        level: "error",
        tags: { scope: "training-summary-store", feature: "refresh" },
        extra: { reason: error },
      });
    });

    if (isStale()) return;

    if (result.isOk()) {
      summaries.value = result.value;
      isInitialized.value = true;
    }

    isRefreshing.value = false;
  }

  function rebuildAllSummaries(docOverride?: GoogleSpreadsheet) {
    const doc = getDoc(docOverride);
    if (!doc) return errAsync("repository-unavailable" as const);

    const summaryRepository = summaryRepoFactory.createRepository(doc);
    const logsReader = logsStore.createHistoryReader(doc);
    if (!summaryRepository || !logsReader) return errAsync("repository-unavailable" as const);

    const rebuildId = ++latestRebuildId;
    const isStale = () =>
      rebuildId !== latestRebuildId || (!docOverride && spreadsheetStore.doc !== doc);
    isRebuilding.value = true;

    return retryOnAuthError(
      "training-summary-rebuild",
      () => rebuildAllTrainingSummaries(summaryRepository, logsReader),
      {
        fallbackError: "save-failed",
        isCancelled: isStale,
      },
    )
      .orTee((error) => {
        if (error === "auth-failed" || isStale()) return;
        console.error("Failed to rebuild all training summaries:", error);
        Sentry.captureMessage("Failed to rebuild training summary", {
          level: "error",
          tags: { scope: "training-summary-store", feature: "rebuild" },
          extra: { reason: error },
        });
      })
      .map((summariesResult: TrainingSummary[]) => {
        if (!isStale()) {
          summaries.value = summariesResult;
          isRebuilding.value = false;
        }
        return summariesResult;
      })
      .mapErr((err) => {
        if (!isStale()) {
          isRebuilding.value = false;
        }
        return err;
      });
  }

  watch(
    () => spreadsheetStore.doc,
    (doc) => {
      if (!doc) {
        latestRefreshId += 1;
        latestRebuildId += 1;
        summaries.value = [];
        isInitialized.value = false;
        isRefreshing.value = false;
        isRebuilding.value = false;
        return;
      }
      void init(doc);
    },
    { immediate: true },
  );

  return { summaries, isLoading, isInitialized, refresh, rebuildAllSummaries };
});
