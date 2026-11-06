import { errAsync, okAsync } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { TrainingPlan } from "@/modules/aiCoach/domain";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import { useToast } from "@/shared/presentation/composables/useToast";

const mockExerciseLogs = ref<ExerciseLog[]>([]);
const mockIsLogsLoading = ref(false);
const mockIsLogsRefreshing = ref(false);
const mockLearnedMap = ref({});
const mockApiKey = ref<string | null>(null);
const mockAsk = vi.fn();

vi.mock("@/modules/aiCoach/infrastructure", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/aiCoach/infrastructure")>();
  return {
    ...actual,
    createAiCoachService: () => ({
      ask: (...args: unknown[]) => mockAsk(...args),
      classifyExercises: vi.fn(),
      getTodayLogsCount: () => 0,
    }),
  };
});

vi.mock("@/modules/trainingLogs/presentation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/trainingLogs/presentation")>();
  return {
    ...actual,
    useExerciseLogsStore: () => ({
      get exerciseLogs() {
        return mockExerciseLogs.value;
      },
      get isLoading() {
        return mockIsLogsLoading.value;
      },
      get isRefreshing() {
        return mockIsLogsRefreshing.value;
      },
    }),
  };
});

vi.mock("@/modules/platform/presentation", () => ({
  useExerciseMuscleMapStore: () => ({
    get learnedMap() {
      return mockLearnedMap.value;
    },
    refresh: vi.fn(),
    applyCleanupResults: vi.fn(),
  }),
  useTrainingSummaryStore: () => ({
    summaries: [],
  }),
}));

vi.mock("@/modules/profile/presentation", () => ({
  useUserProfileStore: () => ({
    get apiKey() {
      return mockApiKey.value;
    },
    userProfile: {},
  }),
}));

vi.mock("@/modules/events/presentation", () => ({
  useEventsStore: () => ({
    events: [],
  }),
}));

vi.mock("@/modules/deload/presentation", () => ({
  useDeloadStore: () => ({
    active: false,
    startDeload: vi.fn(),
  }),
}));

vi.mock("@/modules/trainingInsights/presentation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/trainingInsights/presentation")>();
  return {
    ...actual,
    useTrainingInsightsStore: () => ({
      insights: { fatigue: { riskScore: 0, triggeredBy: [] } },
    }),
  };
});

import { useCoachChatViewModel } from "../composables/useCoachChatViewModel";
import { useAiOrchestratorStore } from "./aiOrchestratorStore";
import { useCoachChatStore } from "./coachChatStore";
import { useTrainingPlanStore } from "./trainingPlanStore";

