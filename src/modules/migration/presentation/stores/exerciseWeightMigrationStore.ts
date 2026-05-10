import type { GoogleSpreadsheet } from "google-spreadsheet";
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
import { createTrainingLogsRepository } from "@/modules/trainingLogs/infrastructure";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";

export const useExerciseWeightMigrationStore = defineStore("exerciseWeightMigration", () => {
  const migrationRepoFactory = useSpreadsheetRepositoryFactory(
    createExerciseWeightMigrationRepository,
  );
  const logsRepoFactory = useSpreadsheetRepositoryFactory(createTrainingLogsRepository);

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

    try {
      const migrationRepository = migrationRepoFactory.createRepository(doc);
      const logsRepository = logsRepoFactory.createRepository(doc);
      if (!migrationRepository || !logsRepository) {
        lastError.value = "load-failed";
        return;
      }

      const [reviewsResult, logsResult] = await Promise.all([
        loadExerciseWeightMigrationReviews(migrationRepository),
        loadAllLogsForMigration(logsRepository),
      ]);

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
    } finally {
      isLoading.value = false;
    }
  }

  async function applyDecision(exerciseName: string, decision: ExerciseWeightMigrationDecision) {
    const repository = migrationRepoFactory.createRepository();
    if (!repository) {
      lastError.value = "load-failed";
      return null;
    }

    activeExerciseName.value = exerciseName;
    lastError.value = null;

    try {
      const result = await applyExerciseWeightMigrationDecision(exerciseName, decision, repository);
      if (result.isErr()) {
        lastError.value = result.error;
        return result;
      }

      await Promise.all([refresh(), logsStore.refresh(), trainingSummaryStore.refresh()]);

      return result;
    } finally {
      activeExerciseName.value = null;
    }
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
