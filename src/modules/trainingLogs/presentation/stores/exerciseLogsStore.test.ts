import { err, errAsync, ok, okAsync, type Result, ResultAsync } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import { PENDING_LOGS_STORAGE_KEY } from "@/modules/trainingLogs/infrastructure";

const mockDoc = ref<unknown>(null);
const mockIsOnline = ref(true);
const mockIsLoggedIn = ref(true);
const mockAccessToken = ref<string | null>("access-token-1");
const mockExpiresAt = ref<number | null>(Date.now() + 3600_000);
const handleAuthErrorMock = vi.fn(async () => false);
const toastMock = vi.fn();

const repoMocks = {
  loadCurrentYear: vi.fn(),
  addLog: vi.fn(),
  updateLog: vi.fn(),
  deleteLog: vi.fn(),
  findPastYearSheets: vi.fn(() => []),
  loadYear: vi.fn(),
};

vi.mock("@vueuse/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vueuse/core")>();
  return {
    ...actual,
    useOnline: () => mockIsOnline,
    useDocumentVisibility: () => ref("visible"),
  };
});

vi.mock("@/modules/platform/presentation", () => ({
  useSpreadsheetRepositoryFactory: () => ({
    spreadsheetStore: {
      get doc() {
        return mockDoc.value;
      },
    },
    createRepository: () => (mockDoc.value ? repoMocks : null),
  }),
}));

vi.mock("@/modules/auth/presentation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/auth/presentation")>();
  return {
    ...actual,
    useAuthStore: () => ({
      get isLoggedIn() {
        return mockIsLoggedIn.value;
      },
      get accessToken() {
        return mockAccessToken.value;
      },
      get expiresAt() {
        return mockExpiresAt.value;
      },
      logout: vi.fn(() => {
        mockIsLoggedIn.value = false;
        mockAccessToken.value = null;
        mockExpiresAt.value = null;
      }),
    }),
  };
});

vi.mock("@/modules/auth/presentation/composables/useAuthErrorHandler", () => ({
  useAuthErrorHandler: () => ({
    handleAuthError: handleAuthErrorMock,
  }),
}));

