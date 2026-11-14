import type { GoogleSpreadsheet } from "google-spreadsheet";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { retryOnAuthError } from "@/modules/auth/presentation";
import {
  applyExerciseWeightMigrationDecision,
  buildPendingExerciseMigrationCandidates,
  type ExerciseWeightMigrationCandidate,
  type ExerciseWeightMigrationDecision,
  type ExerciseWeightMigrationReview,
  loadAllLogsForMigration,
  loadExerciseWeightMigrationReviews,
  type MigrationApplyError,
  type MigrationLoadError,
} from "@/modules/migration/application";
import { createExerciseWeightMigrationRepository } from "@/modules/migration/infrastructure";
import { useSpreadsheetRepositoryFactory } from "@/modules/platform/presentation";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import { useTrainingSummaryStore } from "@/modules/trainingSummary/presentation";

export const useExerciseWeightMigrationStore = defineStore("exerciseWeightMigration", () => {
  const migrationRepoFactory = useSpreadsheetRepositoryFactory(
    createExerciseWeightMigrationRepository,
  );

  const { spreadsheetStore, getDoc } = migrationRepoFactory;
  const logsStore = useExerciseLogsStore();
  const trainingSummaryStore = useTrainingSummaryStore();

  const pendingExercises = ref<ExerciseWeightMigrationCandidate[]>([]);
  const reviewedExercises = ref<ExerciseWeightMigrationReview[]>([]);
  const isLoading = ref(false);
  const activeExerciseName = ref<string | null>(null);
  const lastError = ref<string | null>(null);
  let latestRefreshId = 0;
  let latestApplyId = 0;

  const reviewedCount = computed(() => reviewedExercises.value.length);

  function refresh(docOverride?: GoogleSpreadsheet): ResultAsync<void, MigrationLoadError> {
    const doc = getDoc(docOverride);
    if (!doc) return okAsync(undefined);

    const migrationRepository = migrationRepoFactory.createRepository(doc);
    const logsReader = logsStore.createHistoryReader(doc);
    if (!migrationRepository || !logsReader) {
      lastError.value = "load-failed";
      isLoading.value = false;
      return errAsync("load-failed");
    }

    const callId = ++latestRefreshId;
    const isStale = () =>
      callId !== latestRefreshId || (!docOverride && spreadsheetStore.doc !== doc);
    isLoading.value = true;
    lastError.value = null;

    return ResultAsync.combine([
      retryOnAuthError(
        "migration-reviews-load",
        () => loadExerciseWeightMigrationReviews(migrationRepository),
        { fallbackError: "load-failed", isCancelled: isStale },
      ),
      retryOnAuthError("migration-logs-load", () => loadAllLogsForMigration(logsReader), {
        fallbackError: "load-failed",
        isCancelled: isStale,
      }).mapErr(
        (error): MigrationLoadError =>
          error === "auth-failed" || error === "parse-data-failed" ? error : "load-failed",
      ),
    ])
      .map(([reviews, logs]) => {
        if (isStale()) return undefined;
        reviewedExercises.value = reviews;
        pendingExercises.value = buildPendingExerciseMigrationCandidates(logs, reviews);
        isLoading.value = false;
        return undefined;
      })
      .mapErr((error) => {
        if (!isStale()) {
          lastError.value = error;
          isLoading.value = false;
        }
        return error;
      });
  }

  function refreshStoresAfterDecision(
    docOverride: GoogleSpreadsheet | undefined,
  ): ResultAsync<void, MigrationApplyError> {
    return ResultAsync.combine([
      refresh(docOverride),
      logsStore
        .refresh()
        .map(() => undefined)
        .orElse((error) => (error === "refresh-in-progress" ? okAsync(undefined) : errAsync(error)))
        .mapErr(
          (error): MigrationApplyError =>
            error === "auth-failed" || error === "parse-data-failed" ? error : "load-failed",
        ),
    ]).map(() => undefined);
  }

  function applyDecision(exerciseName: string, decision: ExerciseWeightMigrationDecision) {
    const doc = getDoc();
    const docOverride = doc ?? undefined;
    const repository = migrationRepoFactory.createRepository(docOverride);
    if (!repository) {
      lastError.value = "load-failed";
      return null;
    }

    const applyId = ++latestApplyId;
    const isStale = () => applyId !== latestApplyId || spreadsheetStore.doc !== doc;

    activeExerciseName.value = exerciseName;
    lastError.value = null;

    return retryOnAuthError(
      "migration-decision-apply",
      () => applyExerciseWeightMigrationDecision(exerciseName, decision, repository),
      { fallbackError: "save-failed", isCancelled: isStale },
    )
      .andThen(() => {
        if (isStale()) return okAsync<void, MigrationApplyError>(undefined);
        return ResultAsync.combine([
          trainingSummaryStore
            .rebuildAllSummaries(docOverride)
            .map(() => undefined)
            .mapErr(
              (error): MigrationApplyError =>
                error === "auth-failed" ? "auth-failed" : "summary-rebuild-failed",
            ),
          refreshStoresAfterDecision(docOverride),
        ]).map(() => undefined);
      })
      .map(() => {
        if (!isStale()) {
          activeExerciseName.value = null;
        }
        return undefined;
      })
      .orTee((error) => {
        if (!isStale()) {
          lastError.value = error;
          activeExerciseName.value = null;
        }
      });
  }

  watch(
    () => spreadsheetStore.doc,
    (doc) => {
      if (!doc) {
        latestRefreshId += 1;
        latestApplyId += 1;
        pendingExercises.value = [];
        reviewedExercises.value = [];
        activeExerciseName.value = null;
        lastError.value = null;
        isLoading.value = false;
        return;
      }
      void refresh(doc);
    },
    { immediate: true },
  );

  return {
    pendingExercises,
    reviewedExercises,
    reviewedCount,
    isLoading,
    activeExerciseName,
    lastError,
    refresh,
    applyDecision,
  };
});
