import { err, okAsync } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  applyExerciseWeightMigrationDecisionMock,
  buildPendingExerciseMigrationCandidatesMock,
  loadAllLogsForMigrationMock,
  loadExerciseWeightMigrationReviewsMock,
  useSpreadsheetRepositoryFactoryMock,
  useExerciseLogsStoreMock,
  useTrainingSummaryStoreMock,
} = vi.hoisted(() => ({
  applyExerciseWeightMigrationDecisionMock: vi.fn(),
  buildPendingExerciseMigrationCandidatesMock: vi.fn(() => []),
  loadAllLogsForMigrationMock: vi.fn(),
  loadExerciseWeightMigrationReviewsMock: vi.fn(),
  useSpreadsheetRepositoryFactoryMock: vi.fn(),
  useExerciseLogsStoreMock: vi.fn(),
  useTrainingSummaryStoreMock: vi.fn(),
}));

vi.mock("@/modules/migration/application", () => ({
  applyExerciseWeightMigrationDecision: applyExerciseWeightMigrationDecisionMock,
  buildPendingExerciseMigrationCandidates: buildPendingExerciseMigrationCandidatesMock,
  loadAllLogsForMigration: loadAllLogsForMigrationMock,
  loadExerciseWeightMigrationReviews: loadExerciseWeightMigrationReviewsMock,
}));

vi.mock("@/modules/migration/infrastructure", () => ({
  createExerciseWeightMigrationRepository: vi.fn(),
}));

vi.mock("@/modules/trainingLogs/infrastructure", () => ({
  createExerciseLogRepository: vi.fn(),
}));

vi.mock("@/modules/platform/presentation", () => ({
  useSpreadsheetRepositoryFactory: useSpreadsheetRepositoryFactoryMock,
  useTrainingSummaryStore: useTrainingSummaryStoreMock,
}));

vi.mock("@/modules/trainingLogs/presentation", () => ({
  useExerciseLogsStore: useExerciseLogsStoreMock,
}));

import { useExerciseWeightMigrationStore } from "./exerciseWeightMigrationStore";

describe("useExerciseWeightMigrationStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    const doc = null;
    useSpreadsheetRepositoryFactoryMock
      .mockReturnValueOnce({
        spreadsheetStore: { doc },
        getDoc: (docOverride?: unknown) => docOverride ?? doc,
        createRepository: vi.fn(() => ({ kind: "migration-repo" })),
      })
      .mockReturnValueOnce({
        spreadsheetStore: { doc },
        getDoc: (docOverride?: unknown) => docOverride ?? doc,
        createRepository: vi.fn(() => ({ kind: "logs-repo" })),
      });

    useExerciseLogsStoreMock.mockReturnValue({ refresh: vi.fn() });
    useTrainingSummaryStoreMock.mockReturnValue({ refresh: vi.fn() });
  });

  it("returns a typed error and clears active state when applyDecision rejects unexpectedly", async () => {
    applyExerciseWeightMigrationDecisionMock.mockRejectedValueOnce(new Error("boom"));

    const store = useExerciseWeightMigrationStore();
    const result = await store.applyDecision("Bench Press", "convert_to_total");

    expect(result?.isErr()).toBe(true);
    expect(result).toEqual(err("save-failed"));
    expect(store.lastError).toBe("save-failed");
    expect(store.activeExerciseName).toBeNull();
  });
  it("normalizes refresh rejections into a load error and clears loading state", async () => {
    loadExerciseWeightMigrationReviewsMock.mockRejectedValueOnce(new Error("boom"));
    loadAllLogsForMigrationMock.mockReturnValueOnce(okAsync([]));

    const store = useExerciseWeightMigrationStore();

    await expect(store.refresh({ id: "doc" } as never)).resolves.toBeUndefined();

    expect(store.lastError).toBe("load-failed");
    expect(store.isLoading).toBe(false);
  });
});
