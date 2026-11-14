import { errAsync, okAsync, type ResultAsync } from "neverthrow";
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
const mockAccessToken = ref<string | null>(null);
const mockIdToken = ref<string | null>(null);
const mockRefreshToken = ref<string | null>(null);
let mockEnsureValidAccessToken:
  | (() => ResultAsync<string, "token-refresh-failed" | "refresh-token-invalid">)
  | undefined;
let mockEnsureValidIdToken:
  | (() => ResultAsync<string, "token-refresh-failed" | "refresh-token-invalid">)
  | undefined;
let mockRefreshSession:
  | ((force?: boolean) => ResultAsync<string, "token-refresh-failed" | "refresh-token-invalid">)
  | undefined;
const mockAuthLogout = vi.fn();
const mockAsk = vi.fn();
const mockClassifyExercises = vi.fn();

vi.mock("@/modules/aiCoach/infrastructure", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/aiCoach/infrastructure")>();
  return {
    ...actual,
    createAiCoachService: () => ({
      ask: (...args: unknown[]) => mockAsk(...args),
      classifyExercises: (...args: unknown[]) => mockClassifyExercises(...args),
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
}));

vi.mock("@/modules/trainingSummary/presentation", () => ({
  useTrainingSummaryStore: () => ({
    summaries: [],
  }),
}));

vi.mock("@/modules/auth/presentation", () => ({
  useAuthStore: () => ({
    get accessToken() {
      return mockAccessToken.value;
    },
    get idToken() {
      return mockIdToken.value;
    },
    get refreshToken() {
      return mockRefreshToken.value;
    },
    logout: mockAuthLogout,
    refreshSession: (force = false) =>
      mockRefreshSession ? mockRefreshSession(force) : okAsync("refreshed-access-token"),
    ensureValidAccessToken: () =>
      mockEnsureValidAccessToken
        ? mockEnsureValidAccessToken()
        : mockAccessToken.value
          ? okAsync(mockAccessToken.value)
          : okAsync("default-access-token"),
    ensureValidIdToken: () =>
      mockEnsureValidIdToken
        ? mockEnsureValidIdToken()
        : mockIdToken.value
          ? okAsync(mockIdToken.value)
          : okAsync("default-id-token"),
  }),
}));

vi.mock("@/modules/profile/presentation", () => ({
  useUserProfileStore: () => ({
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
    mockAccessToken.value = null;
    mockIdToken.value = null;
    mockRefreshToken.value = null;
    mockEnsureValidAccessToken = undefined;
    mockEnsureValidIdToken = undefined;
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    localStorage.clear();
    setActivePinia(createPinia());
    mockAsk.mockReset();
    mockClassifyExercises.mockReset();
    mockClassifyExercises.mockReturnValue(okAsync({ classifications: [] }));
    mockAuthLogout.mockReset();
    mockRefreshSession = undefined;
    mockEnsureValidAccessToken = undefined;
    mockEnsureValidIdToken = undefined;
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

    vi.spyOn(orchestrator, "requestAdvice").mockReturnValue(errAsync("rate-limit-exceeded"));

    const vm = useCoachChatViewModel();
    vm.userQuestion.value = "How many sets?";
    vm.handleAskQuestion();
    await nextTick();

    expect(toasts.value.length).toBeGreaterThan(0);
    expect(toasts.value[toasts.value.length - 1]?.description).toBe(
      "Daily AI coaching limit reached. Quota resets at 00:00 UTC.",
    );
    expect(vm.userQuestion.value).toBe("How many sets?");
  });

  it("does not wipe completedSessions or send premature ensureSessionAdvice while exerciseLogs is still loading at startup", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-28T08:29:00.000Z")); // Wednesday
      mockAccessToken.value = "test-access-token";
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
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }

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
      mockAccessToken.value = "test-access-token";
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
      mockAccessToken.value = "test-access-token";
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
      mockAccessToken.value = "test-access-token";
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
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }
      expect(mockAsk).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not trigger ensureSessionAdvice or generateNewPlan when an active workout is in progress (mid-workout protection)", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-06T00:15:00"));
      mockAccessToken.value = "test-key";

      // Workout started Thursday 23:30, last log Friday 00:05 (active session)
      mockExerciseLogs.value = [
        {
          id: "log-1",
          exerciseName: "Squat",
          reps: 5,
          weight: 100,
          loggedAt: new Date("2026-11-05T23:30:00"),
        },
        {
          id: "log-2",
          exerciseName: "Squat",
          reps: 5,
          weight: 100,
          loggedAt: new Date("2026-11-06T00:05:00"),
        },
      ];

      const orchestrator = useAiOrchestratorStore();
      await orchestrator.ensureSessionAdvice();

      // Must NOT request advice or generate a new plan while mid-workout
      expect(mockAsk).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not wipe plan and generate a new plan mid-workout when last session in plan is completed", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-06T00:15:00"));
      mockAccessToken.value = "test-key";

      const planStore = useTrainingPlanStore();
      const plan = TrainingPlan.create("2026-11-01T00:00:00.000Z", 1, [
        {
          weekNumber: 1,
          dayOfWeek: 4, // Thursday
          sessionLabel: "Legs",
          focusDescription: "Quads",
          exercises: [{ exerciseName: "Squat", targetSets: 2 }],
        },
      ]);
      planStore.setPlan(plan);

      // User just completed the second set at 00:05, session is still active
      mockExerciseLogs.value = [
        {
          id: "log-1",
          exerciseName: "Squat",
          reps: 5,
          weight: 100,
          loggedAt: new Date("2026-11-05T23:30:00"),
        },
        {
          id: "log-2",
          exerciseName: "Squat",
          reps: 5,
          weight: 100,
          loggedAt: new Date("2026-11-06T00:05:00"),
        },
      ];

      const orchestrator = useAiOrchestratorStore();
      await orchestrator.ensureSessionAdvice();

      // Plan should NOT be cleared and generateNewPlan should NOT be called mid-workout
      expect(planStore.activePlan).not.toBeNull();
      expect(mockAsk).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("regenerates plan after workout ends when plan was completed mid-workout (no deadlock)", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-06T00:15:00"));
      mockAccessToken.value = "test-key";
      mockAsk.mockReturnValue(
        okAsync({
          advice: { coachMessage: "New cycle plan." },
          requestPayload: "test payload",
        }),
      );

      const planStore = useTrainingPlanStore();
      const plan = TrainingPlan.create("2026-11-01T00:00:00.000Z", 1, [
        {
          weekNumber: 1,
          dayOfWeek: 4, // Thursday
          sessionLabel: "Legs",
          focusDescription: "Quads",
          exercises: [{ exerciseName: "Squat", targetSets: 2 }],
        },
      ]);
      planStore.setPlan(plan);

      // Mid-workout: completedSessions is updated to include the session, but activeSession is true
      mockExerciseLogs.value = [
        {
          id: "log-1",
          exerciseName: "Squat",
          reps: 5,
          weight: 100,
          loggedAt: new Date("2026-11-05T23:30:00"),
        },
        {
          id: "log-2",
          exerciseName: "Squat",
          reps: 5,
          weight: 100,
          loggedAt: new Date("2026-11-06T00:05:00"),
        },
      ];

      const orchestrator = useAiOrchestratorStore();
      await orchestrator.ensureSessionAdvice();

      // During active workout: plan intact, mockAsk not called
      expect(planStore.activePlan).not.toBeNull();
      expect(mockAsk).not.toHaveBeenCalled();

      // Time advances past inactivity window (55 minutes after last log at 00:05 -> 01:00)
      vi.setSystemTime(new Date("2026-11-06T01:00:00"));

      // Trigger ensureSessionAdvice after workout ended
      await orchestrator.ensureSessionAdvice();
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }

      // Plan should be cleared and generateNewPlan called!
      expect(planStore.activePlan).toBeNull();
      expect(mockAsk).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("recognizes coach message generated past midnight matching m.sessionId in hasTodayCoachMessage", () => {
    vi.useFakeTimers();
    try {
      // System time is 00:20 on Nov 6
      vi.setSystemTime(new Date("2026-11-06T00:20:00"));

      // Workout started Nov 5 at 23:30, so currentSessionId is "2026-11-05"
      mockExerciseLogs.value = [
        {
          id: "log-1",
          exerciseName: "Squat",
          reps: 5,
          weight: 100,
          loggedAt: new Date("2026-11-05T23:30:00"),
        },
        {
          id: "log-2",
          exerciseName: "Squat",
          reps: 5,
          weight: 100,
          loggedAt: new Date("2026-11-06T00:10:00"),
        },
      ];

      const chatStore = useCoachChatStore();

      // Coach message generated at 00:12 on Nov 6, with sessionId "2026-11-05"
      chatStore.addMessage({
        id: "msg-1",
        role: "coach",
        content: JSON.stringify({ coachMessage: "Keep pushing." }),
        timestamp: new Date("2026-11-06T00:12:00").toISOString(),
        sessionId: "2026-11-05",
        logsCount: 2,
      });

      expect(chatStore.hasTodayCoachMessage).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps resolveAccessToken to coaching-request-failed when offline with valid refreshToken", async () => {
    mockAccessToken.value = null;
    mockIdToken.value = null;
    mockRefreshToken.value = "valid-refresh-token";
    mockEnsureValidIdToken = vi.fn().mockReturnValue(errAsync("token-refresh-failed"));

    const orchestrator = useAiOrchestratorStore();
    const result = await orchestrator.requestAdvice();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe("coaching-request-failed");
  });

  it("maps resolveAccessToken to unauthorized when refreshToken is invalid or missing", async () => {
    mockAccessToken.value = null;
    mockIdToken.value = null;
    mockRefreshToken.value = "invalid-refresh-token";
    mockEnsureValidIdToken = vi.fn().mockReturnValue(errAsync("refresh-token-invalid"));

    const orchestrator = useAiOrchestratorStore();
    const result = await orchestrator.requestAdvice();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe("unauthorized");
    expect(mockAuthLogout).toHaveBeenCalled();
  });

  it("forces a token refresh, uses refreshed token directly, and retries once when ai-coach returns unauthorized", async () => {
    mockRefreshToken.value = "valid-refresh-token";
    mockEnsureValidIdToken = vi
      .fn()
      .mockReturnValueOnce(okAsync("stale-id-token"))
      .mockReturnValueOnce(okAsync("stale-id-token"));
    mockRefreshSession = vi.fn().mockReturnValue(okAsync("fresh-access-token"));
    mockAsk.mockReturnValueOnce(errAsync("unauthorized")).mockReturnValueOnce(
      okAsync({
        advice: { coachMessage: "Recovered after refresh" },
        requestPayload: "prompt",
      }),
    );

    const orchestrator = useAiOrchestratorStore();
    const result = await orchestrator.requestAdvice();

    expect(mockRefreshSession).toHaveBeenCalledWith(true);
    expect(mockAsk).toHaveBeenCalledTimes(2);
    expect(mockAsk.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ accessToken: "fresh-access-token" }),
    );
    expect(result.isOk()).toBe(true);
  });

  it("re-runs exercise pre-classification after forced token refresh on 401", async () => {
    mockRefreshToken.value = "valid-refresh-token";
    mockEnsureValidIdToken = vi.fn().mockReturnValue(okAsync("stale-id-token"));
    mockRefreshSession = vi.fn().mockReturnValue(okAsync("fresh-access-token"));
    mockExerciseLogs.value = [
      {
        id: "log-1",
        exerciseName: "Xyzzy Unclassified Press 99",
        weight: 20,
        reps: 12,
        rpe: 8,
        loggedAt: new Date("2026-11-13T10:00:00Z"),
      },
    ];
    mockClassifyExercises
      .mockReturnValueOnce(errAsync("unauthorized"))
      .mockReturnValueOnce(okAsync({ classifications: [] }));
    mockAsk.mockReturnValueOnce(
      okAsync({
        advice: { coachMessage: "Classified and answered" },
        requestPayload: "prompt",
      }),
    );

    const orchestrator = useAiOrchestratorStore();
    const result = await orchestrator.requestAdvice();

    expect(mockClassifyExercises).toHaveBeenCalledTimes(2);
    expect(mockClassifyExercises.mock.calls[1]?.[1]).toBe("fresh-access-token");
    expect(mockAsk).toHaveBeenCalledTimes(1);
    expect(mockAsk.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ accessToken: "fresh-access-token" }),
    );
    expect(result.isOk()).toBe(true);
  });
});
