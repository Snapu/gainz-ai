import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import type { MuscleGroupInsight } from "@/modules/trainingInsights/presentation";

const evaluateInsightMock = vi.fn();
const classifyExercisesIfNeededMock = vi.fn();

const mockMuscleGroups = ref<Record<string, MuscleGroupInsight | undefined>>({
  Chest: {
    sets: 12,
    directSets: 12,
    isoWeekSets: 12,
    isoWeekDirectSets: 12,
    landmark: "at_MAV",
    trendStatus: "improving",
    volumeTrend: "up",
    frequencyPerWeek: 2,
    hoursSinceLastTrained: 24,
    recoveryHours: 48,
    recoveryReady: false,
  },
});

const mockMetricsLoading = ref(true);

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/modules/aiCoach/presentation", () => ({
  useAiOrchestratorStore: () => ({
    classifyExercisesIfNeeded: classifyExercisesIfNeededMock,
  }),
}));

vi.mock("@/modules/deload/presentation", () => ({
  useDeloadStore: () => ({
    daysRemaining: 0,
    progressPercent: 0,
  }),
}));

vi.mock("@/modules/platform/presentation", () => ({
  useExerciseMuscleMapStore: () => ({
    resolveMuscleActivation: () => null,
  }),
}));

vi.mock("@/modules/profile/presentation", () => ({
  useMetricsStore: () => ({
    get isLoading() {
      return mockMetricsLoading.value;
    },
    evaluateInsight: evaluateInsightMock,
  }),
}));

vi.mock("@/modules/trainingInsights/presentation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/trainingInsights/presentation")>();
  return {
    ...actual,
    useTrainingInsightsStore: () => ({
      allLogs: [],
      insights: ref({
        get muscleGroups() {
          return mockMuscleGroups.value;
        },
        acwr: 1.0,
        phase: "Build",
        deloadStatus: "none",
        deloadEndsAt: null,
        plateauPaused: false,
        fatigue: {
          riskScore: 0,
          shouldDeload: false,
          hasSufficientHistory: true,
          reason: "",
          triggeredBy: [],
          loadWindow: {
            sets: {
              weekMinus3: 10,
              weekMinus2: 10,
              weekMinus1: 10,
              current: 12,
              prior3WeekAvg: 10,
            },
            tonnage: {
              weekMinus3: 1000,
              weekMinus2: 1000,
              weekMinus1: 1000,
              current: 1200,
              prior3WeekAvg: 1000,
            },
          },
        },
        e1rm: {},
      }),
    }),
  };
});

import { useInsightsTabViewModel } from "./useInsightsTabViewModel";

const TestHarness = defineComponent({
  setup() {
    useInsightsTabViewModel();
    return () => h("div");
  },
});

describe("useInsightsTabViewModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMetricsLoading.value = true;
  });

  it("waits until metricsStore finishes loading before evaluating pre-existing insights", async () => {
    const container = document.createElement("div");
    const app = createApp(TestHarness);
    app.mount(container);
    await nextTick();

    // Should NOT evaluate while metricsStore.isLoading is true
    expect(evaluateInsightMock).not.toHaveBeenCalled();

    // Once metricsStore finishes loading, it should evaluate insights even if muscleGroups did not change
    mockMetricsLoading.value = false;
    await nextTick();

    expect(evaluateInsightMock).toHaveBeenCalledWith("Chest", {
      sets: 12,
      landmark: "at_MAV",
      trendStatus: "improving",
    });
    app.unmount();
  });
});
