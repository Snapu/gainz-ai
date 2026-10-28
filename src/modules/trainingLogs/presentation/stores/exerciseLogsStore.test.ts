import { okAsync } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";

const mockDoc = ref<unknown>(null);
const refreshMock = vi.fn(() => okAsync([]));
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
    add: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
    refresh: refreshMock,
  }),
}));

vi.mock("@/shared/presentation/composables/useAuthErrorHandler", () => ({
  useAuthErrorHandler: () => ({
    handleAuthError: vi.fn(),
  }),
}));

import { useExerciseLogsStore } from "./exerciseLogsStore";

describe("useExerciseLogsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockDoc.value = null;
    mockItems.value = [];
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
});
