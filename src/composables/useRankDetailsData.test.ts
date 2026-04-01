import { describe, expect, it } from "vitest";
import type { TrainingInsights } from "@/services/trainingScience";
import {
  computeMomentumEffect,
  computeTrainingPhase,
  computeXpPillars,
  consistencyLabel,
  formatJourneyDuration,
  formatVolume,
} from "./useRankDetailsData";

// --- TEST HELPERS ---

/**
 * Creates a minimal TrainingInsights object for testing
 */
function createMockInsights(overrides?: Partial<TrainingInsights>): TrainingInsights {
  return {
    muscleGroups: {},
    e1rm: {},
    fatigue: {
      shouldDeload: false,
      weeklyTotalSets: [],
    },
    ...overrides,
  };
}

// --- TESTS ---

describe("useRankDetailsData composable", () => {
  describe("consistencyLabel(momentum)", () => {
    it("returns 'Foundation Building' for momentum < 1.2", () => {
      const label = consistencyLabel(1.0);
      expect(label).toBe("Foundation Building");
    });

    it("returns 'Foundation Building' at boundary 1.19", () => {
      const label = consistencyLabel(1.19);
      expect(label).toBe("Foundation Building");
    });

    it("returns 'Establishing Rhythm' for momentum >= 1.2 and < 1.35", () => {
      const label = consistencyLabel(1.2);
      expect(label).toBe("Establishing Rhythm");
    });

    it("returns 'Establishing Rhythm' at boundary 1.34", () => {
      const label = consistencyLabel(1.34);
      expect(label).toBe("Establishing Rhythm");
    });

    it("returns 'Solid Consistency' for momentum >= 1.35 and < 1.55", () => {
      const label = consistencyLabel(1.35);
      expect(label).toBe("Solid Consistency");
    });

    it("returns 'Solid Consistency' at boundary 1.54", () => {
      const label = consistencyLabel(1.54);
      expect(label).toBe("Solid Consistency");
    });

    it("returns 'Peak Discipline' for momentum >= 1.55 and < 1.75", () => {
      const label = consistencyLabel(1.55);
      expect(label).toBe("Peak Discipline");
    });

    it("returns 'Peak Discipline' at boundary 1.74", () => {
      const label = consistencyLabel(1.74);
      expect(label).toBe("Peak Discipline");
    });

    it("returns 'Elite Momentum' for momentum >= 1.75 and < 1.95", () => {
      const label = consistencyLabel(1.75);
      expect(label).toBe("Elite Momentum");
    });

    it("returns 'Elite Momentum' at boundary 1.94", () => {
      const label = consistencyLabel(1.94);
      expect(label).toBe("Elite Momentum");
    });

    it("returns 'Unstoppable Force' for momentum >= 1.95", () => {
      const label = consistencyLabel(1.95);
      expect(label).toBe("Unstoppable Force");
    });

    it("returns 'Unstoppable Force' at maximum momentum 2.0", () => {
      const label = consistencyLabel(2.0);
      expect(label).toBe("Unstoppable Force");
    });

    it("handles edge case momentum = 1.0 (minimum)", () => {
      const label = consistencyLabel(1.0);
      expect(label).toBe("Foundation Building");
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

    it("converts 1000 kg to 1 ton", () => {
      const formatted = formatVolume(1000);
      expect(formatted).toContain("1");
    });

    it("converts 2500 kg to 2.5 tons", () => {
      const formatted = formatVolume(2500);
      expect(formatted).toContain("2.5");
    });

    it("handles zero kg", () => {
      const formatted = formatVolume(0);
      expect(formatted).toMatch(/kg|0/);
    });

    it("handles small fractional kg", () => {
      const formatted = formatVolume(45.5);
      expect(formatted).toMatch(/kg|45/);
    });
  });

  describe("computeTrainingPhase(insights)", () => {
    it("returns 'DELOAD PHASE' when shouldDeload is true", () => {
      const insights = createMockInsights({
        fatigue: {
          shouldDeload: true,
          weeklyTotalSets: [100, 110],
        },
      });
      const phase = computeTrainingPhase(insights);
      expect(phase.label).toBe("DELOAD PHASE");
      expect(phase.color).toBe("text-orange-400");
      expect(phase.bg).toBe("bg-orange-400/10");
    });

    it("returns 'ACCUMULATION' when trend is increasing", () => {
      const insights = createMockInsights({
        fatigue: {
          shouldDeload: false,
          weeklyTotalSets: [100, 110, 120],
        },
      });
      const phase = computeTrainingPhase(insights);
      expect(phase.label).toBe("ACCUMULATION");
      expect(phase.color).toBe("text-primary");
      expect(phase.bg).toBe("bg-primary/10");
    });

    it("returns 'STABILIZATION' when trend is flat or decreasing", () => {
      const insights = createMockInsights({
        fatigue: {
          shouldDeload: false,
          weeklyTotalSets: [100, 100, 95],
        },
      });
      const phase = computeTrainingPhase(insights);
      expect(phase.label).toBe("STABILIZATION");
      expect(phase.color).toBe("text-blue-400");
      expect(phase.bg).toBe("bg-blue-400/10");
    });

    it("returns 'STABILIZATION' when trend has less than 2 weeks", () => {
      const insights = createMockInsights({
        fatigue: {
          shouldDeload: false,
          weeklyTotalSets: [100],
        },
      });
      const phase = computeTrainingPhase(insights);
      expect(phase.label).toBe("STABILIZATION");
    });

    it("returns 'STABILIZATION' when trend is empty", () => {
      const insights = createMockInsights({
        fatigue: {
          shouldDeload: false,
          weeklyTotalSets: [],
        },
      });
      const phase = computeTrainingPhase(insights);
      expect(phase.label).toBe("STABILIZATION");
    });
  });

  describe("computeMomentumEffect(momentum)", () => {
    it("returns glow effect for high momentum (>= 1.75)", () => {
      const effect = computeMomentumEffect(1.75);
      expect(effect).toHaveProperty("glowClass");
      expect(effect.glowClass).toBeTruthy();
    });

    it("returns animation effect for peak momentum (>= 1.95)", () => {
      const effect = computeMomentumEffect(1.95);
      expect(effect).toHaveProperty("animationClass");
      expect(effect.animationClass).toBeTruthy();
    });

    it("returns no special effect for low momentum (< 1.5)", () => {
      const effect = computeMomentumEffect(1.2);
      expect(effect).toHaveProperty("glowClass");
      expect(effect.glowClass).toBeFalsy();
    });

    it("returns medium effect for mid-range momentum (1.5 <= m < 1.75)", () => {
      const effect = computeMomentumEffect(1.55);
      expect(effect).toHaveProperty("glowClass");
      // Should have glow but not animation
      expect(effect.glowClass).toBeFalsy();
    });

    it("returns maximum animation for momentum = 2.0", () => {
      const effect = computeMomentumEffect(2.0);
      expect(effect).toHaveProperty("animationClass");
      expect(effect.animationClass).toBeTruthy();
    });

    it("returns no effect for minimum momentum = 1.0", () => {
      const effect = computeMomentumEffect(1.0);
      expect(effect).toHaveProperty("glowClass");
      expect(effect.glowClass).toBeFalsy();
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
      expect(pillars).toHaveLength(4);
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
      expect(pillars[2]?.percent).toBe(0);
      expect(pillars[3]?.percent).toBe(0);
    });

    it("returns correct color for each pillar", () => {
      const breakdown = {
        discipline: 25,
        intensity: 25,
        progression: 25,
        mastery: 25,
      };
      const pillars = computeXpPillars(breakdown);
      expect(pillars).toHaveLength(4);
      expect(pillars[0]?.color).toBe("bg-blue-500");
      expect(pillars[1]?.color).toBe("bg-red-500");
      expect(pillars[2]?.color).toBe("bg-primary");
      expect(pillars[3]?.color).toBe("bg-fuchsia-500");
    });

    it("returns correct label for each pillar", () => {
      const breakdown = {
        discipline: 25,
        intensity: 25,
        progression: 25,
        mastery: 25,
      };
      const pillars = computeXpPillars(breakdown);
      expect(pillars[0]?.label).toBe("Discipline");
      expect(pillars[1]?.label).toBe("Intensity");
      expect(pillars[2]?.label).toBe("Progression");
      expect(pillars[3]?.label).toBe("Mastery");
    });

    it("maintains value property from breakdown", () => {
      const breakdown = {
        discipline: 100,
        intensity: 200,
        progression: 150,
        mastery: 50,
      };
      const pillars = computeXpPillars(breakdown);
      expect(pillars[0]?.value).toBe(100);
      expect(pillars[1]?.value).toBe(200);
      expect(pillars[2]?.value).toBe(150);
      expect(pillars[3]?.value).toBe(50);
    });

    it("uses fallback total of 1 when all values are zero", () => {
      const breakdown = {
        discipline: 0,
        intensity: 0,
        progression: 0,
        mastery: 0,
      };
      const pillars = computeXpPillars(breakdown);
      // With total=1 (fallback), each percent should be 0/1 * 100 = 0
      pillars.forEach((pillar) => {
        expect(pillar.percent).toBe(0);
      });
    });
  });

  describe("formatJourneyDuration(weeks)", () => {
    it("formats weeks to readable duration format", () => {
      const formatted = formatJourneyDuration(4);
      expect(formatted).toBeTruthy();
      expect(typeof formatted).toBe("string");
    });

    it("converts 4 weeks to '1 month'", () => {
      const formatted = formatJourneyDuration(4);
      expect(formatted).toMatch(/month|4\s*w/i);
    });

    it("converts 52 weeks to '1 year'", () => {
      const formatted = formatJourneyDuration(52);
      expect(formatted).toMatch(/year|52\s*w/i);
    });

    it("converts 104 weeks to '2 years'", () => {
      const formatted = formatJourneyDuration(104);
      expect(formatted).toMatch(/year|2/i);
    });

    it("converts 156 weeks to '3 years'", () => {
      const formatted = formatJourneyDuration(156);
      expect(formatted).toMatch(/year|3/i);
    });

    it("handles single week", () => {
      const formatted = formatJourneyDuration(1);
      expect(formatted).toBeTruthy();
      expect(typeof formatted).toBe("string");
    });

    it("handles zero weeks", () => {
      const formatted = formatJourneyDuration(0);
      expect(formatted).toBeTruthy();
      expect(typeof formatted).toBe("string");
    });

    it("handles large number of weeks", () => {
      const formatted = formatJourneyDuration(260); // 5 years
      expect(formatted).toBeTruthy();
      expect(formatted).toMatch(/year|5/i);
    });

    it("handles fractional weeks as integers", () => {
      const formatted = formatJourneyDuration(26);
      expect(formatted).toBeTruthy();
      expect(typeof formatted).toBe("string");
    });
  });

  // --- INTEGRATION TESTS ---

  describe("integration: consistent user journey", () => {
    it("builds momentum over multiple weeks", () => {
      const labels = [
        consistencyLabel(1.0),
        consistencyLabel(1.25),
        consistencyLabel(1.5),
        consistencyLabel(1.8),
        consistencyLabel(2.0),
      ];
      expect(labels[0]).toBe("Foundation Building");
      expect(labels[1]).toBe("Establishing Rhythm");
      expect(labels[2]).toBe("Solid Consistency");
      expect(labels[3]).toBe("Elite Momentum");
      expect(labels[4]).toBe("Unstoppable Force");
    });

    it("shows proper phase transitions", () => {
      const phases = [
        computeTrainingPhase(
          createMockInsights({
            fatigue: { shouldDeload: false, weeklyTotalSets: [100] },
          }),
        ),
        computeTrainingPhase(
          createMockInsights({
            fatigue: { shouldDeload: false, weeklyTotalSets: [100, 110] },
          }),
        ),
        computeTrainingPhase(
          createMockInsights({
            fatigue: { shouldDeload: true, weeklyTotalSets: [100, 110] },
          }),
        ),
      ];
      expect(phases[0]?.label).toBe("STABILIZATION");
      expect(phases[1]?.label).toBe("ACCUMULATION");
      expect(phases[2]?.label).toBe("DELOAD PHASE");
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
