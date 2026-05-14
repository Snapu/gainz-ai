import { describe, expect, it } from "vitest";
import type { ExerciseE1RM } from "./e1rm";
import { calculateFatigueInsight, isFatigueTriggerId } from "./fatigueDetection";

describe("isFatigueTriggerId", () => {
  it("rejects inherited object keys", () => {
    expect(isFatigueTriggerId("toString")).toBe(false);
    expect(isFatigueTriggerId("constructor")).toBe(false);
  });

  it("accepts only known trigger ids", () => {
    expect(isFatigueTriggerId("volumeSpike")).toBe(true);
    expect(isFatigueTriggerId("tonnageSpike")).toBe(true);
    expect(isFatigueTriggerId("performanceDecline")).toBe(true);
    expect(isFatigueTriggerId("volumeIncreasing")).toBe(true);
    expect(isFatigueTriggerId("unknownTrigger")).toBe(false);
  });
});

describe("calculateFatigueInsight", () => {
  const now = new Date();
  const improvingE1RM: Record<string, ExerciseE1RM> = {
    "Bench Press": {
      e1rm: 120,
      trend: [112, 115, 118, 120],
      trendDates: [now, now, now, now],
      plateau: false,
    },
    Squat: {
      e1rm: 180,
      trend: [170, 174, 177, 180],
      trendDates: [now, now, now, now],
      plateau: false,
    },
  };

  const decliningE1RM: Record<string, ExerciseE1RM> = {
    Bench: {
      e1rm: 100,
      trend: [120, 116, 110, 104],
      trendDates: [now, now, now, now],
      plateau: false,
    },
    Squat: {
      e1rm: 150,
      trend: [170, 164, 159, 152],
      trendDates: [now, now, now, now],
      plateau: false,
    },
  };

  it("returns non-triggering defaults when fewer than 4 weeks are available", () => {
    const result = calculateFatigueInsight([10, 12, 14], [1000, 1100, 1200], improvingE1RM);
    expect(result.shouldDeload).toBe(false);
    expect(result.reason).toBeUndefined();
    expect(result.hasSufficientHistory).toBe(false);
    expect(result.triggeredBy).toEqual([]);
    expect(result.riskScore).toBe(0);
    expect(result.decliningExercises).toBe(0);
    expect(result.loadWindow.sets.current).toBe(0);
    expect(result.loadWindow.tonnage.current).toBe(0);
  });

  it("detects volume spike (>25% over prior 3-week average)", () => {
    const result = calculateFatigueInsight(
      [12, 12, 12, 16],
      [1000, 1000, 1000, 1000],
      improvingE1RM,
    );
    expect(result.triggeredBy).toContain("volumeSpike");
    expect(result.shouldDeload).toBe(false); // single hard trigger => score 2
    expect(result.riskScore).toBe(2);
  });

  it("detects tonnage spike (>50% over prior 3-week average)", () => {
    const result = calculateFatigueInsight(
      [12, 12, 12, 12],
      [1000, 1000, 1000, 1600],
      improvingE1RM,
    );
    expect(result.triggeredBy).toContain("tonnageSpike");
    expect(result.shouldDeload).toBe(false); // single hard trigger => score 2
    expect(result.riskScore).toBe(2);
  });

  it("detects performance decline only when >=2 exercises decline", () => {
    const result = calculateFatigueInsight([14, 14, 14, 14], [900, 900, 900, 900], decliningE1RM);
    expect(result.triggeredBy).toContain("performanceDecline");
    expect(result.decliningExercises).toBeGreaterThanOrEqual(2);
    expect(result.shouldDeload).toBe(false); // single hard trigger => score 2
  });

  it("suppresses performance-decline signal during an active deload week", () => {
    const result = calculateFatigueInsight(
      [14, 14, 14, 14],
      [900, 900, 900, 900],
      decliningE1RM,
      true,
    );
    expect(result.decliningExercises).toBe(0);
    expect(result.triggeredBy).not.toContain("performanceDecline");
    expect(result.shouldDeload).toBe(false);
  });

  it("ignores performance decline if the last session was > 14 days ago (detraining)", () => {
    const oldDate = new Date(now.getTime() - 20 * 86400000);
    const staleDecliningE1RM: Record<string, ExerciseE1RM> = {
      Bench: {
        e1rm: 100,
        trend: [120, 116, 110, 104],
        trendDates: [oldDate, oldDate, oldDate, oldDate],
        plateau: false,
      },
      Squat: {
        e1rm: 150,
        trend: [170, 164, 159, 152],
        trendDates: [oldDate, oldDate, oldDate, oldDate],
        plateau: false,
      },
    };
    const result = calculateFatigueInsight(
      [14, 14, 14, 14],
      [900, 900, 900, 900],
      staleDecliningE1RM,
      false,
      now,
    );
    expect(result.triggeredBy).not.toContain("performanceDecline");
    expect(result.decliningExercises).toBe(0);
  });

  it("detects 4-week ramp using robust progressive pattern (not strict every-step spike)", () => {
    const result = calculateFatigueInsight([10, 12, 14, 14], [700, 800, 900, 900], improvingE1RM);
    expect(result.triggeredBy).toContain("volumeIncreasing");
    expect(result.shouldDeload).toBe(false); // low-risk single soft trigger
    expect(result.riskScore).toBe(1);
  });

  it("recommends deload when multiple stressors combine (riskScore >= 3)", () => {
    const result = calculateFatigueInsight(
      [12, 12, 12, 16], // volume spike
      [1000, 1000, 1000, 1600], // tonnage spike
      improvingE1RM,
    );
    expect(result.shouldDeload).toBe(true);
    expect(result.riskScore).toBeGreaterThanOrEqual(3);
    expect(result.reason).toBeDefined();
  });

  it("recommends deload when performance decline co-occurs with load spike", () => {
    const result = calculateFatigueInsight(
      [12, 12, 12, 16],
      [1000, 1000, 1000, 1000],
      decliningE1RM,
    );
    expect(result.shouldDeload).toBe(true);
    expect(result.triggeredBy).toContain("performanceDecline");
    expect(result.triggeredBy).toContain("volumeSpike");
    expect(result.reason).toBe("Performance decline across multiple exercises");
  });

  it("always returns AI-friendly structured fields", () => {
    const result = calculateFatigueInsight([8, 8, 8, 8], [500, 500, 500, 500], improvingE1RM);
    expect(Array.isArray(result.triggeredBy)).toBe(true);
    expect(typeof result.riskScore).toBe("number");
    expect(typeof result.decliningExercises).toBe("number");
    expect(result.loadWindow).toBeDefined();
    expect(result.hasSufficientHistory).toBe(true);
  });
});
