import { defineStore } from "pinia";
import { computed } from "vue";
import { useUserProfileStore } from "@/modules/profile/presentation";
import { calculateUserProgress } from "@/modules/shared/application";
import { useTrainingSummaryStore } from "@/modules/shared/presentation";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import { summaryToExerciseLogs } from "@/modules/trainingSummary/application";

export const useUserProgressStore = defineStore("userProgress", () => {
  const logsStore = useExerciseLogsStore();
  const summaryStore = useTrainingSummaryStore();
  const profileStore = useUserProfileStore();

  const allLogs = computed(() => {
    const historicalLogs = summaryToExerciseLogs(summaryStore.summaries);
    return [...historicalLogs, ...logsStore.exerciseLogs];
  });

  const userProgress = computed(() => {
    return calculateUserProgress(allLogs.value, profileStore.userProfile.workoutDaysPerWeek || 3);
  });

  return { allLogs, userProgress };
});
