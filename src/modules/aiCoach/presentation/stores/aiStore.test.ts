import { ok } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadMessagesFromStorageMock,
  cleanOldCoachingSessionsMock,
  removeMessagesFromStorageMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  loadMessagesFromStorageMock: vi.fn(() => ok([])),
  cleanOldCoachingSessionsMock: vi.fn(),
  removeMessagesFromStorageMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/modules/aiCoach/application", () => ({
  requestAdviceWithSingleRetry: vi.fn(),
  classifyExerciseNames: vi.fn(),
  getTodayLogsCount: vi.fn(() => 0),
  mapTrainingFatigueTriggersToDeload: vi.fn(() => []),
  adviceStartsDeload: vi.fn(() => false),
}));

vi.mock("@sentry/vue", () => ({
  captureException: captureExceptionMock,
  captureMessage: vi.fn(),
}));

vi.mock("@/modules/aiCoach/infrastructure", () => ({
  createAiCoachService: vi.fn(() => ({})),
  LocalStoragePlanRepository: class {
    loadPlan = vi.fn(() => ({ isOk: () => true, value: null }));
    savePlan = vi.fn(() => ({}));
    clearPlan = vi.fn(() => ({}));
  },
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

vi.mock("@/modules/aiCoach/infrastructure/messageStorage", () => ({
  loadMessagesFromStorage: loadMessagesFromStorageMock,
  cleanOldCoachingSessions: cleanOldCoachingSessionsMock,
  removeMessagesFromStorage: removeMessagesFromStorageMock,
  saveMessagesToStorage: vi.fn(() => ok(undefined)),
}));

import { requestAdviceWithSingleRetry } from "@/modules/aiCoach/application";
import { useUserProfileStore } from "@/modules/profile/presentation";
import { resolveCurrentSession } from "@/modules/trainingLogs/presentation";
import { useAiStore } from "./aiStore";

describe("useAiStore initialization", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    loadMessagesFromStorageMock.mockClear();
    removeMessagesFromStorageMock.mockClear();
    cleanOldCoachingSessionsMock.mockClear();
    loadMessagesFromStorageMock.mockReturnValue(ok([]));
  });

  it("does not initialize storage on store creation", () => {
    const store = useAiStore();

    expect(store.messages).toEqual([]);
    expect(loadMessagesFromStorageMock).not.toHaveBeenCalled();
    expect(cleanOldCoachingSessionsMock).not.toHaveBeenCalled();
  });

  it("initializes storage once when initialize is called", () => {
    const store = useAiStore();
    loadMessagesFromStorageMock.mockReturnValue(
      ok([
        {
          id: "msg-1",
          role: "coach",
          content: "hello",
          timestamp: "2026-01-01T10:00:00.000Z",
          sessionId: "2026-01-01",
          logsCount: 1,
        },
      ] as any),
    );

    store.initialize();
    store.initialize();

    expect(loadMessagesFromStorageMock).toHaveBeenCalledTimes(1);
    expect(cleanOldCoachingSessionsMock).toHaveBeenCalledTimes(1);
    expect(store.messages).toHaveLength(1);
  });

  it("lazy-initializes before requestAdvice and returns missing-api-key", async () => {
    const store = useAiStore();

    const result = await store.requestAdvice();

    expect(loadMessagesFromStorageMock).toHaveBeenCalledTimes(1);
    expect(cleanOldCoachingSessionsMock).toHaveBeenCalledTimes(1);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("missing-api-key");
    }
  });

  it("returns coaching-request-failed when askCoach throws unexpectedly", async () => {
    vi.mocked(useUserProfileStore).mockReturnValue({
      apiKey: "test-key",
      userProfile: {},
    } as never);
    vi.mocked(requestAdviceWithSingleRetry).mockRejectedValueOnce(new Error("boom"));

    const store = useAiStore();

    const result = await store.requestAdvice();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("coaching-request-failed");
    }
    expect(store.isLoading).toBe(false);
  });

  it("passes question to requestAdviceWithSingleRetry", async () => {
    vi.mocked(useUserProfileStore).mockReturnValue({
      apiKey: "test-key",
      userProfile: {},
    } as never);

    const mockResult = { responseText: "{}", requestPayload: "AI request" };
    vi.mocked(requestAdviceWithSingleRetry).mockResolvedValueOnce(ok(mockResult) as never);

    const store = useAiStore();
    const question = "Why deload?";
    await store.requestAdvice(question);

    expect(requestAdviceWithSingleRetry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        apiKey: "test-key",
        question,
      }),
    );
  });

  it("exposes setup store refs for devtools compatibility", () => {
    const store = useAiStore();

    expect("hasInitialized" in store).toBe(true);
  });

  it("clears messages on calling clearMessages", () => {
    const store = useAiStore();
    store.messages = [
      {
        id: "msg-1",
        role: "coach",
        content: "hello",
        timestamp: "2026-01-01T10:00:00Z",
        sessionId: "2026-01-01",
        logsCount: 1,
      },
    ];

    store.clearMessages();

    expect(store.messages).toEqual([]);
    expect(removeMessagesFromStorageMock).toHaveBeenCalledWith(expect.any(String));
  });
});

