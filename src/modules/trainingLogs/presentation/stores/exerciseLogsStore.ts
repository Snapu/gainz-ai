import { err } from "neverthrow";
import { defineStore } from "pinia";
import { watch } from "vue";
import { useOfflineSyncedStore, useSpreadsheetStore } from "@/modules/shared/presentation";
import {
  addExerciseLog as addExerciseLog_,
  deleteExerciseLog as deleteExerciseLog_,
  loadExerciseLogs,
} from "@/modules/trainingLogs/application";
import { createTrainingLogsRepository } from "@/modules/trainingLogs/infrastructure";
import { useAuthErrorHandler } from "@/shared/presentation/composables/useAuthErrorHandler";

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
  } = useOfflineSyncedStore({
    getId: (log) => log.id,
    fetchRemote: () => {
      const doc = spreadsheetStore.doc;
      if (!doc) return Promise.resolve(err("load-failed"));
      const repository = createTrainingLogsRepository(doc);
      return loadExerciseLogs(repository);
    },
    addRemote: (item) => {
      const doc = spreadsheetStore.doc;
      if (!doc) return Promise.resolve(err("add-failed"));
      const repository = createTrainingLogsRepository(doc);
      return addExerciseLog_(item, repository);
    },
    removeRemote: (item) => {
      const doc = spreadsheetStore.doc;
      if (!doc) return Promise.resolve(err("delete-failed"));
      const repository = createTrainingLogsRepository(doc);
      return deleteExerciseLog_(item, repository);
    },
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

  const addExerciseLog: typeof add = async (exerciseLog) => {
    console.log("Adding exercise log", exerciseLog);
    const result = await add(exerciseLog);
    if (result.isErr() && result.error === "auth-failed") {
      handleAuthError("exercise-log-add");
    }
    return result;
  };

  const removeExerciseLog: typeof remove = async (exerciseLog) => {
    console.log("Removing exercise log", exerciseLog);
    const result = await remove(exerciseLog);
    if (result.isErr() && result.error === "auth-failed") {
      handleAuthError("exercise-log-delete");
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
    isLoading,
    isRefreshing,
    addExerciseLog,
    removeExerciseLog,
    lastLogForExercise,
    refresh,
  };
});
