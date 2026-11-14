import { errAsync, ok, okAsync, type Result, ResultAsync } from "neverthrow";
import { createPinia, type Pinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";

const {
  loadTrainingSummaryMock,
  migrateUnsummarizedYearsMock,
  migrateUnsummarizedMonthsMock,
  rebuildAllTrainingSummariesMock,
  handleAuthErrorMock,
  captureMessageMock,
  createHistoryReaderMock,
} = vi.hoisted(() => ({
  loadTrainingSummaryMock: vi.fn(),
  migrateUnsummarizedYearsMock: vi.fn(),
  migrateUnsummarizedMonthsMock: vi.fn(),
  rebuildAllTrainingSummariesMock: vi.fn(),
  handleAuthErrorMock: vi.fn(),
  captureMessageMock: vi.fn(),
  createHistoryReaderMock: vi.fn((doc?: unknown) =>
    doc && !(doc as { noRepo?: boolean }).noRepo
      ? {
          loadCurrentYearLogs: vi.fn(() => okAsync([])),
          findPastYears: vi.fn(() => []),
          loadYearLogs: vi.fn(() => okAsync([])),
        }
      : null,
  ),
}));

const reactiveDoc = ref<unknown>(null);

vi.mock("@sentry/vue", () => ({
  captureMessage: captureMessageMock,
  captureException: vi.fn(),
}));

vi.mock("@/modules/platform/presentation", () => ({
  useSpreadsheetRepositoryFactory: vi.fn(() => ({
    spreadsheetStore: {
      get doc() {
        return reactiveDoc.value;
      },
    },
    getDoc: (override?: unknown) => override ?? reactiveDoc.value,
    createRepository: (doc?: unknown) => {
      const target = doc ?? reactiveDoc.value;
      if (!target || (target as { noRepo?: boolean }).noRepo) return null;
      return { id: "repo" };
    },
  })),
}));

vi.mock("@/modules/trainingLogs/presentation", () => ({
  useExerciseLogsStore: () => ({
    createHistoryReader: createHistoryReaderMock,
  }),
}));

vi.mock("@/modules/trainingSummary/infrastructure", () => ({
  createTrainingSummaryRepository: vi.fn(() => ({ id: "summary-repo" })),
}));

vi.mock("@/modules/trainingSummary/application", () => ({
  loadTrainingSummary: loadTrainingSummaryMock,
  migrateUnsummarizedYears: migrateUnsummarizedYearsMock,
  migrateUnsummarizedMonths: migrateUnsummarizedMonthsMock,
  rebuildAllTrainingSummaries: rebuildAllTrainingSummariesMock,
}));

vi.mock("@/modules/auth/presentation/composables/useAuthErrorHandler", () => ({
  useAuthErrorHandler: () => ({
    handleAuthError: handleAuthErrorMock,
  }),
}));

import { useTrainingSummaryStore } from "./trainingSummaryStore";

describe("useTrainingSummaryStore", () => {
  let pinia: Pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.clearAllMocks();
    reactiveDoc.value = null;
    migrateUnsummarizedYearsMock.mockImplementation((_repo, _logs, items) => okAsync(items));
    migrateUnsummarizedMonthsMock.mockImplementation((_repo, _logs, items) => okAsync(items));
  });

  afterEach(() => {
    (pinia as unknown as { _e?: { stop?: () => void } })._e?.stop?.();
  });

  it("resets summaries and isInitialized on logout so subsequent login reloads cleanly", async () => {
    const firstSummary = [
      { year: 2026, month: 10, exerciseName: "Squat", sets: 3, workoutDays: 1 },
    ];
    const secondSummary = [
      { year: 2026, month: 11, exerciseName: "Bench", sets: 4, workoutDays: 2 },
    ];
    loadTrainingSummaryMock
      .mockReturnValueOnce(okAsync(firstSummary))
      .mockReturnValueOnce(okAsync(secondSummary));

    const store = useTrainingSummaryStore();
    reactiveDoc.value = { id: "doc-1" };
    await vi.waitFor(() => expect(store.isInitialized).toBe(true));
    expect(store.summaries).toEqual(firstSummary);

    reactiveDoc.value = null;
    await nextTick();
    expect(store.summaries).toEqual([]);
    expect(store.isInitialized).toBe(false);

    reactiveDoc.value = { id: "doc-2" };
    await vi.waitFor(() => expect(store.summaries).toEqual(secondSummary));
    expect(loadTrainingSummaryMock).toHaveBeenCalledTimes(2);
  });

  it("recovers from auth-failed without firing pre-retry Sentry errors", async () => {
    const recovered = [
      { year: 2026, month: 11, exerciseName: "Deadlift", sets: 2, workoutDays: 1 },
    ];
    loadTrainingSummaryMock
      .mockReturnValueOnce(errAsync("auth-failed"))
      .mockReturnValueOnce(okAsync(recovered));
    handleAuthErrorMock.mockResolvedValueOnce(true);

    const store = useTrainingSummaryStore();
    reactiveDoc.value = { id: "doc-1" };

    await vi.waitFor(() => expect(store.summaries).toEqual(recovered));
    expect(handleAuthErrorMock).toHaveBeenCalledWith("training-summary-refresh");
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it("leaves isLoading false when rebuildAllSummaries exits early without logs repository", async () => {
    const store = useTrainingSummaryStore();
    const result = await store.rebuildAllSummaries({ noRepo: true } as never);

    expect(result.isErr()).toBe(true);
    expect(store.isLoading).toBe(false);
  });

  it("ignores stale in-flight refresh results after logout", async () => {
    type LoadResult = Result<unknown[], never>;
    let resolveLoad: ((value: LoadResult) => void) | undefined;
    loadTrainingSummaryMock.mockImplementationOnce(
      () =>
        new ResultAsync(
          new Promise<LoadResult>((resolve) => {
            resolveLoad = resolve;
          }),
        ),
    );

    const store = useTrainingSummaryStore();
    reactiveDoc.value = { id: "doc-1" };
    await nextTick();
    expect(store.isLoading).toBe(true);

    // Log out before in-flight load resolves
    reactiveDoc.value = null;
    await nextTick();
    expect(store.isLoading).toBe(false);
    expect(store.summaries).toEqual([]);

    resolveLoad?.(ok([{ year: 2026, month: 10, exerciseName: "Squat", sets: 3, workoutDays: 1 }]));
    await vi.waitFor(() => expect(migrateUnsummarizedMonthsMock).toHaveBeenCalled());
    await nextTick();
    await Promise.resolve();

    expect(store.summaries).toEqual([]);
    expect(store.isInitialized).toBe(false);
    expect(store.isLoading).toBe(false);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it("does not double-log auth-failed errors to Sentry", async () => {
    loadTrainingSummaryMock.mockReturnValueOnce(errAsync("auth-failed"));
    handleAuthErrorMock.mockResolvedValueOnce(false);

    const store = useTrainingSummaryStore();
    reactiveDoc.value = { id: "doc-1" };

    await vi.waitFor(() =>
      expect(handleAuthErrorMock).toHaveBeenCalledWith("training-summary-refresh"),
    );
    await vi.waitFor(() => expect(store.isLoading).toBe(false));
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it("keeps isLoading true while rebuildAllSummaries is still running after refresh completes", async () => {
    type SummaryResult = Result<unknown[], never>;
    let resolveLoad: ((value: SummaryResult) => void) | undefined;
    let resolveRebuild: ((value: SummaryResult) => void) | undefined;

    loadTrainingSummaryMock.mockImplementationOnce(
      () =>
        new ResultAsync(
          new Promise<SummaryResult>((resolve) => {
            resolveLoad = resolve;
          }),
        ),
    );
    rebuildAllTrainingSummariesMock.mockImplementationOnce(
      () =>
        new ResultAsync(
          new Promise<SummaryResult>((resolve) => {
            resolveRebuild = resolve;
          }),
        ),
    );

    const store = useTrainingSummaryStore();
    reactiveDoc.value = { id: "doc-1" };
    await nextTick();

    const rebuildPromise = store.rebuildAllSummaries();
    expect(store.isLoading).toBe(true);

    resolveLoad?.(ok([]));
    await vi.waitFor(() => expect(store.isInitialized).toBe(true));
    expect(store.isLoading).toBe(true);

    resolveRebuild?.(ok([{ year: 2026, month: 11, exerciseName: "Row", sets: 3, workoutDays: 1 }]));
    await rebuildPromise;
    expect(store.isLoading).toBe(false);
  });
});
