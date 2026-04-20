import { describe, expect, it } from "vitest";
import type { TrainingInsights } from "@/services/trainingScience";
import { computeSystemicPhase } from "@/services/trainingScience";
import {
  computeReadinessTheme,
} from "./useUserProgression";

// --- TEST HELPERS ---

/**
 * Creates a minimal TrainingInsights object for testing
 */
function createMockInsights(overrides?: Partial<TrainingInsights>): TrainingInsights {
  const fatigue = overrides?.fatigue ?? {
    shouldDeload: false,
    weeklyTotalSets: [],
  };
  return {
    muscleGroups: {},
    e1rm: {},
    fatigue,
    phase: computeSystemicPhase(fatigue),
    ...overrides,
  };
}

// --- TESTS ---

describe("useUserProgression composable", () => {



  describe("computeSystemicPhase (domain engine)", () => {
    it("returns 'Deload' when shouldDeload is true", () => {
      const insights = createMockInsights({
        fatigue: {
          shouldDeload: true,
          weeklyTotalSets: [100, 110],
        },
      });
      expect(insights.phase).toBe("Deload");
    });

    it("returns 'Build' when volume is increasing above MEV", () => {
      const insights = createMockInsights({
        fatigue: {
          shouldDeload: false,
          weeklyTotalSets: [14, 16],
        },
      });
      expect(insights.phase).toBe("Build");
    });

    it("returns 'Maintain' when volume is stable above threshold", () => {
      const insights = createMockInsights({
        fatigue: {
          shouldDeload: false,
          weeklyTotalSets: [14, 14],
        },
      });
      expect(insights.phase).toBe("Maintain");
    });

    it("returns 'Inactive' when total 2-week volume is below 24", () => {
      const insights = createMockInsights({
        fatigue: {
          shouldDeload: false,
          weeklyTotalSets: [5, 5],
        },
      });
      expect(insights.phase).toBe("Inactive");
    });

    it("returns 'Inactive' when trend is empty", () => {
      const insights = createMockInsights({
        fatigue: {
          shouldDeload: false,
          weeklyTotalSets: [],
        },
      });
      expect(insights.phase).toBe("Inactive");
    });
  });

  describe("computeReadinessTheme(readiness)", () => {
    it("returns blue theme for low readiness", () => {
      const theme = computeReadinessTheme(0.5);
      expect(theme.color).toBe("text-blue-400");
    });

    it("returns cyan theme for developing readiness", () => {
      const theme = computeReadinessTheme(0.8);
      expect(theme.color).toBe("text-cyan-400");
    });

    it("returns primary theme for solid readiness", () => {
      const theme = computeReadinessTheme(1.0);
      expect(theme.color).toBe("text-primary");
    });

    it("returns emerald theme for high readiness", () => {
      const theme = computeReadinessTheme(1.2);
      expect(theme.color).toBe("text-emerald-400");
    });

    it("returns fuchsia theme for peak readiness", () => {
      const theme = computeReadinessTheme(1.4);
      expect(theme.color).toBe("text-fuchsia-400");
    });
  });


  // --- INTEGRATION TESTS ---

  describe("integration: consistent user journey", () => {


    it("shows proper phase transitions", () => {
      const phases = [
        createMockInsights({
          fatigue: { shouldDeload: false, weeklyTotalSets: [5, 5] },
        }).phase,
        createMockInsights({
          fatigue: { shouldDeload: false, weeklyTotalSets: [14, 16] },
        }).phase,
        createMockInsights({
          fatigue: { shouldDeload: true, weeklyTotalSets: [14, 16] },
        }).phase,
      ];
      expect(phases[0]).toBe("Inactive");
      expect(phases[1]).toBe("Build");
      expect(phases[2]).toBe("Deload");
    });


  });
});
