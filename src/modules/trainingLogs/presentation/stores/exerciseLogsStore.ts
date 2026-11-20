import { useDebounceFn, useDocumentVisibility, useOnline } from "@vueuse/core";
import { Mutex } from "async-mutex";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { retryOnAuthError, useAuthStore } from "@/modules/auth/presentation";
import { useSpreadsheetRepositoryFactory } from "@/modules/platform/presentation";
import { exerciseNameKey } from "@/modules/sharedKernel/domain";
import {
  addExerciseLog as addExerciseLog_,
  deleteExerciseLog as deleteExerciseLog_,
  type ExerciseLogHistoryReader,
  type ExerciseLogRepository,
  findPastYearLogSheets,
  loadExerciseLogs,
  loadLogsFromYear,
  updateExerciseLog as updateExerciseLog_,
} from "@/modules/trainingLogs/application";
import {
  applyPendingMutations,
  dequeuePendingMutation,
  type ExerciseLog,
  enqueuePendingMutation,
  isValidExerciseLogInput,
  type PendingLogMutation,
} from "@/modules/trainingLogs/domain";
import {
  createExerciseLogRepository,
  loadPendingLogMutations,
  savePendingLogMutations,
} from "@/modules/trainingLogs/infrastructure";
import { useToast } from "@/shared/presentation/composables/useToast";
import { buildExerciseLogErrorToast } from "../helpers/exerciseLogErrorToast";

type RefreshLogsError = "load-failed" | "parse-data-failed" | "auth-failed" | "refresh-in-progress";
export type ExerciseLogSyncOutcome = "synced" | "queued-offline";
export type ExerciseLogMutationError = "validation-failed" | "not-found" | "auth-failed";

type RemoteMutationError =
  | "add-failed"
  | "update-failed"
  | "delete-failed"
  | "validation-failed"
  | "not-found"
  | "auth-failed";

const MUTATION_META: Record<
  PendingLogMutation["type"],
  {
    fallbackError: "add-failed" | "update-failed" | "delete-failed";
    toastAction: "save" | "delete";
  }
> = {
  add: { fallbackError: "add-failed", toastAction: "save" },
  update: { fallbackError: "update-failed", toastAction: "save" },
  delete: { fallbackError: "delete-failed", toastAction: "delete" },
};

function isPermanentMutationError(
  error: RemoteMutationError,
): error is "validation-failed" | "not-found" {
  return error === "validation-failed" || error === "not-found";
}

function upsertPendingRaw(
  queue: readonly PendingLogMutation[],
  next: PendingLogMutation,
): PendingLogMutation[] {
  const index = queue.findIndex((entry) => entry.log.id === next.log.id);
  if (index === -1) return [...queue, next];
  const updated = [...queue];
  updated[index] = next;
  return updated;
}

function executeRemoteOp(
  mutation: PendingLogMutation,
  repository: ExerciseLogRepository,
): ResultAsync<void, RemoteMutationError> {
  const { fallbackError } = MUTATION_META[mutation.type];
  return retryOnAuthError<void, RemoteMutationError>(
    `exercise-log-${mutation.type}`,
    (): ResultAsync<void, RemoteMutationError> => {
      if (mutation.type === "add") return addExerciseLog_(mutation.log, repository);
      if (mutation.type === "update") return updateExerciseLog_(mutation.log, repository);
      return deleteExerciseLog_(mutation.log, repository);
    },
    { fallbackError },
  );
}

