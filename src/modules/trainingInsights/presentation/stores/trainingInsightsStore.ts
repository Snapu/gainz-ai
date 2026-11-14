import { useIntervalFn, useNow } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed } from "vue";
import { useDeloadStore } from "@/modules/deload/presentation";
import { useExerciseMuscleMapStore } from "@/modules/platform/presentation";
import { useUserProfileStore } from "@/modules/profile/presentation";
import {
  calculateInsights,
  summaryToExerciseLogs,
  type TrainingInsights,
} from "@/modules/trainingInsights/application";
import { type ExerciseLog, useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import { useTrainingSummaryStore } from "@/modules/trainingSummary/presentation";

/**
 * Cached training insights store.
 *
 * Single source of truth for training insights calculation.
 * Views and stores consume `insights` here instead of calling the service
 * function directly — keeps service calls out of the view layer and avoids
 * redundant recomputation.
 */
export const useTrainingInsightsStore = defineStore("trainingInsights", () => {
  const logsStore = useExerciseLogsStore();
  const summaryStore = useTrainingSummaryStore();
  const profileStore = useUserProfileStore();
  const muscleMapStore = useExerciseMuscleMapStore();
  const deloadStore = useDeloadStore();
  const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 60000) });

  /** Historical + current logs combined — same window used by all insight calculations. */
  const allLogs = computed<ExerciseLog[]>(() => {
    const historical = summaryToExerciseLogs(summaryStore.summaries);
    return [...historical, ...logsStore.exerciseLogs];
  });

  const insights = computed<TrainingInsights>(() =>
    calculateInsights(
      allLogs.value,
      now.value,
      muscleMapStore.learnedMap,
      profileStore.userProfile.weightKg,
      deloadStore.phase,
    ),
  );

  return { insights, allLogs };
});