vi.mock("@/shared/presentation/composables/useToast", () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

import { useExerciseLogsStore } from "./exerciseLogsStore";

const makeLog = (id: string, weight = 80, reps = 8): ExerciseLog => ({
  id,
  exerciseName: "Bench Press",
  weight,
  reps,
  loggedAt: new Date("2026-11-16T12:00:00Z"),
});

describe("useExerciseLogsStore", () => {
  const createdPinias: Array<ReturnType<typeof createPinia>> = [];

  function makePinia() {
    const pinia = createPinia();
    createdPinias.push(pinia);
    setActivePinia(pinia);
    return pinia;
  }

  beforeEach(() => {
    localStorage.clear();
    mockDoc.value = { id: "doc-1" };
    mockIsOnline.value = true;
    mockIsLoggedIn.value = true;
    mockAccessToken.value = "access-token-1";
    mockExpiresAt.value = Date.now() + 3600_000;
    makePinia();
    vi.clearAllMocks();
    handleAuthErrorMock.mockResolvedValue(false);
    repoMocks.loadCurrentYear.mockImplementation(() => okAsync([]));
    repoMocks.addLog.mockImplementation(() => okAsync(undefined));
    repoMocks.updateLog.mockImplementation(() => okAsync(undefined));
    repoMocks.deleteLog.mockImplementation(() => okAsync(undefined));
  });

  afterEach(() => {
    while (createdPinias.length > 0) {
      const pinia = createdPinias.pop() as unknown as { _e?: { stop: () => void } };
      pinia._e?.stop();
    }
  });

  it("clears exerciseLogs when spreadsheet doc becomes null and refreshes when new doc arrives", async () => {
    const remoteLog = makeLog("11111111-1111-4111-8111-111111111111");
    repoMocks.loadCurrentYear.mockImplementation(() => okAsync([remoteLog]));

    const store = useExerciseLogsStore();
    await vi.waitFor(() => {
      expect(store.exerciseLogs).toEqual([remoteLog]);
    });

    mockDoc.value = null;
    await nextTick();
    expect(store.exerciseLogs).toEqual([]);

    const nextRemoteLog = makeLog("22222222-2222-4222-8222-222222222222", 100, 5);
    repoMocks.loadCurrentYear.mockImplementation(() => okAsync([nextRemoteLog]));
    mockDoc.value = { id: "doc-2" };
    await nextTick();
    await vi.waitFor(() => {
      expect(store.exerciseLogs).toEqual([nextRemoteLog]);
    });
  });

  it("retries background flush once after handleAuthError recovers from a 401 without flashing pending badge", async () => {
    const log = makeLog("11111111-1111-4111-8111-111111111111");
    repoMocks.addLog
      .mockImplementationOnce(() => errAsync("auth-failed"))
      .mockImplementationOnce(() => okAsync(undefined));
    handleAuthErrorMock.mockResolvedValueOnce(true);

    const store = useExerciseLogsStore();
    const result = await store.addExerciseLog(log);

    expect(result).toEqual(ok("synced"));
    expect(store.showPendingSync).toBe(false);

    await vi.waitFor(() => {
      expect(repoMocks.addLog).toHaveBeenCalledTimes(2);
    });
    expect(handleAuthErrorMock).toHaveBeenCalledWith("exercise-log-add");
    expect(store.pendingSyncCount).toBe(0);
    expect(store.showPendingSync).toBe(false);
  });

  it("retries exported refresh once after handleAuthError recovers from a 401", async () => {
    const store = useExerciseLogsStore();
    await vi.waitFor(() => {
      expect(store.isLoading).toBe(false);
    });
    repoMocks.loadCurrentYear.mockClear();

    repoMocks.loadCurrentYear
      .mockImplementationOnce(() => errAsync("auth-failed"))
      .mockImplementationOnce(() => okAsync([]));
    handleAuthErrorMock.mockResolvedValueOnce(true);

    const result = await store.refresh();

    expect(result.isOk()).toBe(true);
    expect(handleAuthErrorMock).toHaveBeenCalledWith("exercise-log-load");
    expect(repoMocks.loadCurrentYear).toHaveBeenCalledTimes(2);
  });

  it("queues set durably in localStorage when offline and preserves it across reloads", async () => {
    mockIsOnline.value = false;
    mockDoc.value = null;

    const store = useExerciseLogsStore();
    const offlineLog = makeLog("11111111-1111-4111-8111-111111111111");

    const result = await store.addExerciseLog(offlineLog);

    expect(result).toEqual(ok("queued-offline"));
    expect(store.exerciseLogs).toEqual([offlineLog]);
    expect(store.pendingSyncCount).toBe(1);
    expect(store.showPendingSync).toBe(true);
    expect(localStorage.getItem(PENDING_LOGS_STORAGE_KEY)).toContain(offlineLog.id);

    makePinia();
    const reloadedStore = useExerciseLogsStore();
    await nextTick();

    expect(reloadedStore.pendingSyncCount).toBe(1);
    expect(reloadedStore.showPendingSync).toBe(true);
    expect(reloadedStore.exerciseLogs).toHaveLength(1);
    expect(reloadedStore.exerciseLogs[0]?.id).toBe(offlineLog.id);
  });

  it("retains queued sets and shows pending badge when background flush fails transiently or offline 401", async () => {
    repoMocks.addLog
      .mockImplementationOnce(() => errAsync("add-failed"))
      .mockImplementationOnce(() => errAsync("auth-failed"));
    handleAuthErrorMock.mockResolvedValueOnce(false);

    const store = useExerciseLogsStore();
    const log1 = makeLog("11111111-1111-4111-8111-111111111111");
    const log2 = makeLog("22222222-2222-4222-8222-222222222222");

    expect(await store.addExerciseLog(log1)).toEqual(ok("synced"));
    await vi.waitFor(() => {
      expect(store.showPendingSync).toBe(true);
    });

    expect(await store.addExerciseLog(log2)).toEqual(ok("synced"));
    expect(store.exerciseLogs.map((l) => l.id)).toEqual([log1.id, log2.id]);
    expect(store.pendingSyncCount).toBe(2);
    expect(store.showPendingSync).toBe(true);
  });

  it("rejects invalid input synchronously and reconciles remote validation failures asynchronously with a toast", async () => {
    const store = useExerciseLogsStore();
    await vi.waitFor(() => {
      expect(store.isLoading).toBe(false);
    });

    const invalidLocalLog = {
      ...makeLog("11111111-1111-4111-8111-111111111111"),
      exerciseName: "   ",
    };
    expect(await store.addExerciseLog(invalidLocalLog)).toEqual(err("validation-failed"));
    expect(store.exerciseLogs).toEqual([]);
    expect(store.pendingSyncCount).toBe(0);

    repoMocks.addLog.mockImplementationOnce(() => errAsync("validation-failed"));
    const rejectedRemoteLog = makeLog("22222222-2222-4222-8222-222222222222");
    expect(await store.addExerciseLog(rejectedRemoteLog)).toEqual(ok("synced"));

    await vi.waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Could Not Save Set",
          variant: "destructive",
        }),
      );
    });
    await vi.waitFor(() => {
      expect(store.exerciseLogs).toEqual([]);
    });
    expect(store.pendingSyncCount).toBe(0);
    expect(localStorage.getItem(PENDING_LOGS_STORAGE_KEY)).toBeNull();
  });

  it("coalesces offline edits and deletes on pending adds before flushing", async () => {
    mockIsOnline.value = false;
    const store = useExerciseLogsStore();
    const log1 = makeLog("11111111-1111-4111-8111-111111111111", 80, 8);
    const log2 = makeLog("22222222-2222-4222-8222-222222222222", 60, 10);

    await store.addExerciseLog(log1);
    expect(await store.addExerciseLog(log2)).toEqual(ok("queued-offline"));

    const log1Edited = makeLog(log1.id, 85, 8);
    await store.updateExerciseLog(log1Edited);
    expect(await store.removeExerciseLog(log2)).toEqual(ok("synced"));

    expect(store.pendingSyncCount).toBe(1);

    repoMocks.loadCurrentYear.mockImplementation(() => okAsync([log1Edited]));
    mockIsOnline.value = true;
    await nextTick();
    await vi.waitFor(() => {
      expect(store.pendingSyncCount).toBe(0);
    });

    expect(repoMocks.addLog).toHaveBeenCalledTimes(1);
    expect(repoMocks.addLog).toHaveBeenCalledWith(log1Edited);
    expect(repoMocks.deleteLog).not.toHaveBeenCalled();
    expect(store.exerciseLogs).toEqual([log1Edited]);
  });

  it("clears exerciseLogs without restoring after unrecoverable auth failure during flush", async () => {
    const syncedA = makeLog("11111111-1111-4111-8111-111111111111", 100, 5);
    repoMocks.loadCurrentYear.mockImplementation(() => okAsync([syncedA]));

    const store = useExerciseLogsStore();
    await vi.waitFor(() => {
      expect(store.exerciseLogs).toEqual([syncedA]);
    });

    repoMocks.updateLog.mockImplementationOnce(() => errAsync("auth-failed"));
    handleAuthErrorMock.mockImplementationOnce(async () => {
      mockIsLoggedIn.value = false;
      mockAccessToken.value = null;
      mockExpiresAt.value = null;
      return false;
    });

    expect(await store.updateExerciseLog(makeLog(syncedA.id, 110, 5))).toEqual(ok("synced"));

    await vi.waitFor(() => {
      expect(handleAuthErrorMock).toHaveBeenCalledWith("exercise-log-update");
    });
    expect(store.exerciseLogs).toEqual([]);
    expect(store.pendingSyncCount).toBe(0);
  });

  it("rejects mutations with auth-failed instead of queueing when session is already expired", async () => {
    mockIsLoggedIn.value = false;
    mockAccessToken.value = null;
    mockExpiresAt.value = Date.now() - 60_000;
    mockIsOnline.value = false;

    const store = useExerciseLogsStore();
    const log = makeLog("11111111-1111-4111-8111-111111111111");

    expect(await store.addExerciseLog(log)).toEqual(err("auth-failed"));
    expect(store.pendingSyncCount).toBe(0);
    expect(store.exerciseLogs).toEqual([]);
  });

  it("preserves remote logs and surfaces toast when queued updates fail with validation-failed or not-found", async () => {
    const syncedA = makeLog("11111111-1111-4111-8111-111111111111", 100, 5);
    const syncedB = makeLog("22222222-2222-4222-8222-222222222222", 60, 10);
    repoMocks.loadCurrentYear.mockImplementation(() => okAsync([syncedA, syncedB]));

    const store = useExerciseLogsStore();
    await vi.waitFor(() => {
      expect(store.exerciseLogs).toHaveLength(2);
    });

    mockIsOnline.value = false;
    await store.updateExerciseLog(makeLog(syncedA.id, 110, 5));
    await store.updateExerciseLog(makeLog(syncedB.id, 65, 10));
    expect(store.pendingSyncCount).toBe(2);

    repoMocks.updateLog
      .mockImplementationOnce(() => errAsync("validation-failed"))
      .mockImplementationOnce(() => errAsync("not-found"));
    repoMocks.loadCurrentYear.mockImplementation(() => okAsync([syncedA]));

    mockIsOnline.value = true;
    await nextTick();
    await vi.waitFor(() => {
      expect(store.pendingSyncCount).toBe(0);
    });
    await vi.waitFor(() => {
      expect(store.exerciseLogs).toEqual([syncedA]);
    });

    expect(toastMock).toHaveBeenCalledTimes(2);
    expect(toastMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "Could Not Save Set",
        description: "This set no longer exists in Google Sheets.",
      }),
    );
  });

  it("deletes remotely if removeExerciseLog runs while that add is actively flushing", async () => {
    mockIsOnline.value = false;
    const store = useExerciseLogsStore();
    const log = makeLog("11111111-1111-4111-8111-111111111111", 80, 8);
    await store.addExerciseLog(log);

    let resolveRemoteAdd!: () => void;
    repoMocks.addLog.mockImplementationOnce(() =>
      ResultAsync.fromSafePromise(
        new Promise<void>((resolve) => {
          resolveRemoteAdd = resolve;
        }),
      ),
    );

    mockIsOnline.value = true;
    await nextTick();

    await vi.waitFor(() => {
      expect(repoMocks.addLog).toHaveBeenCalledOnce();
    });

    expect(await store.removeExerciseLog(log)).toEqual(ok("synced"));
    expect(store.exerciseLogs).toEqual([]);

    resolveRemoteAdd();

    await vi.waitFor(() => {
      expect(repoMocks.deleteLog).toHaveBeenCalledWith(log);
    });
    await vi.waitFor(() => {
      expect(store.pendingSyncCount).toBe(0);
    });
    expect(store.exerciseLogs).toEqual([]);
  });

  it("cancels pending delete cleanly if an actively flushing add fails transiently", async () => {
    mockIsOnline.value = false;
    const store = useExerciseLogsStore();
    const log = makeLog("11111111-1111-4111-8111-111111111111", 80, 8);
    await store.addExerciseLog(log);

    let rejectRemoteAdd!: () => void;
    repoMocks.addLog.mockImplementationOnce(
      () =>
        new ResultAsync(
          new Promise<Result<void, "add-failed">>((resolve) => {
            rejectRemoteAdd = () => resolve(err("add-failed"));
          }),
        ),
    );

    mockIsOnline.value = true;
    await nextTick();
    await vi.waitFor(() => {
      expect(repoMocks.addLog).toHaveBeenCalledOnce();
    });

    await store.removeExerciseLog(log);
    rejectRemoteAdd();

    await vi.waitFor(() => {
      expect(store.pendingSyncCount).toBe(0);
    });
    expect(repoMocks.deleteLog).not.toHaveBeenCalled();
  });

  it("rejects mutations with auth-failed after logout clears expiresAt", async () => {
    const store = useExerciseLogsStore();
    await vi.waitFor(() => {
      expect(store.isLoading).toBe(false);
    });

    mockIsLoggedIn.value = false;
    mockAccessToken.value = null;
    mockExpiresAt.value = null;
    mockDoc.value = null;
    await nextTick();

    const log = makeLog("11111111-1111-4111-8111-111111111111");
    expect(await store.addExerciseLog(log)).toEqual(err("auth-failed"));
    expect(store.pendingSyncCount).toBe(0);
    expect(store.exerciseLogs).toEqual([]);
  });

  it("preserves initial remote history when a set is queued while initial load is in flight", async () => {
    const historyLog = makeLog("11111111-1111-4111-8111-111111111111", 100, 5);
    const offlineNewLog = makeLog("22222222-2222-4222-8222-222222222222", 80, 8);

    let resolveInitialLoad!: (logs: ExerciseLog[]) => void;
    repoMocks.loadCurrentYear.mockImplementationOnce(() =>
      ResultAsync.fromSafePromise(
        new Promise<ExerciseLog[]>((resolve) => {
          resolveInitialLoad = resolve;
        }),
      ),
    );

    const store = useExerciseLogsStore();
    await vi.waitFor(() => {
      expect(repoMocks.loadCurrentYear).toHaveBeenCalledOnce();
    });

    mockIsOnline.value = false;
    await store.addExerciseLog(offlineNewLog);
    expect(store.exerciseLogs).toEqual([offlineNewLog]);

    resolveInitialLoad([historyLog]);
    await vi.waitFor(() => {
      expect(store.isLoading).toBe(false);
    });

    expect(store.exerciseLogs).toEqual([historyLog, offlineNewLog]);
    expect(store.pendingSyncCount).toBe(1);
  });

  it("re-fetches remote history if a concurrent online add commits before initial load finishes", async () => {
    const historyLog = makeLog("11111111-1111-4111-8111-111111111111", 100, 5);
    const committedNewLog = makeLog("22222222-2222-4222-8222-222222222222", 80, 8);

    let resolveInitialLoad!: (logs: ExerciseLog[]) => void;
    repoMocks.loadCurrentYear
      .mockImplementationOnce(() =>
        ResultAsync.fromSafePromise(
          new Promise<ExerciseLog[]>((resolve) => {
            resolveInitialLoad = resolve;
          }),
        ),
      )
      .mockImplementationOnce(() => okAsync([historyLog, committedNewLog]));

    const store = useExerciseLogsStore();
    await vi.waitFor(() => {
      expect(repoMocks.loadCurrentYear).toHaveBeenCalledTimes(1);
    });

    await store.addExerciseLog(committedNewLog);
    await vi.waitFor(() => {
      expect(store.pendingSyncCount).toBe(0);
    });

    resolveInitialLoad([historyLog]);
    await vi.waitFor(() => {
      expect(store.isLoading).toBe(false);
    });

    expect(repoMocks.loadCurrentYear).toHaveBeenCalledTimes(2);
    expect(store.exerciseLogs).toEqual([historyLog, committedNewLog]);
  });

  it("does not cache stale remote logs in lastLoadedRemoteLogs when stale retries exhaust during concurrent mutations", async () => {
    const historyLog = makeLog("11111111-1111-4111-8111-111111111111", 100, 5);
    const newLog1 = makeLog("22222222-2222-4222-8222-222222222222", 80, 8);
    const newLog2 = makeLog("33333333-3333-4333-8333-333333333333", 90, 6);
    const newLog3 = makeLog("44444444-4444-4444-8444-444444444444", 70, 10);

    let resolveLoad1!: (logs: ExerciseLog[]) => void;
    let resolveLoad2!: (logs: ExerciseLog[]) => void;
    let resolveLoad3!: (logs: ExerciseLog[]) => void;

    repoMocks.loadCurrentYear
      .mockImplementationOnce(() =>
        ResultAsync.fromSafePromise(
          new Promise<ExerciseLog[]>((resolve) => {
            resolveLoad1 = resolve;
          }),
        ),
      )
      .mockImplementationOnce(() =>
        ResultAsync.fromSafePromise(
          new Promise<ExerciseLog[]>((resolve) => {
            resolveLoad2 = resolve;
          }),
        ),
      )
      .mockImplementationOnce(() =>
        ResultAsync.fromSafePromise(
          new Promise<ExerciseLog[]>((resolve) => {
            resolveLoad3 = resolve;
          }),
        ),
      );

    const store = useExerciseLogsStore();
    await vi.waitFor(() => {
      expect(repoMocks.loadCurrentYear).toHaveBeenCalledTimes(1);
    });

    // Mutate 1 while initial load is in flight (startEpoch = 0, current = 1)
    await store.addExerciseLog(newLog1);
    // Resolve load 1 -> triggers retry 1 (staleRetries = 1, startEpoch = 1)
    resolveLoad1([historyLog]);

    await vi.waitFor(() => {
      expect(repoMocks.loadCurrentYear).toHaveBeenCalledTimes(2);
    });

    // Mutate 2 while retry 1 is in flight (startEpoch = 1, current = 2)
    await store.addExerciseLog(newLog2);
    // Resolve load 2 -> triggers retry 2 (staleRetries = 0, startEpoch = 2)
    resolveLoad2([historyLog, newLog1]);

    await vi.waitFor(() => {
      expect(repoMocks.loadCurrentYear).toHaveBeenCalledTimes(3);
    });

    // Mutate 3 while retry 2 is in flight (startEpoch = 2, current = 3)
    await store.addExerciseLog(newLog3);
    // Resolve load 3 -> staleRetries is now 0 and remoteSyncEpoch (3) !== startEpoch (2).
    resolveLoad3([historyLog, newLog1, newLog2]);

    await vi.waitFor(() => {
      expect(store.isLoading).toBe(false);
    });

    // Since retries were exhausted and epoch mismatched, lastLoadedRemoteLogs should NOT be cached.
    // Therefore, createHistoryReader with reuseLoadedCurrentYear must trigger a new fetch rather than returning stale cached logs.
    const freshLog = makeLog("55555555-5555-4555-8555-555555555555", 60, 12);
    repoMocks.loadCurrentYear.mockReturnValueOnce(okAsync([freshLog]));

    const reusableReader = store.createHistoryReader(mockDoc.value as never, {
      reuseLoadedCurrentYear: true,
    });
    const result = await reusableReader!.loadCurrentYearLogs();
    expect(result).toEqual(ok([freshLog]));
    expect(repoMocks.loadCurrentYear).toHaveBeenCalledTimes(4);
  });

  it("shares in-flight and cached current-year loads with createHistoryReader when reuse is enabled", async () => {
    const remoteLog = makeLog("11111111-1111-4111-8111-111111111111", 100, 5);
    let resolveLoad!: (logs: ExerciseLog[]) => void;
    repoMocks.loadCurrentYear.mockImplementationOnce(() =>
      ResultAsync.fromSafePromise(
        new Promise<ExerciseLog[]>((resolve) => {
          resolveLoad = resolve;
        }),
      ),
    );

    const store = useExerciseLogsStore();
    await vi.waitFor(() => {
      expect(repoMocks.loadCurrentYear).toHaveBeenCalledTimes(1);
    });

    const reusableReader = store.createHistoryReader(mockDoc.value as never, {
      reuseLoadedCurrentYear: true,
    });
    const readerPromise = reusableReader!.loadCurrentYearLogs();

    resolveLoad([remoteLog]);
    const [readerResult] = await Promise.all([readerPromise]);

    expect(readerResult).toEqual(ok([remoteLog]));
    expect(repoMocks.loadCurrentYear).toHaveBeenCalledTimes(1);

    // Subsequent reusable call uses cached remote logs without another Sheets read.
    expect(await reusableReader!.loadCurrentYearLogs()).toEqual(ok([remoteLog]));
    expect(repoMocks.loadCurrentYear).toHaveBeenCalledTimes(1);

    // Non-reusable reader (e.g. rebuildAllSummaries) fetches fresh logs.
    repoMocks.loadCurrentYear.mockReturnValueOnce(okAsync([remoteLog]));
    const freshReader = store.createHistoryReader(mockDoc.value as never);
    expect(await freshReader!.loadCurrentYearLogs()).toEqual(ok([remoteLog]));
    expect(repoMocks.loadCurrentYear).toHaveBeenCalledTimes(2);
  });

  it("matches lastLogForExercise case-insensitively and whitespace-normalized", async () => {
    const benchLog = {
      ...makeLog("11111111-1111-4111-8111-111111111111", 100, 5),
      exerciseName: "Bench  Press",
    };
    repoMocks.loadCurrentYear.mockReturnValueOnce(okAsync([benchLog]));

    const store = useExerciseLogsStore();
    await vi.waitFor(() => {
      expect(store.exerciseLogs).toHaveLength(1);
    });

    expect(store.lastLogForExercise("bench press")?.id).toBe(benchLog.id);
  });
});
