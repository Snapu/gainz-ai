import { err, errAsync, okAsync, type Result, ResultAsync } from "neverthrow";
import { createPinia, type Pinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";

const {
  applyExerciseWeightMigrationDecisionMock,
  buildPendingExerciseMigrationCandidatesMock,
  loadAllLogsForMigrationMock,
  loadExerciseWeightMigrationReviewsMock,
  useSpreadsheetRepositoryFactoryMock,
  logsRefreshMock,
  createHistoryReaderMock,
  rebuildAllSummariesMock,
  handleAuthErrorMock,
} = vi.hoisted(() => ({
  applyExerciseWeightMigrationDecisionMock: vi.fn(),
  buildPendingExerciseMigrationCandidatesMock: vi.fn(() => []),
  loadAllLogsForMigrationMock: vi.fn(),
  loadExerciseWeightMigrationReviewsMock: vi.fn(),
  useSpreadsheetRepositoryFactoryMock: vi.fn(),
  logsRefreshMock: vi.fn(() => okAsync([])),
  createHistoryReaderMock: vi.fn((doc?: unknown) => (doc ? { kind: "logs-reader" } : null)),
  rebuildAllSummariesMock: vi.fn(() => okAsync([])),
  handleAuthErrorMock: vi.fn(async () => false),
}));

const reactiveDoc = ref<unknown>(null);

vi.mock("@/modules/auth/presentation/composables/useAuthErrorHandler", () => ({
  useAuthErrorHandler: () => ({
    handleAuthError: handleAuthErrorMock,
  }),
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

vi.mock("@/modules/platform/presentation", () => ({
  useSpreadsheetRepositoryFactory: useSpreadsheetRepositoryFactoryMock,
}));

vi.mock("@/modules/trainingSummary/presentation", () => ({
  useTrainingSummaryStore: () => ({
    refresh: vi.fn(),
    rebuildAllSummaries: rebuildAllSummariesMock,
  }),
}));

vi.mock("@/modules/trainingLogs/presentation", () => ({
  useExerciseLogsStore: () => ({
    refresh: logsRefreshMock,
    createHistoryReader: createHistoryReaderMock,
  }),
}));

import { useExerciseWeightMigrationStore } from "./exerciseWeightMigrationStore";

describe("useExerciseWeightMigrationStore", () => {
  let pinia: Pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.clearAllMocks();
    reactiveDoc.value = null;
    handleAuthErrorMock.mockResolvedValue(false);
    logsRefreshMock.mockReturnValue(okAsync([]));
    rebuildAllSummariesMock.mockReturnValue(okAsync([]));
    loadExerciseWeightMigrationReviewsMock.mockReturnValue(okAsync([]));
    loadAllLogsForMigrationMock.mockReturnValue(okAsync([]));
    useSpreadsheetRepositoryFactoryMock.mockReturnValue({
      spreadsheetStore: {
        get doc() {
          return reactiveDoc.value;
        },
      },
      getDoc: (docOverride?: unknown) => docOverride ?? reactiveDoc.value,
      createRepository: vi.fn(() => ({ kind: "migration-repo" })),
    });
  });

  afterEach(() => {
    (pinia as unknown as { _e?: { stop?: () => void } })._e?.stop?.();
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
    const result = await store.refresh({ id: "doc" } as never);

    expect(result.isErr()).toBe(true);
    expect(result).toEqual(err("load-failed"));
    expect(store.lastError).toBe("load-failed");
    expect(store.isLoading).toBe(false);
  });

  it("applies decision successfully, refreshes stores, and rebuilds summaries", async () => {
    reactiveDoc.value = { id: "doc-1" };
    applyExerciseWeightMigrationDecisionMock.mockReturnValueOnce(
      okAsync({
        review: {
          exerciseName: "Bench Press",
          decision: "convert_to_total",
          reviewedAt: "now",
          affectedLogCount: 1,
        },
        updatedLogCount: 1,
      }),
    );

    const store = useExerciseWeightMigrationStore();
    await nextTick();
    vi.clearAllMocks();

    const result = await store.applyDecision("Bench Press", "convert_to_total");

    expect(result?.isOk()).toBe(true);
    expect(store.lastError).toBeNull();
    expect(store.activeExerciseName).toBeNull();
    expect(applyExerciseWeightMigrationDecisionMock).toHaveBeenCalledWith(
      "Bench Press",
      "convert_to_total",
      expect.anything(),
    );
    expect(logsRefreshMock).toHaveBeenCalledOnce();
    expect(rebuildAllSummariesMock).toHaveBeenCalledWith({ id: "doc-1" });
  });

  it("propagates Err results from applyExerciseWeightMigrationDecision without refreshing or rebuilding", async () => {
    reactiveDoc.value = { id: "doc-1" };
    const store = useExerciseWeightMigrationStore();
    await nextTick();
    vi.clearAllMocks();

    applyExerciseWeightMigrationDecisionMock.mockReturnValueOnce(errAsync("already-reviewed"));

    const result = await store.applyDecision("Bench Press", "convert_to_total");

    expect(result).toEqual(err("already-reviewed"));
    expect(store.lastError).toBe("already-reviewed");
    expect(store.activeExerciseName).toBeNull();
    expect(logsRefreshMock).not.toHaveBeenCalled();
    expect(rebuildAllSummariesMock).not.toHaveBeenCalled();
  });

  it("rebuilds summaries before surfacing load-failed when post-decision logs refresh returns Err", async () => {
    reactiveDoc.value = { id: "doc-1" };
    const store = useExerciseWeightMigrationStore();
    await nextTick();
    vi.clearAllMocks();

    applyExerciseWeightMigrationDecisionMock.mockReturnValueOnce(
      okAsync({ review: {}, updatedLogCount: 1 }),
    );
    logsRefreshMock.mockReturnValueOnce(errAsync("load-failed") as never);

    const result = await store.applyDecision("Bench Press", "convert_to_total");

    expect(rebuildAllSummariesMock).toHaveBeenCalledOnce();
    expect(result).toEqual(err("load-failed"));
    expect(store.lastError).toBe("load-failed");
  });

  it("retries applyDecision once via retryOnAuthError when auth recovers", async () => {
    reactiveDoc.value = { id: "doc-1" };
    const store = useExerciseWeightMigrationStore();
    await nextTick();
    vi.clearAllMocks();

    applyExerciseWeightMigrationDecisionMock
      .mockReturnValueOnce(errAsync("auth-failed"))
      .mockReturnValueOnce(okAsync({ review: {}, updatedLogCount: 1 }));
    handleAuthErrorMock.mockResolvedValueOnce(true);

    const result = await store.applyDecision("Bench Press", "convert_to_total");

    expect(result?.isOk()).toBe(true);
    expect(handleAuthErrorMock).toHaveBeenCalledWith("migration-decision-apply");
    expect(applyExerciseWeightMigrationDecisionMock).toHaveBeenCalledTimes(2);
    expect(rebuildAllSummariesMock).toHaveBeenCalledOnce();
  });

  it("skips recovery and error state writes when logged out mid-applyDecision", async () => {
    reactiveDoc.value = { id: "doc-1" };
    const store = useExerciseWeightMigrationStore();
    await nextTick();
    vi.clearAllMocks();

    type ApplyResult = Result<unknown, "auth-failed">;
    let resolveApply: ((value: ApplyResult) => void) | undefined;
    applyExerciseWeightMigrationDecisionMock.mockReturnValueOnce(
      new ResultAsync(
        new Promise<ApplyResult>((resolve) => {
          resolveApply = resolve;
        }),
      ),
    );

    const pending = store.applyDecision("Bench Press", "convert_to_total");
    expect(store.activeExerciseName).toBe("Bench Press");

    reactiveDoc.value = null;
    await nextTick();
    expect(store.activeExerciseName).toBeNull();

    resolveApply?.(err("auth-failed"));
    await pending;

    expect(handleAuthErrorMock).not.toHaveBeenCalled();
    expect(rebuildAllSummariesMock).not.toHaveBeenCalled();
    expect(store.lastError).toBeNull();
    expect(store.activeExerciseName).toBeNull();
  });

  it("treats refresh-in-progress during post-decision logs refresh as non-fatal", async () => {
    reactiveDoc.value = { id: "doc-1" };
    const store = useExerciseWeightMigrationStore();
    await nextTick();
    vi.clearAllMocks();

    applyExerciseWeightMigrationDecisionMock.mockReturnValueOnce(
      okAsync({ review: {}, updatedLogCount: 1 }),
    );
    logsRefreshMock.mockReturnValueOnce(errAsync("refresh-in-progress") as never);

    const result = await store.applyDecision("Bench Press", "convert_to_total");

    expect(result?.isOk()).toBe(true);
    expect(store.lastError).toBeNull();
    expect(rebuildAllSummariesMock).toHaveBeenCalledOnce();
    expect(loadExerciseWeightMigrationReviewsMock).toHaveBeenCalledOnce();
  });

  it("still refreshes migration state when post-decision summary rebuild fails", async () => {
    reactiveDoc.value = { id: "doc-1" };
    const store = useExerciseWeightMigrationStore();
    await nextTick();
    vi.clearAllMocks();

    applyExerciseWeightMigrationDecisionMock.mockReturnValueOnce(
      okAsync({ review: {}, updatedLogCount: 1 }),
    );
    rebuildAllSummariesMock.mockReturnValueOnce(errAsync("save-failed") as never);
    buildPendingExerciseMigrationCandidatesMock.mockReturnValueOnce([]);

    const result = await store.applyDecision("Bench Press", "convert_to_total");

    expect(loadExerciseWeightMigrationReviewsMock).toHaveBeenCalledOnce();
    expect(logsRefreshMock).toHaveBeenCalledOnce();
    expect(store.pendingExercises).toEqual([]);
    expect(result).toEqual(err("summary-rebuild-failed"));
    expect(store.lastError).toBe("summary-rebuild-failed");
  });

  it("clears pending and reviewed candidates on logout", async () => {
    buildPendingExerciseMigrationCandidatesMock.mockReturnValueOnce([
      { exerciseName: "Squat" } as never,
    ]);
    loadExerciseWeightMigrationReviewsMock.mockReturnValueOnce(
      okAsync([{ exerciseName: "Bench" } as never]),
    );

    const store = useExerciseWeightMigrationStore();
    reactiveDoc.value = { id: "doc-1" };
    await vi.waitFor(() => expect(store.pendingExercises).toHaveLength(1));
    expect(store.reviewedCount).toBe(1);

    reactiveDoc.value = null;
    await nextTick();

    expect(store.pendingExercises).toEqual([]);
    expect(store.reviewedExercises).toEqual([]);
    expect(store.activeExerciseName).toBeNull();
    expect(store.lastError).toBeNull();
    expect(store.isLoading).toBe(false);
  });
});
