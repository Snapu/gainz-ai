import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok, type Result } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref, watchEffect } from "vue";
import { findPastYearLogSheets, loadExerciseLogs, loadLogsFromYear } from "@/services/exerciseLogs";
import {
  applyExerciseWeightMigrationDecision,
  buildExerciseWeightMigrationCandidates,
  type ExerciseWeightMigrationCandidate,
  type ExerciseWeightMigrationDecision,
  type ExerciseWeightMigrationReview,
  loadExerciseWeightMigrationReviews,
} from "@/services/exerciseWeightMigration";
import { useExerciseLogsStore } from "./exerciseLogs";
import { useSpreadsheetStore } from "./spreadsheet";
import { useTrainingSummaryStore } from "./trainingSummary";

export const useExerciseWeightMigrationStore = defineStore("exerciseWeightMigration", () => {
  const spreadsheetStore = useSpreadsheetStore();
  const logsStore = useExerciseLogsStore();
  const trainingSummaryStore = useTrainingSummaryStore();

  const pendingExercises = ref<ExerciseWeightMigrationCandidate[]>([]);
  const reviewedExercises = ref<ExerciseWeightMigrationReview[]>([]);
  const isLoading = ref(false);
  const activeExerciseName = ref<string | null>(null);
  const lastError = ref<string | null>(null);

  const reviewedCount = computed(() => reviewedExercises.value.length);

  async function loadAllLogs(
    doc: GoogleSpreadsheet,
  ): Promise<
    Result<
      Awaited<ReturnType<typeof loadExerciseLogs>> extends Result<infer T, any> ? T : never,
      "load-failed" | "parse-data-failed" | "sheet-not-found" | "auth-failed"
    >
  > {
    const currentYearLogsResult = await loadExerciseLogs(doc);
    if (currentYearLogsResult.isErr()) return err(currentYearLogsResult.error);

    const logs = [...currentYearLogsResult.value];
    for (const year of findPastYearLogSheets(doc)) {
      const yearLogsResult = await loadLogsFromYear(year, doc);
      if (yearLogsResult.isErr()) return err(yearLogsResult.error);
      logs.push(...yearLogsResult.value);
    }

    return ok(logs);
  }

  async function refresh(docOverride?: GoogleSpreadsheet) {
    const doc = docOverride ?? spreadsheetStore.doc;
    if (!doc) return;

    isLoading.value = true;
    lastError.value = null;

    try {
      const [reviewsResult, logsResult] = await Promise.all([
        loadExerciseWeightMigrationReviews(doc),
        loadAllLogs(doc),
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
      pendingExercises.value = buildExerciseWeightMigrationCandidates(
        logsResult.value,
        reviewsResult.value,
      );
    } finally {
      isLoading.value = false;
    }
  }

  async function applyDecision(exerciseName: string, decision: ExerciseWeightMigrationDecision) {
    const doc = spreadsheetStore.doc;
    if (!doc) {
      lastError.value = "load-failed";
      return null;
    }

    activeExerciseName.value = exerciseName;
    lastError.value = null;

    try {
      const result = await applyExerciseWeightMigrationDecision(exerciseName, decision, doc);
      if (result.isErr()) {
        lastError.value = result.error;
        return result;
      }

      await Promise.all([refresh(doc), logsStore.refresh(), trainingSummaryStore.refresh(doc)]);

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
