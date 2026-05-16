import { ok } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadAiMessagesFromStorageMock,
  cleanOldAiSessionsMock,
  removeAiMessagesFromStorageMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  loadAiMessagesFromStorageMock: vi.fn(),
  cleanOldAiSessionsMock: vi.fn(),
  removeAiMessagesFromStorageMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/modules/aiCoach/application", () => ({
  askCoachWithSingleRetry: vi.fn(),
  classifyExerciseNames: vi.fn(),
  getTodayLogsCount: vi.fn(() => 0),
  mapTrainingFatigueTriggersToDeload: vi.fn(() => []),
  responseStartsDeload: vi.fn(() => false),
}));

vi.mock("@sentry/vue", () => ({
  captureException: captureExceptionMock,
  captureMessage: vi.fn(),
}));

vi.mock("@/modules/aiCoach/infrastructure", () => ({
  createAiCoachService: vi.fn(() => ({})),
}));

vi.mock("@/modules/deload/presentation", () => ({
  useDeloadStore: vi.fn(() => ({ active: false, startDeload: vi.fn() })),
}));

vi.mock("@/modules/events/presentation", () => ({
  useEventsStore: vi.fn(() => ({ events: [] })),
}));

vi.mock("@/modules/platform/presentation", () => ({
  useExerciseMuscleMapStore: vi.fn(() => ({
    learnedMap: {},
    refresh: vi.fn(),
    applyCleanupResults: vi.fn(),
  })),
  useTrainingSummaryStore: vi.fn(() => ({ summaries: [] })),
}));

vi.mock("@/modules/profile/presentation", () => ({
  useUserProfileStore: vi.fn(() => ({ apiKey: null, userProfile: {} })),
}));

vi.mock("@/modules/trainingInsights/presentation", () => ({
  useTrainingInsightsStore: vi.fn(() => ({
    insights: { fatigue: { riskScore: 0, triggeredBy: [] } },
  })),
  getMuscleActivation: vi.fn(() => ({ primaryMuscle: "Chest", confidence: 1 })),
  normalizeExerciseName: vi.fn((name: string) => name),
}));

vi.mock("@/modules/trainingLogs/presentation", () => ({
  useExerciseLogsStore: vi.fn(() => ({ exerciseLogs: [] })),
  resolveCurrentSession: vi.fn(() => null),
}));

vi.mock("./aiMessageStorage", () => ({
  loadAiMessagesFromStorage: loadAiMessagesFromStorageMock,
  cleanOldAiSessions: cleanOldAiSessionsMock,
  removeAiMessagesFromStorage: removeAiMessagesFromStorageMock,
  saveAiMessagesToStorage: vi.fn(() => ok(undefined)),
}));

import { askCoachWithSingleRetry } from "@/modules/aiCoach/application";
import { useUserProfileStore } from "@/modules/profile/presentation";
import { useAiStore } from "./aiStore";

describe("useAiStore initialization", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    loadAiMessagesFromStorageMock.mockReturnValue(ok([]));
  });

  it("does not initialize storage on store creation", () => {
    const store = useAiStore();

    expect(store.messages).toEqual([]);
    expect(loadAiMessagesFromStorageMock).not.toHaveBeenCalled();
    expect(cleanOldAiSessionsMock).not.toHaveBeenCalled();
  });

  it("initializes storage once when initialize is called", () => {
    const store = useAiStore();
    loadAiMessagesFromStorageMock.mockReturnValue(
      ok([
        {
          id: "msg-1",
          role: "assistant",
          content: "hello",
          timestamp: new Date("2026-01-01T10:00:00.000Z"),
          sessionDate: "2026-01-01",
          logsCount: 1,
        },
      ]),
    );

    store.initialize();
    store.initialize();

    expect(loadAiMessagesFromStorageMock).toHaveBeenCalledTimes(1);
    expect(cleanOldAiSessionsMock).toHaveBeenCalledTimes(1);
    expect(store.messages).toHaveLength(1);
  });

  it("lazy-initializes before askAi and returns missing-api-key", async () => {
    const store = useAiStore();

    const result = await store.askAi();

    expect(loadAiMessagesFromStorageMock).toHaveBeenCalledTimes(1);
    expect(cleanOldAiSessionsMock).toHaveBeenCalledTimes(1);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("missing-api-key");
    }
  });

  it("returns ai-request-failed when askCoach throws unexpectedly", async () => {
    vi.mocked(useUserProfileStore).mockReturnValue({
      apiKey: "test-key",
      userProfile: {},
    } as never);
    vi.mocked(askCoachWithSingleRetry).mockRejectedValueOnce(new Error("boom"));

    const store = useAiStore();

    const result = await store.askAi();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("ai-request-failed");
    }
    expect(store.isLoading).toBe(false);
    expect(captureExceptionMock).toHaveBeenCalled();
  });

  it("exposes setup store refs for devtools compatibility", () => {
    const store = useAiStore();

    expect("hasInitialized" in store).toBe(true);
  });
});

describe("useAiStore currentWorkoutPlan", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("extracts current workout plan from last assistant message", () => {
    const store = useAiStore();
    store.messages = [
      {
        id: "msg-1",
        role: "user" as const,
        content: "hi",
        timestamp: new Date(),
        sessionDate: "2026-01-01",
        logsCount: 0,
      },
      {
        id: "msg-2",
        role: "assistant" as const,
        content: JSON.stringify({
          recommendedWorkout: [
            { exerciseName: "Bench Press", restSeconds: 120 },
          ],
        }),
        timestamp: new Date(),
        sessionDate: "2026-01-01",
        logsCount: 0,
      },
    ];

    expect(store.currentWorkoutPlan).toEqual([
      { exerciseName: "Bench Press", restSeconds: 120 },
    ]);
  });

  it("returns null if no assistant message", () => {
    const store = useAiStore();
    store.messages = [
      {
        id: "msg-1",
        role: "user" as const,
        content: "hi",
        timestamp: new Date(),
        sessionDate: "2026-01-01",
        logsCount: 0,
      },
    ];

    expect(store.currentWorkoutPlan).toBeNull();
  });

  it("returns null if JSON parsing fails", () => {
    const store = useAiStore();
    store.messages = [
      {
        id: "msg-2",
        role: "assistant" as const,
        content: "not json",
        timestamp: new Date(),
        sessionDate: "2026-01-01",
        logsCount: 0,
      },
    ];

    expect(store.currentWorkoutPlan).toBeNull();
  });
});
