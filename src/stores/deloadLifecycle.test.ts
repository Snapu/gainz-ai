import type { GoogleSpreadsheet } from "google-spreadsheet";
import { createPinia, setActivePinia } from "pinia";
import { ok } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDeloadLifecycleStore } from "./deloadLifecycle";

vi.mock("@/services/deloadLifecycleSheet", () => ({
  loadDeloadLifecycle: vi.fn(),
  saveDeloadLifecycle: vi.fn(),
}));

vi.mock("@/services/trainingScience", () => ({
  calculateTrainingInsights: vi.fn(() => ({
    fatigue: {
      shouldDeload: false,
      reason: undefined,
      weeklyTotalSets: [0, 0, 0, 0],
      weeklyTonnage: [0, 0, 0, 0],
      triggeredBy: [],
      decliningExercises: 0,
    },
  })),
}));

vi.mock("@/services/trainingSummary", () => ({
  summaryToExerciseLogs: vi.fn(() => []),
}));

vi.mock("@/stores/spreadsheet", () => ({
  useSpreadsheetStore: vi.fn(),
}));

vi.mock("@/stores/userProfile", () => ({
  useUserProfileStore: vi.fn(),
}));

vi.mock("@/stores/exerciseLogs", () => ({
  useExerciseLogsStore: vi.fn(),
}));

vi.mock("@/stores/trainingSummary", () => ({
  useTrainingSummaryStore: vi.fn(),
}));

vi.mock("@/stores/exerciseMuscleMap", () => ({
  useExerciseMuscleMapStore: vi.fn(),
}));

import { loadDeloadLifecycle } from "@/services/deloadLifecycleSheet";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";
import { useExerciseMuscleMapStore } from "@/stores/exerciseMuscleMap";
import { useSpreadsheetStore } from "@/stores/spreadsheet";
import { useTrainingSummaryStore } from "@/stores/trainingSummary";
import { useUserProfileStore } from "@/stores/userProfile";

describe("useDeloadLifecycleStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(useSpreadsheetStore).mockReturnValue({ doc: {} as GoogleSpreadsheet } as ReturnType<typeof useSpreadsheetStore>);
    vi.mocked(useUserProfileStore).mockReturnValue({ isLoading: false, userProfile: { weightKg: 80 } } as ReturnType<typeof useUserProfileStore>);
    vi.mocked(useExerciseLogsStore).mockReturnValue({ exerciseLogs: [] } as unknown as ReturnType<typeof useExerciseLogsStore>);
    vi.mocked(useTrainingSummaryStore).mockReturnValue({ summaries: [] } as unknown as ReturnType<typeof useTrainingSummaryStore>);
    vi.mocked(useExerciseMuscleMapStore).mockReturnValue({ learnedMap: {} } as ReturnType<typeof useExerciseMuscleMapStore>);
    vi.mocked(loadDeloadLifecycle).mockResolvedValue(ok(undefined));
  });

  it("loads lifecycle from sheet", async () => {
    vi.mocked(loadDeloadLifecycle).mockResolvedValue(ok({ status: "active", endsAtIso: "2026-05-09T10:00:00.000Z" }));
    const store = useDeloadLifecycleStore();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(store.deloadLifecycle?.status).toBe("active");
  });

  it("syncDeloadLifecycle auto-starts deload", async () => {
    const store = useDeloadLifecycleStore();
    await new Promise((resolve) => setTimeout(resolve, 100));
    store.syncDeloadLifecycle(
      {
        shouldDeload: true,
        reason: "Volume spike",
        snapshot: { weeklyTotalSets: [10, 12, 14, 18], weeklyTonnage: [3000, 3500, 4000, 5200] },
      },
      new Date("2026-05-02T10:00:00.000Z"),
    );
    expect(store.deloadLifecycle?.status).toBe("active");
  });

  it("stopDeloadNow ends active deload", async () => {
    const store = useDeloadLifecycleStore();
    store.setLifecycle({
      status: "active",
      startedAtIso: "2026-05-02T10:00:00.000Z",
      endsAtIso: "2026-05-09T10:00:00.000Z",
    });
    store.stopDeloadNow(new Date("2026-05-04T10:00:00.000Z"));
    expect(store.deloadLifecycle?.status).toBe("inactive");
    expect(store.deloadLifecycle?.currentBlockStartedAtIso).toBe("2026-05-04T10:00:00.000Z");
  });
});
