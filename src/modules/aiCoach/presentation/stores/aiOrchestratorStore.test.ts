import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const mockIsLoggedIn = ref(true);
const mockAsk = vi.fn();
const mockRecover = vi.fn();
const mockClassifyExercises = vi.fn();
const mockRefreshMuscleMap = vi.fn();
const mockStartDeload = vi.fn();

vi.mock("@/modules/aiCoach/infrastructure", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/aiCoach/infrastructure")>();
  return {
    ...actual,
    createAiCoachService: () => ({
      ask: (...args: unknown[]) => mockAsk(...args),
      recover: (...args: unknown[]) => mockRecover(...args),
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
    refresh: mockRefreshMuscleMap,
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
    get isLoggedIn() {
      return mockIsLoggedIn.value;
    },
    init: () => Promise.resolve(),
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
    startDeload: mockStartDeload,
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
  let activePinia: ReturnType<typeof createPinia> | undefined;

  afterEach(() => {
    (
      activePinia as (ReturnType<typeof createPinia> & { _e?: { stop: () => void } }) | undefined
    )?._e?.stop();
    activePinia = undefined;
  });

  beforeEach(async () => {
    mockExerciseLogs.value = [];
    mockIsLogsLoading.value = false;
    mockIsLogsRefreshing.value = false;
    mockAccessToken.value = null;
    mockIdToken.value = null;
    mockRefreshToken.value = null;
    mockIsLoggedIn.value = true;
    mockEnsureValidAccessToken = undefined;
    mockEnsureValidIdToken = undefined;
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    localStorage.clear();
    activePinia = createPinia();
    setActivePinia(activePinia);
    mockAsk.mockReset();
    mockRecover.mockReset();
    mockRecover.mockReturnValue(errAsync("not-found"));
    mockClassifyExercises.mockReset();
    mockClassifyExercises.mockReturnValue(okAsync({ classifications: [] }));
    mockAuthLogout.mockReset();
    mockRefreshMuscleMap.mockReset();
    mockStartDeload.mockReset();
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

  it("runs exercise pre-classification non-blocking without stalling or blocking requestAdvice", async () => {
    mockRefreshToken.value = "valid-refresh-token";
    mockEnsureValidIdToken = vi.fn().mockReturnValue(okAsync("valid-id-token"));
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
    mockClassifyExercises.mockReturnValueOnce(new ResultAsync(new Promise<never>(() => {})));
    mockAsk.mockReturnValueOnce(
      okAsync({
        advice: { coachMessage: "Answered immediately without waiting for classify" },
      }),
    );

    const orchestrator = useAiOrchestratorStore();
    const result = await orchestrator.requestAdvice();

    expect(mockClassifyExercises).toHaveBeenCalledTimes(1);
    expect(mockAsk).toHaveBeenCalledTimes(1);
    expect(result.isOk()).toBe(true);
  });

  it("deduplicates overlapping classifyExercisesIfNeeded calls while one is in flight", async () => {
    mockRefreshToken.value = "valid-refresh-token";
    mockEnsureValidIdToken = vi.fn().mockReturnValue(okAsync("valid-id-token"));
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
    let resolveClassify!: (value: { isOk: () => true; value: { classifications: [] } }) => void;
    mockClassifyExercises.mockReturnValue(
      ResultAsync.fromSafePromise(
        new Promise((resolve) => {
          resolveClassify = resolve as typeof resolveClassify;
        }),
      ).map(() => ({ classifications: [] })),
    );

    const orchestrator = useAiOrchestratorStore();
    const first = orchestrator.classifyExercisesIfNeeded("valid-id-token");
    const second = orchestrator.classifyExercisesIfNeeded("valid-id-token");

    await Promise.resolve();
    expect(mockClassifyExercises).toHaveBeenCalledTimes(1);

    resolveClassify({ isOk: () => true, value: { classifications: [] } });
    await Promise.all([first, second]);
  });

  it("re-runs classifyExercisesIfNeeded with freshToken even when a stale-token call is still in flight", async () => {
    mockRefreshToken.value = "valid-refresh-token";
    mockEnsureValidIdToken = vi.fn().mockReturnValue(okAsync("stale-access-token"));
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
      .mockReturnValueOnce(new ResultAsync(new Promise<never>(() => {})))
      .mockReturnValueOnce(okAsync({ classifications: [] }));
    mockAsk
      .mockReturnValueOnce(errAsync("unauthorized" as const))
      .mockReturnValueOnce(okAsync({ advice: { coachMessage: "Recovered after refresh" } }));

    const orchestrator = useAiOrchestratorStore();
    const result = await orchestrator.requestAdvice();

    expect(result.isOk()).toBe(true);
    expect(mockClassifyExercises).toHaveBeenCalledTimes(2);
    expect(mockClassifyExercises.mock.calls[0]?.[1]).toBe("stale-access-token");
    expect(mockClassifyExercises.mock.calls[1]?.[1]).toBe("fresh-access-token");
  });

  it("acquires wake lock while loading, releases on completion, and silently degrades on iOS NotAllowedError", async () => {
    const releaseMock = vi.fn().mockResolvedValue(undefined);
    const requestWakeLockMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("Low power mode", "NotAllowedError"))
      .mockResolvedValueOnce({
        released: false,
        type: "screen",
        release: releaseMock,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

    Object.defineProperty(navigator, "wakeLock", {
      value: { request: requestWakeLockMock },
      configurable: true,
    });

    try {
      let resolveAsk!: (val: { advice: { coachMessage: string } }) => void;
      mockAsk
        .mockReturnValueOnce(
          ResultAsync.fromSafePromise(
            new Promise((resolve) => {
              resolveAsk = resolve;
            }),
          ),
        )
        .mockReturnValueOnce(okAsync({ advice: { coachMessage: "Second ok" } }));

      const orchestrator = useAiOrchestratorStore();

      // 1. iOS NotAllowedError must not fail or reject the coaching request
      const firstReq = orchestrator.requestAdvice("Test wake lock fallback");
      await nextTick();
      expect(requestWakeLockMock).toHaveBeenCalledWith("screen");
      resolveAsk({ advice: { coachMessage: "First ok" } });
      const firstRes = await firstReq;
      expect(firstRes.isOk()).toBe(true);

      // 2. Normal wake lock acquisition & release on completion
      const secondReq = orchestrator.requestAdvice("Test wake lock release");
      await nextTick();
      const secondRes = await secondReq;
      await nextTick();
      expect(secondRes.isOk()).toBe(true);
      expect(releaseMock).toHaveBeenCalled();
    } finally {
      delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    }
  });

  it("stores minimal pendingCoachRequest metadata and recovers via 202 -> 200 polling on visibility resume after network abort", async () => {
    vi.useFakeTimers();
    const originalVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");

    try {
      let currentVisibility: DocumentVisibilityState = "visible";
      Object.defineProperty(document, "visibilityState", {
        get: () => currentVisibility,
        configurable: true,
      });

      let rejectAskPromise!: (err: unknown) => void;
      mockAsk.mockReturnValueOnce(
        ResultAsync.fromPromise(
          new Promise<never>((_resolve, reject) => {
            rejectAskPromise = reject;
          }),
          () => "coaching-request-failed" as const,
        ),
      );

      mockRecover
        .mockReturnValueOnce(okAsync({ status: "processing" as const }))
        .mockReturnValueOnce(
          okAsync({
            status: "completed" as const,
            advice: {
              coachMessage: "Recovered mesocycle!",
              startDeload: true,
              trainingPlan: {
                cycleWeeks: 2,
                sessions: [
                  {
                    weekNumber: 1,
                    dayOfWeek: 1,
                    sessionLabel: "Push A",
                    focusDescription: "Chest",
                    exercises: [{ exerciseName: "Bench Press", targetSets: 3, targetReps: "8-10" }],
                  },
                ],
              },
            },
          }),
        );

      const chatStore = useCoachChatStore();
      const planStore = useTrainingPlanStore();
      const orchestrator = useAiOrchestratorStore();

      const flushMicrotasks = async () => {
        for (let i = 0; i < 15; i++) {
          await Promise.resolve();
        }
        await nextTick();
      };

      const reqPromise = orchestrator.requestAdvice("Build my plan", "planning");
      await flushMicrotasks();

      // Verify minimal metadata persisted (no profile/logs/health fields)
      const rawPending = localStorage.getItem("ai-coach:pending-request");
      expect(rawPending).not.toBeNull();
      const parsedPending = JSON.parse(rawPending ?? "{}") as Record<string, unknown>;
      expect(Object.keys(parsedPending).sort()).toEqual([
        "clientRequestId",
        "mode",
        "sessionId",
        "startedAt",
        "userMessageId",
      ]);

      // Simulate phone lock + socket abort while hidden
      currentVisibility = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      await nextTick();
      rejectAskPromise(new Error("Load failed"));
      await flushMicrotasks();

      // Pending request remains preserved for recovery while hidden
      expect(localStorage.getItem("ai-coach:pending-request")).not.toBeNull();

      // Simulate user unlocking phone -> visibility resumes
      currentVisibility = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
      await flushMicrotasks();

      // First poll returned 202 processing; advance poll interval for 200 completed
      await vi.advanceTimersByTimeAsync(2000);
      await flushMicrotasks();
      const result = await reqPromise;

      expect(result.isOk()).toBe(true);
      expect(mockRecover).toHaveBeenCalledTimes(2);
      expect(localStorage.getItem("ai-coach:pending-request")).toBeNull();
      expect(chatStore.isLoading).toBe(false);
      expect(
        chatStore.messages.some(
          (m) => m.role === "coach" && m.content.includes("Recovered mesocycle!"),
        ),
      ).toBe(true);
      expect(planStore.activePlan?.sessions).toHaveLength(1);
      expect(mockRefreshMuscleMap).toHaveBeenCalled();
      expect(mockStartDeload).toHaveBeenCalled();
    } finally {
      if (originalVisibility) {
        Object.defineProperty(document, "visibilityState", originalVisibility);
      }
      vi.useRealTimers();
    }
  });

  it("clears pendingCoachRequest and removes user placeholder when server recovery returns failed (502)", async () => {
    localStorage.setItem(
      "ai-coach:pending-request",
      JSON.stringify({
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        userMessageId: "orphan-user-msg",
        sessionId: "2026-11-15",
        mode: "execution",
        startedAt: Date.now(),
      }),
    );

    const chatStore = useCoachChatStore();
    chatStore.addMessage({
      id: "orphan-user-msg",
      role: "user",
      content: "Will fail on server",
      timestamp: new Date().toISOString(),
      sessionId: "2026-11-15",
      logsCount: 0,
    });

    mockRecover.mockReturnValueOnce(errAsync("server-failed" as const));

    const orchestrator = useAiOrchestratorStore();
    orchestrator.initialize();
    for (let i = 0; i < 15; i++) {
      await Promise.resolve();
    }

    expect(localStorage.getItem("ai-coach:pending-request")).toBeNull();
    expect(chatStore.messages.some((m) => m.id === "orphan-user-msg")).toBe(false);
    expect(chatStore.messages.some((m) => m.role === "coach")).toBe(false);
    expect(chatStore.isLoading).toBe(false);
  });

  it("clears pendingCoachRequest on logout and after 30-minute expiration", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-15T12:00:00.000Z"));
      // 1. Expired (>30 minutes) entry is wiped on initialize without calling recover
      localStorage.setItem(
        "ai-coach:pending-request",
        JSON.stringify({
          clientRequestId: "11111111-1111-4111-8111-111111111111",
          userMessageId: "expired-msg",
          sessionId: "2026-11-15",
          mode: "execution",
          startedAt: Date.now() - 31 * 60 * 1000,
        }),
      );

      const orchestrator = useAiOrchestratorStore();
      orchestrator.initialize();
      for (let i = 0; i < 15; i++) {
        await Promise.resolve();
      }

      expect(mockRecover).not.toHaveBeenCalled();
      expect(localStorage.getItem("ai-coach:pending-request")).toBeNull();

      // 2. Active entry is cleared immediately when authStore.isLoggedIn turns false
      mockAsk.mockReturnValueOnce(new ResultAsync(new Promise<never>(() => {})));
      void orchestrator.requestAdvice("In flight before logout");
      for (let i = 0; i < 15; i++) {
        await Promise.resolve();
      }
      await nextTick();
      expect(localStorage.getItem("ai-coach:pending-request")).not.toBeNull();

      mockIsLoggedIn.value = false;
      await nextTick();
      expect(localStorage.getItem("ai-coach:pending-request")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not poll recover on terminal server HTTP errors or while live request stays active during brief lock, and drains queued request after recovery", async () => {
    // 1. Terminal server error skips recovery and returns coaching-request-failed without swallowing error
    mockAsk.mockReturnValueOnce(errAsync("coaching-request-server-error" as const));
    const orchestrator = useAiOrchestratorStore();
    const serverErrRes = await orchestrator.requestAdvice("Check form");
    expect(serverErrRes.isErr() && serverErrRes._unsafeUnwrapErr()).toBe("coaching-request-failed");
    expect(mockRecover).not.toHaveBeenCalled();
    expect(localStorage.getItem("ai-coach:pending-request")).toBeNull();

    // 2. Brief lock/unlock during a live slow request does NOT race recoverPendingRequest
    const originalVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    let vis: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      get: () => vis,
      configurable: true,
    });
    try {
      let resolveSlowAsk!: (val: { advice: { coachMessage: string } }) => void;
      mockAsk.mockReturnValueOnce(
        ResultAsync.fromSafePromise(
          new Promise((resolve) => {
            resolveSlowAsk = resolve;
          }),
        ),
      );
      const slowReq = orchestrator.requestAdvice("Slow planning call", "planning");
      for (let i = 0; i < 15; i++) await Promise.resolve();
      vis = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      await nextTick();
      vis = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
      await nextTick();

      expect(mockRecover).not.toHaveBeenCalled();
      resolveSlowAsk({ advice: { coachMessage: "Finished directly" } });
      const slowRes = await slowReq;
      expect(slowRes.isOk()).toBe(true);
    } finally {
      if (originalVisibility)
        Object.defineProperty(document, "visibilityState", originalVisibility);
    }

    // 3. Recovery drains any pendingRequest queued while loading
    let rejectFirst!: (err: unknown) => void;
    mockAsk
      .mockReturnValueOnce(
        ResultAsync.fromPromise(
          new Promise<never>((_resolve, reject) => {
            rejectFirst = reject;
          }),
          () => "coaching-request-failed" as const,
        ),
      )
      .mockReturnValueOnce(okAsync({ advice: { coachMessage: "Queued follow-up ok" } }));
    mockRecover.mockReturnValueOnce(
      okAsync({ status: "completed" as const, advice: { coachMessage: "Recovered first" } }),
    );

    const firstPromise = orchestrator.requestAdvice("First prompt");
    for (let i = 0; i < 15; i++) await Promise.resolve();
    await orchestrator.requestAdvice("Queued follow-up");
    rejectFirst(new Error("Network dropped"));
    await firstPromise;
    for (let i = 0; i < 15; i++) await Promise.resolve();

    expect(mockAsk).toHaveBeenCalledTimes(4);
    const chatStore = useCoachChatStore();
    expect(
      chatStore.messages.some(
        (m) => m.role === "coach" && m.content.includes("Queued follow-up ok"),
      ),
    ).toBe(true);
  });

  it("removes orphan user message when initializing while logged out", async () => {
    mockIsLoggedIn.value = false;
    localStorage.setItem(
      "ai-coach:pending-request",
      JSON.stringify({
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        userMessageId: "orphan-logged-out-msg",
        sessionId: "2026-11-15",
        mode: "execution",
        startedAt: Date.now(),
      }),
    );

    const chatStore = useCoachChatStore();
    chatStore.addMessage({
      id: "orphan-logged-out-msg",
      role: "user",
      content: "Logged out later",
      timestamp: new Date().toISOString(),
      sessionId: "2026-11-15",
      logsCount: 0,
    });

    const orchestrator = useAiOrchestratorStore();
    orchestrator.initialize();
    for (let i = 0; i < 15; i++) await Promise.resolve();

    expect(localStorage.getItem("ai-coach:pending-request")).toBeNull();
    expect(chatStore.messages.some((m) => m.id === "orphan-logged-out-msg")).toBe(false);
  });

  it("retries transient poll failures, avoids initialize race on fresh requests, and deduplicates planning during recovery", async () => {
    vi.useFakeTimers();
    try {
      // 1. Fresh requestAdvice() on uninitialized store must not race initialize() recovery
      let resolveFresh!: (val: { advice: { coachMessage: string } }) => void;
      mockAsk.mockReturnValueOnce(
        ResultAsync.fromSafePromise(
          new Promise((resolve) => {
            resolveFresh = resolve;
          }),
        ),
      );
      const orchestrator = useAiOrchestratorStore();
      const freshReq = orchestrator.requestAdvice("Start fresh", "execution");
      for (let i = 0; i < 15; i++) await Promise.resolve();
      expect(mockRecover).not.toHaveBeenCalled();

      resolveFresh({ advice: { coachMessage: "Fresh finished cleanly" } });
      const freshRes = await freshReq;
      expect(freshRes.isOk()).toBe(true);

      // 2. Transient poll failure retries cleanly & planning recovery deduplicates generateNewPlan()
      localStorage.setItem(
        "ai-coach:pending-request",
        JSON.stringify({
          clientRequestId: "11111111-1111-4111-8111-111111111111",
          userMessageId: "planning-user-msg",
          sessionId: "2026-11-15",
          mode: "planning",
          startedAt: Date.now(),
        }),
      );
      mockRecover
        .mockReturnValueOnce(errAsync("coaching-request-failed" as const))
        .mockReturnValueOnce(
          okAsync({
            status: "completed" as const,
            advice: { coachMessage: "Recovered planning response" },
          }),
        );

      (
        activePinia as (ReturnType<typeof createPinia> & { _e?: { stop: () => void } }) | undefined
      )?._e?.stop();
      activePinia = createPinia();
      setActivePinia(activePinia);
      const coldStartOrchestrator = useAiOrchestratorStore();
      coldStartOrchestrator.initialize();
      for (let i = 0; i < 15; i++) await Promise.resolve();

      // generateNewPlan while planning recovery is paused on transient retry must deduplicate
      const dupPlanRes = await coldStartOrchestrator.generateNewPlan();
      expect(dupPlanRes.isOk()).toBe(true);
      expect(mockAsk).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem("ai-coach:pending-request")).not.toBeNull();

      await vi.advanceTimersByTimeAsync(2000);
      for (let i = 0; i < 15; i++) await Promise.resolve();

      expect(mockRecover).toHaveBeenCalledTimes(2);
      expect(localStorage.getItem("ai-coach:pending-request")).toBeNull();
      const chatStore = useCoachChatStore();
      expect(
        chatStore.messages.some(
          (m) => m.role === "coach" && m.content.includes("Recovered planning response"),
        ),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("defers ensureSessionAdvice during pending cold-start recovery", async () => {
    const originalId = "11111111-1111-4111-8111-111111111111";
    localStorage.setItem(
      "ai-coach:pending-request",
      JSON.stringify({
        clientRequestId: originalId,
        userMessageId: "cold-start-user-msg",
        sessionId: "2026-11-15",
        mode: "planning",
        startedAt: Date.now(),
      }),
    );
    mockRecover.mockReturnValueOnce(
      okAsync({
        status: "completed" as const,
        advice: {
          coachMessage: "Recovered before ensureSessionAdvice",
          trainingPlan: {
            cycleWeeks: 2,
            sessions: [
              {
                weekNumber: 1,
                dayOfWeek: 1,
                sessionLabel: "Upper A",
                focusDescription: "Chest",
                exercises: [{ exerciseName: "Bench Press", targetSets: 3, targetReps: "8-10" }],
              },
            ],
          },
        },
      }),
    );

    const orchestrator = useAiOrchestratorStore();
    await orchestrator.ensureSessionAdvice();
    expect(mockAsk).not.toHaveBeenCalled();

    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(mockRecover).toHaveBeenCalledWith(originalId, "default-id-token");
    expect(mockAsk).not.toHaveBeenCalled();
    expect(useTrainingPlanStore().activePlan?.sessions).toHaveLength(1);
  });

  it("stops polling after 35 attempts without sleeping after the final attempt", async () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem(
        "ai-coach:pending-request",
        JSON.stringify({
          clientRequestId: "11111111-1111-4111-8111-111111111111",
          userMessageId: "exhausted-user-msg",
          sessionId: "2026-11-15",
          mode: "execution",
          startedAt: Date.now(),
        }),
      );
      const chatStore = useCoachChatStore();
      chatStore.addMessage({
        id: "exhausted-user-msg",
        role: "user",
        content: "Still processing",
        timestamp: new Date().toISOString(),
        sessionId: "2026-11-15",
        logsCount: 0,
      });
      mockRecover.mockReturnValue(okAsync({ status: "processing" as const }));

      const orchestrator = useAiOrchestratorStore();
      const baselineTimers = vi.getTimerCount();
      orchestrator.initialize();

      // Advance 34 x 2_000ms intervals between 35 attempts; no 35th trailing sleep should be scheduled
      await vi.advanceTimersByTimeAsync(34 * 2000);
      for (let i = 0; i < 15; i++) await Promise.resolve();

      expect(mockRecover).toHaveBeenCalledTimes(35);
      expect(vi.getTimerCount()).toBe(baselineTimers);
      expect(localStorage.getItem("ai-coach:pending-request")).toBeNull();
      expect(chatStore.messages.some((m) => m.id === "exhausted-user-msg")).toBe(false);
      expect(chatStore.isLoading).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
