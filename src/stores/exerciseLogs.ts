import type { GoogleSpreadsheet } from "google-spreadsheet";
import { defineStore } from "pinia";
import { computed, watch } from "vue";
import { useAuthErrorHandler } from "@/composables/useAuthErrorHandler";
import {
  addExerciseLog as addExerciseLog_,
  deleteExerciseLog as deleteExerciseLog_,
  type ExerciseLog,
  loadExerciseLogs,
} from "@/services/exerciseLogs";
import { useOfflineSyncedStore } from "@/services/utils/offlineSyncedStore";
import { useSpreadsheetStore } from "./spreadsheet";

export const useExerciseLogsStore = defineStore("exerciseLogs", () => {
  const spreadsheetStore = useSpreadsheetStore();
  const { handleAuthError } = useAuthErrorHandler();
  const {
    items: exerciseLogs,
    isLoading,
    isRefreshing,
    add,
    remove,
    refresh,
  } = useOfflineSyncedStore<ExerciseLog>({
    getId: (log) => log.id,
    fetchRemote: () => loadExerciseLogs(spreadsheetStore.doc as GoogleSpreadsheet),
    addRemote: (item) => addExerciseLog_(item, spreadsheetStore.doc as GoogleSpreadsheet),
    removeRemote: (item) => deleteExerciseLog_(item, spreadsheetStore.doc as GoogleSpreadsheet),
  });

  // Refresh when spreadsheet doc becomes available (handles page refresh race condition)
  watch(
    () => spreadsheetStore.doc,
    async (doc) => {
      if (doc && exerciseLogs.value.length === 0) {
        console.log("[exerciseLogs] Spreadsheet ready, refreshing logs");
        const result = await refresh();
        if (result.isErr() && result.error === "auth-failed") {
          handleAuthError("exercise-log-load");
        }
      }
    },
  );

  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const workoutStarted = computed(() =>
    exerciseLogs.value.find((log) => log.loggedAt.getTime() > startOfToday),
  );

  const addExerciseLog: typeof add = async (exerciseLog) => {
    console.log("Adding exercise log", exerciseLog);
    const result = await add(exerciseLog);
    if (result.isErr() && result.error === "auth-failed") {
      handleAuthError("exercise-log-add");
      return result;
    }
    return result;
  };

  const removeExerciseLog: typeof remove = async (exerciseLog) => {
    console.log("Removing exercise log", exerciseLog);
    const result = await remove(exerciseLog);
    if (result.isErr() && result.error === "auth-failed") {
      handleAuthError("exercise-log-delete");
      return result;
    }
    return result;
  };

  function lastLogForExercise(exerciseName: string) {
    return exerciseLogs.value
      .filter((log) => exerciseName === log.exerciseName)
      .sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime())?.[0];
  }

  return {
    exerciseLogs,
    workoutStarted,
    isLoading,
    isRefreshing,
    addExerciseLog,
    removeExerciseLog,
    lastLogForExercise,
    refresh,
  };
});
