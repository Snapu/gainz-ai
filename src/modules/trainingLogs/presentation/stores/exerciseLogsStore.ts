import { errAsync } from "neverthrow";
import { defineStore } from "pinia";
import { watch } from "vue";
import {
  useOfflineSyncedStore,
  useSpreadsheetRepositoryFactory,
} from "@/modules/platform/presentation";
import {
  addExerciseLog as addExerciseLog_,
  deleteExerciseLog as deleteExerciseLog_,
  loadExerciseLogs,
  updateExerciseLog as updateExerciseLog_,
} from "@/modules/trainingLogs/application";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import { createExerciseLogRepository } from "@/modules/trainingLogs/infrastructure";
import { useAuthErrorHandler } from "@/shared/presentation/composables/useAuthErrorHandler";

export const useExerciseLogsStore = defineStore("exerciseLogs", () => {
  const { spreadsheetStore, createRepository } = useSpreadsheetRepositoryFactory(
    createExerciseLogRepository,
  );
  const { handleAuthError } = useAuthErrorHandler();
  const {
    items: exerciseLogs,
    isLoading,
    isRefreshing,
    add,
    remove,
    update,
    refresh,
  } = useOfflineSyncedStore<
    ExerciseLog,
    "load-failed" | "parse-data-failed" | "auth-failed",
    "add-failed" | "auth-failed",
    "delete-failed" | "auth-failed",
    "update-failed" | "auth-failed"
  >({
    getId: (log) => log.id,
    fetchRemote: () => {
      const repository = createRepository();
      if (!repository) return errAsync("load-failed");
      return loadExerciseLogs(repository);
    },
    addRemote: (item) => {
      const repository = createRepository();
      if (!repository) return errAsync("add-failed");
      return addExerciseLog_(item, repository);
    },
    removeRemote: (item) => {
      const repository = createRepository();
      if (!repository) return errAsync("delete-failed");
      return deleteExerciseLog_(item, repository);
    },
    updateRemote: (item) => {
      const repository = createRepository();
      if (!repository) return errAsync("update-failed");
      return updateExerciseLog_(item, repository);
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

  const addExerciseLog: typeof add = (exerciseLog) => {
    console.log("Adding exercise log", exerciseLog);
    return add(exerciseLog).mapErr((error) => {
      if (error === "auth-failed") {
        handleAuthError("exercise-log-add");
      }
      return error;
    });
  };

  const removeExerciseLog: typeof remove = (exerciseLog) => {
    console.log("Removing exercise log", exerciseLog);
    return remove(exerciseLog).mapErr((error) => {
      if (error === "auth-failed") {
        handleAuthError("exercise-log-delete");
      }
      return error;
    });
  };

  const updateExerciseLog: typeof update = (exerciseLog) => {
    console.log("Updating exercise log", exerciseLog);
    return update(exerciseLog).mapErr((error) => {
      if (error === "auth-failed") {
        handleAuthError("exercise-log-update");
      }
      return error;
    });
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
    updateExerciseLog,
    lastLogForExercise,
    refresh,
  };
});
