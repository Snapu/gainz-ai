import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, reactive } from "vue";
import { clearDerivedSheetCaches, useSheetCacheSync } from "./useSheetCacheSync";

const CACHE_OWNER_KEY = "gainz:cacheSpreadsheetId";

const clearPlanMock = vi.fn();
const clearCompletedSessionsMock = vi.fn();
const resetAllSessionsMock = vi.fn();
const clearPendingRequestMock = vi.fn();
const clearEventsMock = vi.fn();
const clearMapMock = vi.fn();
const clearPendingLogsMock = vi.fn();
const userProfileState = reactive({
  hasCompletedSetup: true,
});

const spreadsheetState = reactive<{
  doc: { spreadsheetId: string } | null;
  createdSpreadsheetId: string | null;
}>({
  doc: null,
  createdSpreadsheetId: null,
});

vi.mock("@/modules/platform/presentation", () => ({
  useSpreadsheetStore: () => spreadsheetState,
  useExerciseMuscleMapStore: () => ({
    clearMap: clearMapMock,
  }),
}));

vi.mock("@/modules/aiCoach/presentation", () => ({
  useTrainingPlanStore: () => ({
    clearPlan: clearPlanMock,
    clearCompletedSessions: clearCompletedSessionsMock,
  }),
  useCoachChatStore: () => ({
    resetAllSessions: resetAllSessionsMock,
  }),
  useAiOrchestratorStore: () => ({
    clearPendingRequest: clearPendingRequestMock,
  }),
}));

vi.mock("@/modules/events/presentation", () => ({
  useEventsStore: () => ({
    clearEvents: clearEventsMock,
  }),
}));

vi.mock("@/modules/profile/presentation", () => ({
  useUserProfileStore: () => userProfileState,
}));

vi.mock("@/modules/trainingLogs/presentation", () => ({
  useExerciseLogsStore: () => ({
    clearPendingMutations: clearPendingLogsMock,
  }),
}));

describe("useSheetCacheSync", () => {
  let scope = effectScope();

  function startSync() {
    scope.run(() => {
      useSheetCacheSync();
    });
  }

  beforeEach(() => {
    localStorage.clear();
    scope = effectScope();
    vi.clearAllMocks();
    spreadsheetState.doc = null;
    spreadsheetState.createdSpreadsheetId = null;
    userProfileState.hasCompletedSetup = true;
  });

  afterEach(() => {
    scope.stop();
  });

  it("adopts existing unowned caches on initial load and retains them across reloads of the same sheet", () => {
    startSync();
    spreadsheetState.doc = { spreadsheetId: "sheet-a" };

    expect(localStorage.getItem(CACHE_OWNER_KEY)).toBe("sheet-a");
    expect(clearPlanMock).not.toHaveBeenCalled();
    expect(userProfileState.hasCompletedSetup).toBe(true);

    spreadsheetState.doc = null;
    spreadsheetState.doc = { spreadsheetId: "sheet-a" };

    expect(clearPlanMock).not.toHaveBeenCalled();
    expect(resetAllSessionsMock).not.toHaveBeenCalled();
    expect(userProfileState.hasCompletedSetup).toBe(true);
  });

  it("clears all derived caches and resets hasCompletedSetup when a different sheet loads after logout or 404", () => {
    localStorage.setItem(CACHE_OWNER_KEY, "sheet-account-a");
    userProfileState.hasCompletedSetup = true;
    startSync();

    spreadsheetState.doc = { spreadsheetId: "sheet-account-b" };

    expect(clearPlanMock).toHaveBeenCalledTimes(1);
    expect(clearCompletedSessionsMock).toHaveBeenCalledTimes(1);
    expect(resetAllSessionsMock).toHaveBeenCalledTimes(1);
    expect(clearPendingRequestMock).toHaveBeenCalledTimes(1);
    expect(clearEventsMock).toHaveBeenCalledTimes(1);
    expect(clearMapMock).toHaveBeenCalledTimes(1);
    expect(clearPendingLogsMock).toHaveBeenCalledTimes(1);
    expect(userProfileState.hasCompletedSetup).toBe(false);
    expect(localStorage.getItem(CACHE_OWNER_KEY)).toBe("sheet-account-b");
  });

  it("preserves unowned local caches when an existing user links their sheet from the choice prompt", () => {
    userProfileState.hasCompletedSetup = true;
    startSync();

    expect(localStorage.getItem(CACHE_OWNER_KEY)).toBeNull();

    spreadsheetState.doc = { spreadsheetId: "linked-existing-sheet" };

    expect(clearPlanMock).not.toHaveBeenCalled();
    expect(clearCompletedSessionsMock).not.toHaveBeenCalled();
    expect(resetAllSessionsMock).not.toHaveBeenCalled();
    expect(clearEventsMock).not.toHaveBeenCalled();
    expect(clearMapMock).not.toHaveBeenCalled();
    expect(userProfileState.hasCompletedSetup).toBe(true);
    expect(localStorage.getItem(CACHE_OWNER_KEY)).toBe("linked-existing-sheet");
  });

  it("clears unowned local caches when a brand-new sheet is created", () => {
    userProfileState.hasCompletedSetup = true;
    startSync();

    spreadsheetState.createdSpreadsheetId = "created-sheet-1";
    spreadsheetState.doc = { spreadsheetId: "created-sheet-1" };

    expect(clearPlanMock).toHaveBeenCalledTimes(1);
    expect(clearCompletedSessionsMock).toHaveBeenCalledTimes(1);
    expect(resetAllSessionsMock).toHaveBeenCalledTimes(1);
    expect(clearPendingRequestMock).toHaveBeenCalledTimes(1);
    expect(clearEventsMock).toHaveBeenCalledTimes(1);
    expect(clearMapMock).toHaveBeenCalledTimes(1);
    expect(clearPendingLogsMock).toHaveBeenCalledTimes(1);
    expect(userProfileState.hasCompletedSetup).toBe(false);
    expect(localStorage.getItem(CACHE_OWNER_KEY)).toBe("created-sheet-1");
  });

  it("clearDerivedSheetCaches({ onlyInstantiated: true }) skips stores absent from active Pinia", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    pinia._s.set("coachChat", {} as never);
    pinia._s.set("userProfile", {} as never);

    try {
      clearDerivedSheetCaches({ onlyInstantiated: true });

      expect(resetAllSessionsMock).toHaveBeenCalledTimes(1);
      expect(userProfileState.hasCompletedSetup).toBe(false);
      expect(clearPlanMock).not.toHaveBeenCalled();
      expect(clearCompletedSessionsMock).not.toHaveBeenCalled();
      expect(clearPendingRequestMock).not.toHaveBeenCalled();
      expect(clearEventsMock).not.toHaveBeenCalled();
      expect(clearMapMock).not.toHaveBeenCalled();
      expect(clearPendingLogsMock).not.toHaveBeenCalled();
    } finally {
      setActivePinia(undefined);
    }
  });
});
