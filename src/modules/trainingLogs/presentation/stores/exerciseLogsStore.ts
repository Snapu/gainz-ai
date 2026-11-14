import type { GoogleSpreadsheet } from "google-spreadsheet";
import { errAsync, type ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { watch } from "vue";
import { retryOnAuthError } from "@/modules/auth/presentation";
import {
  useOfflineSyncedStore,
  useSpreadsheetRepositoryFactory,
} from "@/modules/platform/presentation";
import {
  addExerciseLog as addExerciseLog_,
  deleteExerciseLog as deleteExerciseLog_,
  type ExerciseLogHistoryReader,
  findPastYearLogSheets,
  loadExerciseLogs,
  loadLogsFromYear,
  updateExerciseLog as updateExerciseLog_,
} from "@/modules/trainingLogs/application";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import { createExerciseLogRepository } from "@/modules/trainingLogs/infrastructure";

type RefreshLogsError = "load-failed" | "parse-data-failed" | "auth-failed" | "refresh-in-progress";

export const useExerciseLogsStore = defineStore("exerciseLogs", () => {
  const { spreadsheetStore, createRepository } = useSpreadsheetRepositoryFactory(
    createExerciseLogRepository,
  );
  const runRefreshWithAuthRetry = (
    executeRefresh: () => ResultAsync<ExerciseLog[], RefreshLogsError>,
  ): ResultAsync<ExerciseLog[], RefreshLogsError> =>
    retryOnAuthError("exercise-log-load", executeRefresh, {
      fallbackError: "load-failed",
    });

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
    onVisibleRefresh: (defaultRefresh) => runRefreshWithAuthRetry(defaultRefresh),
  });

  function refreshLogs(): ResultAsync<ExerciseLog[], RefreshLogsError> {
    return runRefreshWithAuthRetry(() => refresh());
  }

  function createHistoryReader(docOverride?: GoogleSpreadsheet): ExerciseLogHistoryReader | null {
    const repository = createRepository(docOverride);
    if (!repository) return null;

    return {
      loadCurrentYearLogs: () => loadExerciseLogs(repository),
      findPastYears: () => findPastYearLogSheets(repository),
      loadYearLogs: (year: number) => loadLogsFromYear(year, repository),
    };
  }

  // Refresh when spreadsheet doc becomes available (handles page refresh race condition)
  watch(
    () => spreadsheetStore.doc,
    async (doc) => {
      if (!doc) {
        exerciseLogs.value = [];
        return;
      }
      await refreshLogs();
    },
  );

  const addExerciseLog: typeof add = (exerciseLog) =>
    retryOnAuthError("exercise-log-add", () => add(exerciseLog), {
      fallbackError: "add-failed",
    });

  const removeExerciseLog: typeof remove = (exerciseLog) =>
    retryOnAuthError("exercise-log-delete", () => remove(exerciseLog), {
      fallbackError: "delete-failed",
    });

  const updateExerciseLog: typeof update = (exerciseLog) =>
    retryOnAuthError("exercise-log-update", () => update(exerciseLog), {
      fallbackError: "update-failed",
    });

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
    refresh: refreshLogs,
    createHistoryReader,
  };
});
