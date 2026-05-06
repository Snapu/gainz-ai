import { defineStore } from "pinia";
import { computed } from "vue";
import { calculateTrainingInsights, type TrainingInsights } from "@/services/trainingScience";
import { summaryToExerciseLogs } from "@/services/trainingSummary";
import { useDeloadStore } from "@/stores/deload";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";
import { useExerciseMuscleMapStore } from "@/stores/exerciseMuscleMap";
import { useTrainingSummaryStore } from "@/stores/trainingSummary";
import { useUserProfileStore } from "@/stores/userProfile";

export type { TrainingInsights };

/**
 * Cached training insights store.
 *
 * Single source of truth for `calculateTrainingInsights()` output.
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

  /** Historical + current logs combined — same window used by all insight calculations. */
  const allLogs = computed(() => {
    const historical = summaryToExerciseLogs(summaryStore.summaries);
    return [...historical, ...logsStore.exerciseLogs];
  });

  const insights = computed(() =>
    calculateTrainingInsights(
      allLogs.value,
      new Date(),
      muscleMapStore.learnedMap,
      profileStore.userProfile.weightKg,
      deloadStore.phase,
    ),
  );

  return { insights, allLogs };
});