describe("useAiStore currentWorkoutPlan", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("extracts current workout plan from last coach message", () => {
    const store = useAiStore();
    store.messages = [
      {
        id: "msg-1",
        role: "user" as const,
        content: "hi",
        timestamp: "2026-01-01T10:00:00.000Z",
        sessionId: "2026-01-01",
        logsCount: 0,
      },
      {
        id: "msg-2",
        role: "coach" as const,
        content: JSON.stringify({
          recommendedWorkout: [{ exerciseName: "Bench Press", restSeconds: 120 }],
        }),
        timestamp: "2026-01-01T10:00:00.000Z",
        sessionId: "2026-01-01",
        logsCount: 0,
      },
    ];

    expect(store.currentWorkoutPlan).toEqual([{ exerciseName: "Bench Press", restSeconds: 120 }]);
  });

  it("returns null if no coach message", () => {
    const store = useAiStore();
    store.messages = [
      {
        id: "msg-1",
        role: "user" as const,
        content: "hi",
        timestamp: "2026-01-01T10:00:00.000Z",
        sessionId: "2026-01-01",
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
        role: "coach" as const,
        content: "not json",
        timestamp: "2026-01-01T10:00:00.000Z",
        sessionId: "2026-01-01",
        logsCount: 0,
      },
    ];

    expect(store.currentWorkoutPlan).toBeNull();
  });
});

describe("useAiStore isNewDataAvailable", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("returns true if no messages", () => {
    const store = useAiStore();
    store.messages = [];
    expect(store.isNewDataAvailable).toBe(true);
  });

  it("returns false if messages exist and checksum matches", () => {
    const store = useAiStore();
    store.messages = [
      {
        id: "msg-1",
        role: "coach",
        content: "hello",
        timestamp: "2026-01-01T10:00:00.000Z",
        sessionId: "2026-01-01",
        logsCount: 1,
      },
    ];
    store.lastRequestLogsChecksum = "";
    expect(store.isNewDataAvailable).toBe(false);
  });

  it("returns true if messages exist but checksum is different", () => {
    const store = useAiStore();
    store.messages = [
      {
        id: "msg-1",
        role: "coach",
        content: "hello",
        timestamp: "2026-01-01T10:00:00.000Z",
        sessionId: "2026-01-01",
        logsCount: 1,
      },
    ];

    vi.mocked(resolveCurrentSession).mockReturnValueOnce({
      sessionId: "2026-01-01",
      sessionDate: "2026-01-01",
      logs: [{ id: "log-1", reps: 10, weight: 100 }],
    } as any);

    store.lastRequestLogsChecksum = "";
    expect(store.isNewDataAvailable).toBe(true);
  });
});
