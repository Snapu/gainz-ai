import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useAiStore } from "@/modules/aiCoach/presentation";
import { useRestTimerStore } from "@/modules/platform/presentation";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import type { AiResponseData } from "./useAICoachPageViewModel";
import { useAICoachPageViewModel } from "./useAICoachPageViewModel";

vi.mock("vue-router", () => ({
  useRouter: () => ({
    back: vi.fn(),
  }),
}));

vi.mock("@/shared/presentation/composables/useToast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock the DOM elements required for scrolling and keydown
vi.stubGlobal("window", {
  open: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
vi.stubGlobal("document", {
  activeElement: null,
});

describe("useAICoachPageViewModel", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("isHighlighted", () => {
    it("returns false if the user is currently resting", () => {
      const { isHighlighted } = useAICoachPageViewModel();
      const restStore = useRestTimerStore();

      // Force resting state
      restStore.targetRestSeconds = 60;
      restStore.restElapsed = 10;

      expect(isHighlighted(0, 0)).toBe(false);
    });

    it("returns false for any group other than the first one (gIndex !== 0)", () => {
      const aiStore = useAiStore();

      // Seed a workout with two standalone exercises (will form 2 groups)
      aiStore.messages = [
        {
          id: "msg1",
          role: "assistant",
          timestamp: new Date(),
          sessionDate: new Date().toISOString().split("T")[0] ?? "",
          logsCount: 0,
          content: JSON.stringify({
            coachMessage: "Here is your workout",
            recommendedWorkout: [
              { exerciseName: "Bench Press", targetSets: 3, targetReps: "8-10" },
              { exerciseName: "Squat", targetSets: 3, targetReps: "8-10" },
            ],
          } as AiResponseData),
        },
      ];

      const { isHighlighted } = useAICoachPageViewModel();

      // Group 0 should have a highlight
      expect(isHighlighted(0, 0)).toBe(true);
      // Group 1 should NOT have a highlight
      expect(isHighlighted(1, 0)).toBe(false);
    });

    it("highlights the exercise with the lowest completed sets in a superset", () => {
      const aiStore = useAiStore();
      const logsStore = useExerciseLogsStore();

      // Seed a workout with a superset
      aiStore.messages = [
        {
          id: "msg1",
          role: "assistant",
          timestamp: new Date(),
          sessionDate: new Date().toISOString().split("T")[0] ?? "",
          logsCount: 0,
          content: JSON.stringify({
            coachMessage: "Superset time",
            recommendedWorkout: [
              {
                exerciseName: "Bicep Curl",
                targetSets: 3,
                targetReps: "10-12",
                supersetId: "arms1",
              },
              {
                exerciseName: "Tricep Extension",
                targetSets: 3,
                targetReps: "10-12",
                supersetId: "arms1",
              },
            ],
          } as AiResponseData),
        },
      ];

      const { isHighlighted } = useAICoachPageViewModel();

      // Initially, both have 0 sets done. The first one (Bicep Curl, exIndex 0) should be highlighted.
      expect(isHighlighted(0, 0)).toBe(true);
      expect(isHighlighted(0, 1)).toBe(false);

      // Now, simulate the user completing 1 set of Bicep Curls
      logsStore.exerciseLogs = [
        {
          id: "log1",
          exerciseName: "Bicep Curl",
          loggedAt: new Date(),
          reps: 10,
          weight: 20,
        },
      ];

      // Bicep Curl has 1 set done, Tricep Extension has 0 sets done.
      // The highlight should jump to Tricep Extension (exIndex 1).
      expect(isHighlighted(0, 0)).toBe(false);
      expect(isHighlighted(0, 1)).toBe(true);

      // Now, simulate the user completing 1 set of Tricep Extensions
      logsStore.exerciseLogs = [
        ...logsStore.exerciseLogs,
        {
          id: "log2",
          exerciseName: "Tricep Extension",
          loggedAt: new Date(),
          reps: 10,
          weight: 20,
        },
      ];

      // Both have 1 set done. The highlight should return to the top (Bicep Curl, exIndex 0).
      expect(isHighlighted(0, 0)).toBe(true);
      expect(isHighlighted(0, 1)).toBe(false);
    });
  });
});
