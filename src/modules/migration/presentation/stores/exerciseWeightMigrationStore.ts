import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok, ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref, watchEffect } from "vue";

import {
  applyExerciseWeightMigrationDecision,
  buildPendingExerciseMigrationCandidates,
  type ExerciseWeightMigrationCandidate,
  type ExerciseWeightMigrationDecision,
  type ExerciseWeightMigrationReview,
  loadAllLogsForMigration,
  loadExerciseWeightMigrationReviews,
} from "@/modules/migration/application";
import { createExerciseWeightMigrationRepository } from "@/modules/migration/infrastructure";
import {
  useSpreadsheetRepositoryFactory,
  useTrainingSummaryStore,
} from "@/modules/platform/presentation";
import { createExerciseLogRepository } from "@/modules/trainingLogs/infrastructure";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";

export const useExerciseWeightMigrationStore = defineStore("exerciseWeightMigration", () => {
  const migrationRepoFactory = useSpreadsheetRepositoryFactory(
    createExerciseWeightMigrationRepository,
  );
  const logsRepoFactory = useSpreadsheetRepositoryFactory(createExerciseLogRepository);

  const { spreadsheetStore, getDoc } = migrationRepoFactory;
  const logsStore = useExerciseLogsStore();
  const trainingSummaryStore = useTrainingSummaryStore();

  const pendingExercises = ref<ExerciseWeightMigrationCandidate[]>([]);
  const reviewedExercises = ref<ExerciseWeightMigrationReview[]>([]);
  const isLoading = ref(false);
  const activeExerciseName = ref<string | null>(null);
  const lastError = ref<string | null>(null);

  const reviewedCount = computed(() => reviewedExercises.value.length);

  async function refresh(docOverride?: GoogleSpreadsheet) {
    const doc = getDoc(docOverride);
    if (!doc) return;

    isLoading.value = true;
    lastError.value = null;

    const migrationRepository = migrationRepoFactory.createRepository(doc);
    const logsRepository = logsRepoFactory.createRepository(doc);
    if (!migrationRepository || !logsRepository) {
      lastError.value = "load-failed";
      isLoading.value = false;
      return;
    }

    const result = await ResultAsync.fromPromise(
      Promise.all([
        loadExerciseWeightMigrationReviews(migrationRepository),
        loadAllLogsForMigration(logsRepository),
      ]),
      (error) => {
        console.error("Failed to refresh exercise weight migration data:", error);
        return "load-failed" as const;
      },
    );

    isLoading.value = false;

    if (result.isErr()) {
      lastError.value = result.error;
      return;
    }

    const [reviewsResult, logsResult] = result.value;

    if (reviewsResult.isErr()) {
      lastError.value = reviewsResult.error;
      return;
    }

    if (logsResult.isErr()) {
      lastError.value = logsResult.error;
      return;
    }

    reviewedExercises.value = reviewsResult.value;
    pendingExercises.value = buildPendingExerciseMigrationCandidates(
      logsResult.value,
      reviewsResult.value,
    );
  }

  async function applyDecision(exerciseName: string, decision: ExerciseWeightMigrationDecision) {
    const repository = migrationRepoFactory.createRepository();
    if (!repository) {
      lastError.value = "load-failed";
      return null;
    }

    activeExerciseName.value = exerciseName;
    lastError.value = null;

    // Compose: apply → refresh all stores → isolate side effects (error handling + cleanup)
    // Using orTee pattern from neverthrow-elegant: side effects don't pollute the chain
    return ResultAsync.fromPromise(
      applyExerciseWeightMigrationDecision(exerciseName, decision, repository),
      (error) => {
        console.error("Failed to apply exercise weight migration decision:", error);
        return "save-failed" as const;
      },
    )
      .andThen(() =>
        ResultAsync.fromPromise(
          Promise.all([refresh(), logsStore.refresh(), trainingSummaryStore.refresh()]),
          (error) => {
            console.error("Failed to refresh after decision:", error);
            return "save-failed" as const;
          },
        ),
      )
      .map(() => {
        // Success path: clean up state after both succeed
        activeExerciseName.value = null;
        return undefined;
      })
      .orTee((error) => {
        // Error path (isolated): capture error and clean up on both success/failure
        lastError.value = error;
        activeExerciseName.value = null;
      });
  }

  watchEffect(() => {
    const doc = spreadsheetStore.doc;
    if (!doc) return;
    void refresh(doc);
  });

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