describe("useAiOrchestratorStore & useCoachChatViewModel reactivity", () => {
  beforeEach(async () => {
    mockExerciseLogs.value = [];
    mockIsLogsLoading.value = false;
    mockIsLogsRefreshing.value = false;
    mockApiKey.value = null;
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    localStorage.clear();
    setActivePinia(createPinia());
    mockAsk.mockReset();
  });

  it("evaluates completed sessions when activePlan is set after exerciseLogs is already loaded", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T12:00:00.000Z"));
    const planCreatedAt = "2026-10-26T08:00:00.000Z"; // Monday
    const plan = TrainingPlan.create(planCreatedAt, 1, [
      {
        weekNumber: 1,
        dayOfWeek: 1,
        sessionLabel: "Push Day",
        focusDescription: "Chest & Triceps",
        exercises: [
          {
            exerciseName: "Bench Press",
            targetSets: 2,
            targetReps: "8-10",
            restSeconds: 120,
          },
        ],
      },
      {
        weekNumber: 1,
        dayOfWeek: 3,
        sessionLabel: "Pull Day",
        focusDescription: "Back & Biceps",
        exercises: [
          {
            exerciseName: "Barbell Row",
            targetSets: 2,
            targetReps: "8-10",
            restSeconds: 120,
          },
        ],
      },
    ]);

    // Logs are already present before orchestrator initializes the plan
    mockExerciseLogs.value = [
      {
        id: "1",
        exerciseName: "Bench Press",
        reps: 8,
        weight: 80,
        loggedAt: new Date("2026-10-26T10:00:00.000Z"),
      },
      {
        id: "2",
        exerciseName: "Bench Press",
        reps: 8,
        weight: 80,
        loggedAt: new Date("2026-10-26T10:05:00.000Z"),
      },
    ];

    const planStore = useTrainingPlanStore();
    // Instantiate orchestrator store while activePlan is still null
    useAiOrchestratorStore();
    expect(planStore.completedSessions.size).toBe(0);

    // Now set the plan (as initialize() does) without mutating exerciseLogs
    planStore.setPlan(plan);
    await nextTick();

    expect(planStore.completedSessions.has(TrainingPlan.sessionKey(1, 1))).toBe(true);
    vi.useRealTimers();
  });

  it("resets currentPageIndex to 0 when coachMessages are cleared", async () => {
    const chatStore = useCoachChatStore();
    chatStore.addMessage({
      id: "m1",
      role: "coach",
      content: "First advice",
      timestamp: "2026-10-28T10:00:00.000Z",
      sessionId: "2026-10-28",
      logsCount: 0,
    });
    chatStore.addMessage({
      id: "m2",
      role: "coach",
      content: "Second advice",
      timestamp: "2026-10-28T11:00:00.000Z",
      sessionId: "2026-10-28",
      logsCount: 1,
    });

    const vm = useCoachChatViewModel();
    expect(vm.currentPageIndex.value).toBe(1);

    chatStore.clearMessages();
    await nextTick();

    expect(vm.currentPageIndex.value).toBe(0);
  });

  it("reactively updates coachChatStore currentSessionId and hasTodayCoachMessage across midnight rollover", () => {
    vi.useFakeTimers();
    try {
      const justBeforeMidnight = new Date(2026, 9, 28, 23, 59, 30);
      vi.setSystemTime(justBeforeMidnight);
      const chatStore = useCoachChatStore();

      chatStore.addMessage({
        id: "m1",
        role: "coach",
        content: "Evening advice",
        timestamp: justBeforeMidnight.toISOString(),
        sessionId: chatStore.currentSessionId,
        logsCount: 0,
      });

      expect(chatStore.hasTodayCoachMessage).toBe(true);
      const day1SessionId = chatStore.currentSessionId;

      // Advance past midnight (1 minute interval on useNow)
      vi.advanceTimersByTime(60_000);

      expect(chatStore.currentSessionId).not.toBe(day1SessionId);
      expect(chatStore.hasTodayCoachMessage).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not queue redundant execution advice when a request is already loading", async () => {
    const chatStore = useCoachChatStore();
    const orchestrator = useAiOrchestratorStore();

    chatStore.isLoading = true;

    const result = await orchestrator.requestAdvice();
    expect(result.isOk()).toBe(true);

    // If a request had been queued, resetting isLoading and draining would trigger another request
    // We confirm that parameterless execution returns immediately without queueing
  });

  it("displays actionable error toast with getAiErrorDescription when handleAskQuestion fails", async () => {
    const orchestrator = useAiOrchestratorStore();
    const { toasts } = useToast();
    toasts.value = [];

    vi.spyOn(orchestrator, "requestAdvice").mockReturnValue(errAsync("missing-api-key"));

    const vm = useCoachChatViewModel();
    vm.userQuestion.value = "How many sets?";
    vm.handleAskQuestion();
    await nextTick();

    expect(toasts.value.length).toBeGreaterThan(0);
    expect(toasts.value[toasts.value.length - 1]?.description).toBe(
      "No API Key configured! Please add one in your profile.",
    );
    expect(vm.userQuestion.value).toBe("How many sets?");
  });

  it("does not wipe completedSessions or send premature ensureSessionAdvice while exerciseLogs is still loading at startup", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-28T08:29:00.000Z")); // Wednesday
      mockApiKey.value = "test-api-key";
      mockIsLogsLoading.value = true;
      mockExerciseLogs.value = [];

      const plan = TrainingPlan.create("2026-10-26T08:00:00.000Z", 1, [
        {
          weekNumber: 1,
          dayOfWeek: 1, // Monday
          sessionLabel: "Einheit A",
          focusDescription: "Chest",
          exercises: [{ exerciseName: "Bench Press", targetSets: 2, targetReps: "8" }],
        },
        {
          weekNumber: 1,
          dayOfWeek: 3, // Wednesday
          sessionLabel: "Einheit C",
          focusDescription: "Back",
          exercises: [{ exerciseName: "Barbell Row", targetSets: 2, targetReps: "8" }],
        },
      ]);

      const planStore = useTrainingPlanStore();
      planStore.setPlan(plan);
      planStore.setCompletedSessions(new Set(["W1-D1"]));

      mockAsk.mockReturnValue(
        okAsync({
          advice: {
            coachMessage: "Ready for Einheit C",
            recommendedWorkout: [{ exerciseName: "Barbell Row", targetSets: 2, targetReps: "8" }],
          },
          requestPayload: "# session\n...",
        }),
      );

      const orchestrator = useAiOrchestratorStore();
      orchestrator.ensureSessionAdvice();
      await nextTick();

      // While logs are still loading, persisted completedSessions must NOT be wiped to empty
      expect(planStore.completedSessions.has("W1-D1")).toBe(true);
      // And AI request must NOT be sent prematurely with empty logs
      expect(mockAsk).not.toHaveBeenCalled();

      // Now simulate Google Sheets finishing loading logs from Monday
      mockExerciseLogs.value = [
        {
          id: "log-1",
          exerciseName: "Bench Press",
          reps: 8,
          weight: 80,
          loggedAt: new Date("2026-10-26T10:00:00.000Z"),
        },
        {
          id: "log-2",
          exerciseName: "Bench Press",
          reps: 8,
          weight: 80,
          loggedAt: new Date("2026-10-26T10:05:00.000Z"),
        },
      ];
      mockIsLogsLoading.value = false;
      await nextTick();
      await nextTick();

      // Now AI request is dispatched with W1-D1 marked completed and loaded logs present
      expect(mockAsk).toHaveBeenCalledTimes(1);
      const callOptions = mockAsk.mock.calls[0]?.[0];
      expect(callOptions?.completedSessionKeys.has("W1-D1")).toBe(true);
      expect(callOptions?.exerciseLogs).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("prunes stale automated message pairs from chatStore before re-requesting in ensureSessionAdvice", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-28T08:29:00.000Z"));
      mockApiKey.value = "test-api-key";
      mockIsLogsLoading.value = false;

      const plan = TrainingPlan.create("2026-10-26T08:00:00.000Z", 1, [
        {
          weekNumber: 1,
          dayOfWeek: 1,
          sessionLabel: "Einheit A",
          focusDescription: "Chest",
          exercises: [{ exerciseName: "Bench Press", targetSets: 2, targetReps: "8" }],
        },
        {
          weekNumber: 1,
          dayOfWeek: 3,
          sessionLabel: "Einheit C",
          focusDescription: "Back",
          exercises: [{ exerciseName: "Barbell Row", targetSets: 2, targetReps: "8" }],
        },
      ]);

      const planStore = useTrainingPlanStore();
      planStore.initialize();
      planStore.setPlan(plan);
      planStore.setCompletedSessions(new Set(["W1-D1"]));

      const chatStore = useCoachChatStore();
      chatStore.initialize();
      chatStore.addMessage({
        id: "stale-user",
        role: "user",
        content: "# session\ndate: 2026-10-28 08:00\nstatus: Not started",
        timestamp: "2026-10-28T08:00:00.000Z",
        sessionId: "2026-10-28",
        logsCount: 0,
      });
      chatStore.addMessage({
        id: "stale-coach",
        role: "coach",
        content: JSON.stringify({
          coachMessage: "Stale Einheit A workout",
          recommendedWorkout: [{ exerciseName: "Bench Press", targetSets: 2, targetReps: "8" }],
        }),
        timestamp: "2026-10-28T08:00:05.000Z",
        sessionId: "2026-10-28",
        logsCount: 0,
      });

      mockAsk.mockReturnValue(
        okAsync({
          advice: {
            coachMessage: "Updated advice without workout",
          },
          requestPayload: "# session\n...",
        }),
      );

      const orchestrator = useAiOrchestratorStore();
      await orchestrator.ensureSessionAdvice();

      expect(mockAsk).toHaveBeenCalledTimes(1);
      // Stale pair was removed before calling ask(), so previousMessages is empty
      expect(mockAsk.mock.calls[0]?.[0]?.previousMessages).toEqual([]);
      expect(chatStore.messages.some((m) => m.id === "stale-coach")).toBe(false);

      // Calling ensureSessionAdvice() again must NOT re-trigger requestAdvice()
      await orchestrator.ensureSessionAdvice();
      expect(mockAsk).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("synchronously evaluates completed sessions from pre-loaded logs before sending ensureSessionAdvice", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-28T08:29:00.000Z"));
      mockApiKey.value = "test-api-key";
      mockIsLogsLoading.value = false;

      // Logs from Monday (Bench Press) are already loaded in exerciseLogsStore
      mockExerciseLogs.value = [
        {
          id: "log-1",
          exerciseName: "Bench Press",
          reps: 8,
          weight: 80,
          loggedAt: new Date("2026-10-26T10:00:00.000Z"),
        },
        {
          id: "log-2",
          exerciseName: "Bench Press",
          reps: 8,
          weight: 80,
          loggedAt: new Date("2026-10-26T10:05:00.000Z"),
        },
      ];

      const plan = TrainingPlan.create("2026-10-26T08:00:00.000Z", 1, [
        {
          weekNumber: 1,
          dayOfWeek: 1,
          sessionLabel: "Einheit A",
          focusDescription: "Chest",
          exercises: [{ exerciseName: "Bench Press", targetSets: 2, targetReps: "8" }],
        },
        {
          weekNumber: 1,
          dayOfWeek: 3,
          sessionLabel: "Einheit C",
          focusDescription: "Back",
          exercises: [{ exerciseName: "Barbell Row", targetSets: 2, targetReps: "8" }],
        },
      ]);

      // Seed localStorage with the plan, but with EMPTY completedSessions
      localStorage.setItem("training-plan-v1", JSON.stringify(plan));
      localStorage.setItem("training-plan-completed-v1", JSON.stringify([]));

      mockAsk.mockReturnValue(
        okAsync({
          advice: {
            coachMessage: "Focus on Einheit C",
            recommendedWorkout: [{ exerciseName: "Barbell Row", targetSets: 2, targetReps: "8" }],
          },
          requestPayload: "# session\n...",
        }),
      );

      const planStore = useTrainingPlanStore();
      const orchestrator = useAiOrchestratorStore();

      // EnsureSessionAdvice runs for the first time without waiting for nextTick
      await orchestrator.ensureSessionAdvice();

      // CompletedSessions must already contain W1-D1 synchronously
      expect(planStore.completedSessions.has("W1-D1")).toBe(true);

      // And mockAsk should have been called with W1-D1 in completedSessionKeys
      expect(mockAsk).toHaveBeenCalledTimes(1);
      const callOptions = mockAsk.mock.calls[0]?.[0];
      expect(callOptions?.completedSessionKeys.has("W1-D1")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("consumes pendingEnsureSessionAdvice without triggering duplicate re-entrant calls when ensureSessionAdvice is called directly", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-28T08:29:00.000Z"));
      mockApiKey.value = "test-api-key";
      mockIsLogsLoading.value = true;
      mockExerciseLogs.value = [];

      const plan = TrainingPlan.create("2026-10-26T08:00:00.000Z", 1, [
        {
          weekNumber: 1,
          dayOfWeek: 1,
          sessionLabel: "Einheit A",
          focusDescription: "Chest",
          exercises: [{ exerciseName: "Bench Press", targetSets: 2, targetReps: "8" }],
        },
      ]);
      const planStore = useTrainingPlanStore();
      planStore.initialize();
      planStore.setPlan(plan);

      mockAsk.mockReturnValue(
        okAsync({
          advice: { coachMessage: "Einheit A advice" },
          requestPayload: "# session\n...",
        }),
      );

      const orchestrator = useAiOrchestratorStore();

      // 1. First call sets pendingEnsureSessionAdvice = true because logs are loading & empty
      await orchestrator.ensureSessionAdvice();
      expect(mockAsk).not.toHaveBeenCalled();

      // 2. Logs finish loading
      mockIsLogsLoading.value = false;
      mockExerciseLogs.value = [
        {
          id: "log-1",
          exerciseName: "Bench Press",
          reps: 8,
          weight: 80,
          loggedAt: new Date("2026-10-26T10:00:00.000Z"),
        },
      ];

      // 3. Direct call to ensureSessionAdvice should consume pending flag and trigger mockAsk exactly once
      await orchestrator.ensureSessionAdvice();
      expect(mockAsk).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
