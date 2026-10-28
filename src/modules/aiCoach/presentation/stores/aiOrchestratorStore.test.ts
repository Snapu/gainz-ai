import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { TrainingPlan } from "@/modules/aiCoach/domain";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";

const mockExerciseLogs = ref<ExerciseLog[]>([]);
const mockLearnedMap = ref({});

vi.mock("@/modules/trainingLogs/presentation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/trainingLogs/presentation")>();
  return {
    ...actual,
    useExerciseLogsStore: () => ({
      get exerciseLogs() {
        return mockExerciseLogs.value;
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
    apiKey: null,
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
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    mockExerciseLogs.value = [];
  });

  it("evaluates completed sessions when activePlan is set after exerciseLogs is already loaded", async () => {
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
});
