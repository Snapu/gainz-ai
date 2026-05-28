import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import type { ExerciseE1RM } from "./e1rm";
import { calculateFatigueInsight, isFatigueTriggerId } from "./fatigueDetection";

function buildMockLogs(
  weeklySets: number[],
  weeklyTonnage: number[],
  targetDate: Date,
): ExerciseLog[] {
  const logs: ExerciseLog[] = [];
  for (let w = 0; w < weeklySets.length; w++) {
    const sets = weeklySets[w] ?? 0;
    const tonnage = weeklyTonnage[w] ?? 0;
    const tonnagePerSet = sets > 0 ? tonnage / sets : 0;

    for (let s = 0; s < sets; s++) {
      // Distribute sets across the 7 days of the week to prevent single-day EWMA clustering spikes.
      const daysAgo = (3 - w) * 7 + (s % 7);
      const logDate = new Date(targetDate.getTime() - daysAgo * 86400000);

      logs.push({
        id: `mock-${w}-${s}`,
        exerciseName: "Mock",
        loggedAt: logDate,
        weight: tonnagePerSet,
        reps: 1,
        synthetic: false,
      } as ExerciseLog);
    }
  }
  return logs;
}

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
      unit: "kg",
    },
    Squat: {
      e1rm: 180,
      trend: [170, 174, 177, 180],
      trendDates: [now, now, now, now],
      plateau: false,
      unit: "kg",
    },
  };

  const decliningE1RM: Record<string, ExerciseE1RM> = {
    Bench: {
      e1rm: 100,
      trend: [120, 120, 110, 100], // baseline=120, drop=110,100 (< 114 threshold)
      trendDates: [now, now, now, now],
      plateau: false,
      unit: "kg",
    },
    Squat: {
      e1rm: 150,
      trend: [170, 170, 150, 140], // baseline=170, drop=150,140 (< 161.5 threshold)
      trendDates: [now, now, now, now],
      plateau: false,
      unit: "kg",
    },
  };

  it("returns non-triggering defaults when < 7 days of history are available", () => {
    // History < 7 days warm-up (only days -1, -2, -3 used)
    const logs = buildMockLogs([0, 0, 0, 3], [0, 0, 0, 1000], now);
    const result = calculateFatigueInsight(logs, improvingE1RM, false, now);
    expect(result.shouldDeload).toBe(false);
    expect(result.reason).toBeUndefined();
    expect(result.hasSufficientHistory).toBe(false);
    expect(result.triggeredBy).toEqual([]);
    expect(result.riskScore).toBe(0);
    expect(result.decliningExercises).toBe(0);
  });

  it("detects volume spike (>25% over prior EWMA average)", () => {
    // Drop in week 2 prevents volumeIncreasing trigger (so score = 2, not 3)
    const logs = buildMockLogs([14, 10, 12, 24], [1000, 1000, 1000, 1000], now);
    const result = calculateFatigueInsight(logs, improvingE1RM, false, now);
    expect(result.triggeredBy).toContain("volumeSpike");
    expect(result.triggeredBy).not.toContain("volumeIncreasing");
    expect(result.shouldDeload).toBe(false); // single hard trigger => score 2
    expect(result.riskScore).toBe(2);
  });

  it("detects tonnage spike (>50% over prior EWMA average)", () => {
    const logs = buildMockLogs([12, 12, 12, 12], [1000, 1000, 1000, 4000], now);
    const result = calculateFatigueInsight(logs, improvingE1RM, false, now);
    expect(result.triggeredBy).toContain("tonnageSpike");
    expect(result.shouldDeload).toBe(false); // single hard trigger => score 2
    expect(result.riskScore).toBe(2);
  });

  it("detects performance decline only when >=2 exercises decline", () => {
    const logs = buildMockLogs([14, 10, 12, 12], [900, 900, 900, 900], now);
    const result = calculateFatigueInsight(logs, decliningE1RM, false, now);
    expect(result.triggeredBy).toContain("performanceDecline");
    expect(result.triggeredBy).not.toContain("volumeIncreasing");
    expect(result.decliningExercises).toBeGreaterThanOrEqual(2);
    expect(result.shouldDeload).toBe(false); // single hard trigger => score 2
  });

  it("suppresses performance-decline signal during an active deload week", () => {
    const logs = buildMockLogs([14, 14, 14, 14], [900, 900, 900, 900], now);
    const result = calculateFatigueInsight(logs, decliningE1RM, true, now);
    expect(result.decliningExercises).toBe(0);
    expect(result.triggeredBy).not.toContain("performanceDecline");
    expect(result.shouldDeload).toBe(false);
  });

  it("ignores performance decline if the last session was > 14 days ago (detraining)", () => {
    const oldDate = new Date(now.getTime() - 20 * 86400000);
    const staleDecliningE1RM: Record<string, ExerciseE1RM> = {
      Bench: {
        e1rm: 100,
        trend: [120, 120, 110, 100],
        trendDates: [oldDate, oldDate, oldDate, oldDate],
        plateau: false,
        unit: "kg",
      },
      Squat: {
        e1rm: 150,
        trend: [170, 170, 150, 140],
        trendDates: [oldDate, oldDate, oldDate, oldDate],
        plateau: false,
        unit: "kg",
      },
    };
    const logs = buildMockLogs([14, 14, 14, 14], [900, 900, 900, 900], now);
    const result = calculateFatigueInsight(logs, staleDecliningE1RM, false, now);
    expect(result.triggeredBy).not.toContain("performanceDecline");
    expect(result.decliningExercises).toBe(0);
  });

  it("detects 4-week ramp using robust progressive pattern (not strict every-step spike)", () => {
    const logs = buildMockLogs([10, 14, 18, 22], [700, 800, 900, 900], now);
    const result = calculateFatigueInsight(logs, improvingE1RM, false, now);
    expect(result.triggeredBy).toContain("volumeIncreasing");
    expect(result.shouldDeload).toBe(false); // low-risk single soft trigger
    expect(result.riskScore).toBe(1);
  });

  it("ignores trivial 4-week ramps (fails 20% magnitude gate)", () => {
    const logs = buildMockLogs([12, 13, 14, 14], [700, 800, 900, 900], now);
    const result = calculateFatigueInsight(logs, improvingE1RM, false, now);
    expect(result.triggeredBy).not.toContain("volumeIncreasing");
  });

  it("ignores performance decline if only 1 session has dropped (requires 2 consecutive drops)", () => {
    const falseAlarmE1RM: Record<string, ExerciseE1RM> = {
      Bench: {
        e1rm: 100,
        trend: [120, 120, 120, 104], // Only the last session dropped
        trendDates: [now, now, now, now],
        plateau: false,
        unit: "kg",
      },
      Squat: {
        e1rm: 150,
        trend: [150, 150, 150, 140], // Only the last session dropped
        trendDates: [now, now, now, now],
        plateau: false,
        unit: "kg",
      },
    };
    const logs = buildMockLogs([14, 14, 14, 14], [900, 900, 900, 900], now);
    const result = calculateFatigueInsight(logs, falseAlarmE1RM, false, now);
    expect(result.triggeredBy).not.toContain("performanceDecline");
  });

  it("recommends deload when multiple stressors combine (riskScore >= 3)", () => {
    const logs = buildMockLogs([14, 10, 12, 24], [1000, 1000, 1000, 4000], now);
    const result = calculateFatigueInsight(logs, improvingE1RM, false, now);
    expect(result.shouldDeload).toBe(true);
    expect(result.riskScore).toBeGreaterThanOrEqual(3);
    expect(result.reason).toBeDefined();
  });

  it("recommends deload when performance decline co-occurs with load spike", () => {
    // Drop in week 2 prevents volumeIncreasing, but volumeSpike + performanceDecline triggers
    const logs = buildMockLogs([14, 10, 12, 24], [1000, 1000, 1000, 1000], now);
    const result = calculateFatigueInsight(logs, decliningE1RM, false, now);
    expect(result.shouldDeload).toBe(true);
    expect(result.triggeredBy).toContain("performanceDecline");
    expect(result.triggeredBy).toContain("volumeSpike");
    expect(result.reason).toBe("Performance decline across multiple exercises");
  });

  it("always returns AI-friendly structured fields", () => {
    const logs = buildMockLogs([8, 8, 8, 8], [500, 500, 500, 500], now);
    const result = calculateFatigueInsight(logs, improvingE1RM, false, now);
    expect(Array.isArray(result.triggeredBy)).toBe(true);
    expect(typeof result.riskScore).toBe("number");
    expect(typeof result.decliningExercises).toBe("number");
    expect(result.loadWindow).toBeDefined();
    expect(result.hasSufficientHistory).toBe(true);
  });
});
