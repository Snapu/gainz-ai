import { errAsync, okAsync } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";

const mockDoc = ref<unknown>(null);
const refreshMock = vi.fn(() => okAsync([]));
const addMock = vi.fn();
const handleAuthErrorMock = vi.fn(async () => false);
const mockItems = ref<ExerciseLog[]>([]);

vi.mock("@/modules/platform/presentation", () => ({
  useSpreadsheetRepositoryFactory: () => ({
    spreadsheetStore: {
      get doc() {
        return mockDoc.value;
      },
    },
    createRepository: () => ({}),
  }),
  useOfflineSyncedStore: () => ({
    items: mockItems,
    isLoading: ref(false),
    isRefreshing: ref(false),
    add: addMock,
    remove: vi.fn(),
    update: vi.fn(),
    refresh: refreshMock,
  }),
}));

vi.mock("@/modules/auth/presentation/composables/useAuthErrorHandler", () => ({
  useAuthErrorHandler: () => ({
    handleAuthError: handleAuthErrorMock,
  }),
}));

import { useExerciseLogsStore } from "./exerciseLogsStore";

describe("useExerciseLogsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockDoc.value = null;
    mockItems.value = [];
    handleAuthErrorMock.mockResolvedValue(false);
  });

  it("clears exerciseLogs when spreadsheet doc becomes null (logout) and refreshes when new doc arrives", async () => {
    mockDoc.value = { id: "doc-1" };
    const store = useExerciseLogsStore();
    mockItems.value = [
      { id: "1", exerciseName: "Squat", loggedAt: new Date("2026-10-20T10:00:00Z") },
    ];

    // User logs out -> doc becomes null
    mockDoc.value = null;
    await nextTick();
    expect(store.exerciseLogs).toEqual([]);

    // User logs in -> new doc arrives even if optimistic item existed
    mockItems.value = [
      { id: "2", exerciseName: "Bench", loggedAt: new Date("2026-10-21T10:00:00Z") },
    ];
    mockDoc.value = { id: "doc-2" };
    await nextTick();
    expect(refreshMock).toHaveBeenCalledOnce();
  });

  it("retries addExerciseLog once after handleAuthError recovers from a 401", async () => {
    const log: ExerciseLog = {
      id: "log-retry",
      exerciseName: "Bench Press",
      weight: 80,
      reps: 8,
      loggedAt: new Date("2026-11-13T12:00:00Z"),
    };
    addMock.mockReturnValueOnce(errAsync("auth-failed")).mockReturnValueOnce(okAsync(undefined));
    handleAuthErrorMock.mockResolvedValueOnce(true);

    const store = useExerciseLogsStore();
    const result = await store.addExerciseLog(log);

    expect(result.isOk()).toBe(true);
    expect(handleAuthErrorMock).toHaveBeenCalledWith("exercise-log-add");
    expect(addMock).toHaveBeenCalledTimes(2);
  });

  it("retries exported refresh once after handleAuthError recovers from a 401", async () => {
    refreshMock
      .mockReturnValueOnce(errAsync("auth-failed") as unknown as ReturnType<typeof refreshMock>)
      .mockReturnValueOnce(okAsync([]));
    handleAuthErrorMock.mockResolvedValueOnce(true);

    const store = useExerciseLogsStore();
    const result = await store.refresh();

    expect(result.isOk()).toBe(true);
    expect(handleAuthErrorMock).toHaveBeenCalledWith("exercise-log-load");
    expect(refreshMock).toHaveBeenCalledTimes(2);
  });
});
