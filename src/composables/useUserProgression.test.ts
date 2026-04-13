import { describe, expect, it } from "vitest";
import type { TrainingInsights } from "@/services/trainingScience";
import { computeSystemicPhase } from "@/services/trainingScience";
import {
  computeReadinessTheme,
  computeXpPillars,
  consistencyLabel,
  formatJourneyDuration,
  formatVolume,
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
  describe("consistencyLabel(readiness)", () => {
    it("returns 'Developing Foundation' for low readiness", () => {
      expect(consistencyLabel(0.5)).toBe("Developing Foundation");
    });

    it("returns 'Building Rhythm' for readiness in [0.7, 0.9)", () => {
      expect(consistencyLabel(0.7)).toBe("Building Rhythm");
      expect(consistencyLabel(0.89)).toBe("Building Rhythm");
    });

    it("returns 'Solid Consistency' for readiness in [0.9, 1.1)", () => {
      expect(consistencyLabel(0.9)).toBe("Solid Consistency");
      expect(consistencyLabel(1.0)).toBe("Solid Consistency");
    });

    it("returns 'Elite Discipline' for readiness in [1.1, 1.3)", () => {
      expect(consistencyLabel(1.1)).toBe("Elite Discipline");
      expect(consistencyLabel(1.29)).toBe("Elite Discipline");
    });

    it("returns 'Unstoppable Force' for readiness >= 1.3", () => {
      expect(consistencyLabel(1.3)).toBe("Unstoppable Force");
      expect(consistencyLabel(1.5)).toBe("Unstoppable Force");
    });
  });

  describe("formatVolume(kg)", () => {
    it("formats weight in kg for values < 1000", () => {
      const formatted = formatVolume(500);
      expect(formatted).toMatch(/kg/i);
      expect(formatted).toContain("500");
    });

    it("formats weight in tons for values >= 1000", () => {
      const formatted = formatVolume(1000);
      expect(formatted).toMatch(/t/i);
    });

    it("converts 2500 kg to 2.5 tons", () => {
      const formatted = formatVolume(2500);
      expect(formatted).toContain("2.5");
    });

    it("handles zero kg", () => {
      const formatted = formatVolume(0);
      expect(formatted).toMatch(/kg|0/);
    });
  });

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

  describe("computeXpPillars(xpBreakdown)", () => {
    it("calculates percentages correctly with equal values", () => {
      const breakdown = {
        discipline: 25,
        intensity: 25,
        progression: 25,
        mastery: 25,
      };
      const pillars = computeXpPillars(breakdown);
      expect(pillars).toHaveLength(4);
      pillars.forEach((pillar) => {
        expect(pillar.percent).toBe(25);
      });
    });

    it("calculates percentages correctly with unequal values", () => {
      const breakdown = {
        discipline: 50,
        intensity: 30,
        progression: 15,
        mastery: 5,
      };
      const pillars = computeXpPillars(breakdown);
      expect(pillars[0]?.percent).toBe(50);
      expect(pillars[1]?.percent).toBe(30);
      expect(pillars[2]?.percent).toBe(15);
      expect(pillars[3]?.percent).toBe(5);
    });

    it("handles zero values", () => {
      const breakdown = {
        discipline: 100,
        intensity: 0,
        progression: 0,
        mastery: 0,
      };
      const pillars = computeXpPillars(breakdown);
      expect(pillars[0]?.percent).toBe(100);
      expect(pillars[1]?.percent).toBe(0);
    });

    it("returns correct labels", () => {
      const breakdown = { discipline: 25, intensity: 25, progression: 25, mastery: 25 };
      const pillars = computeXpPillars(breakdown);
      expect(pillars[0]?.label).toBe("Discipline");
      expect(pillars[1]?.label).toBe("Intensity");
      expect(pillars[2]?.label).toBe("Progression");
      expect(pillars[3]?.label).toBe("Mastery");
    });

    it("uses fallback total of 1 when all values are zero", () => {
      const breakdown = { discipline: 0, intensity: 0, progression: 0, mastery: 0 };
      const pillars = computeXpPillars(breakdown);
      pillars.forEach((pillar) => {
        expect(pillar.percent).toBe(0);
      });
    });
  });

  describe("formatJourneyDuration(weeks)", () => {
    it("converts 4 weeks to '1 month'", () => {
      expect(formatJourneyDuration(4)).toMatch(/month/i);
    });

    it("converts 52 weeks to '1 year'", () => {
      expect(formatJourneyDuration(52)).toMatch(/year/i);
    });

    it("converts 104 weeks to '2 years'", () => {
      expect(formatJourneyDuration(104)).toMatch(/year|2/i);
    });

    it("handles single week", () => {
      expect(formatJourneyDuration(1)).toBe("1 week");
    });

    it("handles 3 weeks", () => {
      expect(formatJourneyDuration(3)).toBe("3 weeks");
    });
  });

  // --- INTEGRATION TESTS ---

  describe("integration: consistent user journey", () => {
    it("builds consistency labels over increasing readiness", () => {
      const labels = [
        consistencyLabel(0.5),
        consistencyLabel(0.8),
        consistencyLabel(1.0),
        consistencyLabel(1.2),
        consistencyLabel(1.5),
      ];
      expect(labels[0]).toBe("Developing Foundation");
      expect(labels[1]).toBe("Building Rhythm");
      expect(labels[2]).toBe("Solid Consistency");
      expect(labels[3]).toBe("Elite Discipline");
      expect(labels[4]).toBe("Unstoppable Force");
    });

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

    it("formats large volume progression correctly", () => {
      const volumes = [100, 500, 1000, 2000, 5000].map(formatVolume);
      expect(volumes[0]).toMatch(/kg/);
      expect(volumes[1]).toMatch(/kg/);
      expect(volumes[2]).toMatch(/t/);
      expect(volumes[3]).toMatch(/t/);
      expect(volumes[4]).toMatch(/t/);
    });
  });
});
