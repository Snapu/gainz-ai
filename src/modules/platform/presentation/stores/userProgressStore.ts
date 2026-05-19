import { defineStore } from "pinia";
import { computed } from "vue";
import { useUserProfileStore } from "@/modules/profile/presentation";
import { calculateUserProgress, type UserProgress } from "@/modules/sharedKernel/presentation";
import { type ExerciseLog, useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import { summaryToExerciseLogs } from "@/modules/trainingSummary/presentation";
import { useTrainingSummaryStore } from "./trainingSummaryStore";

export const useUserProgressStore = defineStore("userProgress", () => {
  const logsStore = useExerciseLogsStore();
  const summaryStore = useTrainingSummaryStore();
  const profileStore = useUserProfileStore();

  const allLogs = computed<ExerciseLog[]>(() => {
    const historicalLogs = summaryToExerciseLogs(summaryStore.summaries);
    return [...historicalLogs, ...logsStore.exerciseLogs];
  });

  const userProgress = computed<UserProgress>(() => {
    return calculateUserProgress(allLogs.value, profileStore.userProfile.workoutDaysPerWeek || 3);
  });

  return { allLogs, userProgress };
});