export const useExerciseLogsStore = defineStore("exerciseLogs", () => {
  const { spreadsheetStore, createRepository } = useSpreadsheetRepositoryFactory(
    createExerciseLogRepository,
  );
  const authStore = useAuthStore();
  const isOnline = useOnline();
  const visibility = useDocumentVisibility();
  const { toast } = useToast();
  const flushMutex = new Mutex();

  const initialPending = loadPendingLogMutations();
  const pendingMutations = ref<PendingLogMutation[]>(initialPending);
  const exerciseLogs = ref<ExerciseLog[]>(applyPendingMutations([], initialPending));
  const isLoading = ref(false);
  const isRefreshing = ref(false);
  const isSyncingPending = ref(false);
  const needsSyncAttention = ref(initialPending.length > 0 && !isOnline.value);
  const pendingSyncCount = computed(() => pendingMutations.value.length);
  const showPendingSync = computed(
    () => pendingMutations.value.length > 0 && needsSyncAttention.value,
  );

  let hadAuthenticatedSession = authStore.isLoggedIn || authStore.expiresAt !== null;
  let remoteSyncEpoch = 0;
  let currentlyFlushingMutation: PendingLogMutation | null = null;
  let activeRemoteLoad: {
    doc: GoogleSpreadsheet;
    result: ResultAsync<ExerciseLog[], RefreshLogsError>;
  } | null = null;
  let lastLoadedRemoteLogs: { doc: GoogleSpreadsheet; logs: ExerciseLog[] } | null = null;

  function isSessionExpired(): boolean {
    if (authStore.isLoggedIn || authStore.expiresAt !== null) {
      hadAuthenticatedSession = true;
    }
    return hadAuthenticatedSession && !authStore.isLoggedIn;
  }

  function persistPending(next: PendingLogMutation[]): void {
    pendingMutations.value = next;
    if (next.length === 0) {
      needsSyncAttention.value = false;
    }
    savePendingLogMutations(next).orTee((error) => {
      console.error("Failed to persist pending exercise log mutations:", error);
    });
  }

  function clearPendingMutations(): void {
    pendingMutations.value = [];
    needsSyncAttention.value = false;
    savePendingLogMutations([]).orTee((error) => {
      console.error("Failed to clear pending exercise log mutations:", error);
    });
  }

  function isCurrentPendingEntry(mutation: PendingLogMutation): boolean {
    return pendingMutations.value.find((entry) => entry.log.id === mutation.log.id) === mutation;
  }

  function reconcileFailedInFlightAdd(failedMutation: PendingLogMutation): void {
    if (failedMutation.type !== "add") return;
    const current = pendingMutations.value.find((entry) => entry.log.id === failedMutation.log.id);
    if (!current || current === failedMutation) return;

    if (current.type === "delete") {
      persistPending(dequeuePendingMutation(pendingMutations.value, failedMutation.log.id));
    } else if (current.type === "update") {
      persistPending(upsertPendingRaw(pendingMutations.value, { type: "add", log: current.log }));
    }
  }

  function loadRemoteLogs(staleRetries = 2): ResultAsync<ExerciseLog[], RefreshLogsError> {
    const activeDoc = spreadsheetStore.doc;
    const repository = createRepository();
    if (!repository || !activeDoc) {
      return errAsync("load-failed");
    }

    const startEpoch = remoteSyncEpoch;
    const chainedLoad: ResultAsync<ExerciseLog[], RefreshLogsError> = retryOnAuthError(
      "exercise-log-load",
      () => loadExerciseLogs(repository),
      {
        fallbackError: "load-failed",
      },
    )
      .andThen((remoteLogs) => {
        if (spreadsheetStore.doc !== activeDoc) {
          return okAsync(remoteLogs);
        }
        if (remoteSyncEpoch !== startEpoch && staleRetries > 0) {
          return loadRemoteLogs(staleRetries - 1);
        }
        if (remoteSyncEpoch === startEpoch) {
          lastLoadedRemoteLogs = { doc: activeDoc, logs: remoteLogs };
        }
        exerciseLogs.value = applyPendingMutations(remoteLogs, pendingMutations.value);
        return okAsync(remoteLogs);
      })
      .andTee(() => {
        if (activeRemoteLoad?.result === chainedLoad) {
          activeRemoteLoad = null;
        }
      })
      .mapErr((error) => {
        if (activeRemoteLoad?.result === chainedLoad) {
          activeRemoteLoad = null;
        }
        return error;
      });

    activeRemoteLoad = { doc: activeDoc, result: chainedLoad };
    return chainedLoad;
  }

  function flushMutationEntry(
    mutation: PendingLogMutation,
    repository: ExerciseLogRepository,
  ): ResultAsync<{ needsReconcile: boolean }, "stop-flush"> {
    currentlyFlushingMutation = mutation;
    return executeRemoteOp(mutation, repository)
      .andTee(() => {
        currentlyFlushingMutation = null;
        if (isCurrentPendingEntry(mutation)) {
          persistPending(dequeuePendingMutation(pendingMutations.value, mutation.log.id));
        }
        remoteSyncEpoch += 1;
      })
      .map(() => ({ needsReconcile: false }))
      .orElse((error): ResultAsync<{ needsReconcile: boolean }, "stop-flush"> => {
        currentlyFlushingMutation = null;
        if (error === "auth-failed" && !authStore.isLoggedIn) {
          clearPendingMutations();
          return errAsync("stop-flush");
        }
        if (isPermanentMutationError(error)) {
          if (isCurrentPendingEntry(mutation)) {
            persistPending(dequeuePendingMutation(pendingMutations.value, mutation.log.id));
          }
          toast(buildExerciseLogErrorToast(MUTATION_META[mutation.type].toastAction, error));
          return okAsync({ needsReconcile: true });
        }
        reconcileFailedInFlightAdd(mutation);
        needsSyncAttention.value = true;
        return errAsync("stop-flush");
      });
  }

  function nextSyncTarget(): {
    mutation: PendingLogMutation;
    repository: ExerciseLogRepository;
  } | null {
    if (!isOnline.value) return null;
    const mutation = pendingMutations.value[0];
    const repository = createRepository();
    return mutation && repository ? { mutation, repository } : null;
  }

  async function drainPendingQueue(reconcileOnPermanentError: boolean): Promise<void> {
    let needsReconcile = false;
    let target = nextSyncTarget();

    while (target) {
      const step = await flushMutationEntry(target.mutation, target.repository);
      if (step.isErr()) break;
      needsReconcile = needsReconcile || step.value.needsReconcile;
      target = nextSyncTarget();
    }

    if (needsReconcile && reconcileOnPermanentError && !isRefreshing.value) {
      await loadRemoteLogs();
    }
  }

  function flushPendingMutations(reconcileOnPermanentError = true): ResultAsync<void, never> {
    if (pendingMutations.value.length === 0 || !isOnline.value || !createRepository()) {
      return okAsync(undefined);
    }

    return ResultAsync.fromSafePromise(
      flushMutex.runExclusive(async () => {
        isSyncingPending.value = true;
        try {
          await drainPendingQueue(reconcileOnPermanentError);
        } finally {
          isSyncingPending.value = false;
        }
      }),
    ).map(() => undefined);
  }

  function refreshLogs(): ResultAsync<ExerciseLog[], RefreshLogsError> {
    if (isRefreshing.value) {
      return errAsync("refresh-in-progress");
    }
    if (isSessionExpired()) {
      return errAsync("auth-failed");
    }
    isRefreshing.value = true;

    const flushFirst =
      pendingMutations.value.length > 0 && isOnline.value && createRepository()
        ? flushPendingMutations(false)
        : okAsync(undefined);

    return flushFirst
      .andThen(() => loadRemoteLogs())
      .andTee(() => {
        isLoading.value = false;
        isRefreshing.value = false;
      })
      .orElse((error) => {
        isLoading.value = false;
        isRefreshing.value = false;
        return errAsync(error);
      });
  }

  function computeNextPendingQueue(mutation: PendingLogMutation): PendingLogMutation[] {
    const isFlushingMatchingAdd =
      currentlyFlushingMutation?.log.id === mutation.log.id &&
      currentlyFlushingMutation.type === "add";

    return isFlushingMatchingAdd
      ? upsertPendingRaw(pendingMutations.value, mutation)
      : enqueuePendingMutation(pendingMutations.value, mutation);
  }

  function mutateExerciseLog(
    mutation: PendingLogMutation,
  ): ResultAsync<ExerciseLogSyncOutcome, ExerciseLogMutationError> {
    if (isSessionExpired()) {
      return errAsync("auth-failed");
    }
    if (!isValidExerciseLogInput(mutation.log)) {
      return errAsync("validation-failed");
    }

    lastLoadedRemoteLogs = null;
    const nextPending = computeNextPendingQueue(mutation);
    persistPending(nextPending);
    exerciseLogs.value = applyPendingMutations(exerciseLogs.value, [mutation]);

    if (!isOnline.value || !createRepository()) {
      const stillPending = nextPending.some((entry) => entry.log.id === mutation.log.id);
      needsSyncAttention.value = needsSyncAttention.value || stillPending;
      return okAsync(stillPending ? "queued-offline" : "synced");
    }

    void flushPendingMutations();
    return okAsync("synced");
  }

  function createHistoryReader(
    docOverride?: GoogleSpreadsheet,
    options?: { reuseLoadedCurrentYear?: boolean },
  ): ExerciseLogHistoryReader | null {
    const repository = createRepository(docOverride);
    if (!repository) return null;
    const targetDoc = docOverride ?? spreadsheetStore.doc;

    return {
      loadCurrentYearLogs: () => {
        if (options?.reuseLoadedCurrentYear && targetDoc) {
          if (lastLoadedRemoteLogs?.doc === targetDoc) {
            return okAsync(lastLoadedRemoteLogs.logs);
          }
          if (activeRemoteLoad?.doc === targetDoc) {
            return activeRemoteLoad.result.mapErr((error) =>
              error === "refresh-in-progress" ? ("load-failed" as const) : error,
            );
          }
        }
        return loadExerciseLogs(repository);
      },
      findPastYears: () => findPastYearLogSheets(repository),
      loadYearLogs: (year: number) => loadLogsFromYear(year, repository),
    };
  }

  const debouncedVisibleRefresh = useDebounceFn(() => {
    if (isOnline.value && spreadsheetStore.doc) {
      void refreshLogs();
    }
  }, 1000);

  watch(visibility, (current) => {
    if (current === "visible") {
      debouncedVisibleRefresh();
    }
  });

  watch(
    () => spreadsheetStore.doc,
    (doc) => {
      if (lastLoadedRemoteLogs?.doc !== doc) {
        lastLoadedRemoteLogs = null;
      }
      if (activeRemoteLoad?.doc !== doc) {
        activeRemoteLoad = null;
      }
      if (!doc) {
        exerciseLogs.value = applyPendingMutations([], pendingMutations.value);
        isLoading.value = false;
        return;
      }
      if (isOnline.value) {
        if (exerciseLogs.value.length === 0) {
          isLoading.value = true;
        }
        void refreshLogs();
      }
    },
  );

  watch(isOnline, (online) => {
    if (!online && pendingMutations.value.length > 0) {
      needsSyncAttention.value = true;
      return;
    }
    if (online && pendingMutations.value.length > 0 && createRepository()) {
      void refreshLogs();
    }
  });

  watch(
    () => authStore.accessToken,
    (token) => {
      if (token && isOnline.value && pendingMutations.value.length > 0 && createRepository()) {
        void refreshLogs();
      }
    },
  );

  watch(
    () => authStore.isLoggedIn,
    (loggedIn, previousLoggedIn) => {
      if (loggedIn) {
        hadAuthenticatedSession = true;
        return;
      }
      if (previousLoggedIn) {
        clearPendingMutations();
        exerciseLogs.value = [];
      }
    },
    { flush: "sync", immediate: true },
  );

  if (spreadsheetStore.doc && isOnline.value) {
    isLoading.value = true;
    void refreshLogs();
  }

  function addExerciseLog(
    exerciseLog: ExerciseLog,
  ): ResultAsync<ExerciseLogSyncOutcome, ExerciseLogMutationError> {
    return mutateExerciseLog({ type: "add", log: exerciseLog });
  }

  function removeExerciseLog(
    exerciseLog: ExerciseLog,
  ): ResultAsync<ExerciseLogSyncOutcome, ExerciseLogMutationError> {
    return mutateExerciseLog({ type: "delete", log: exerciseLog });
  }

  function updateExerciseLog(
    exerciseLog: ExerciseLog,
  ): ResultAsync<ExerciseLogSyncOutcome, ExerciseLogMutationError> {
    return mutateExerciseLog({ type: "update", log: exerciseLog });
  }

  function lastLogForExercise(exerciseName: string): ExerciseLog | undefined {
    const key = exerciseNameKey(exerciseName);
    return exerciseLogs.value
      .filter((log) => exerciseNameKey(log.exerciseName) === key)
      .sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime())?.[0];
  }

  return {
    exerciseLogs,
    isLoading,
    isRefreshing,
    isOnline,
    isSyncingPending,
    pendingSyncCount,
    showPendingSync,
    addExerciseLog,
    removeExerciseLog,
    updateExerciseLog,
    clearPendingMutations,
    lastLogForExercise,
    refresh: refreshLogs,
    createHistoryReader,
  };
});
