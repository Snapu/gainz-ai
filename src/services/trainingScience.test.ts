import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "./exerciseLogs";
import {
  calculateE1RM,
  calculateE1RMInsights,
  calculateFatigueInsight,
  calculateMuscleGroupInsights,
  calculateTrainingInsights,
  getMuscleGroup,
} from "./trainingScience";

function createLog(
  exerciseName: string,
  loggedAt: Date,
  weight?: number,
  reps?: number,
): ExerciseLog {
  return {
    id: crypto.randomUUID(),
    exerciseName,
    loggedAt,
    reps,
    weight,
    distance: undefined,
    duration: undefined,
  };
}

// --- e1RM ---

describe("calculateE1RM", () => {
  it("should return the weight itself for 1 rep", () => {
    expect(calculateE1RM(100, 1)).toBe(100);
  });

  it("should calculate Epley formula correctly for 10 reps", () => {
    // 100 × (1 + 10/30) = 100 × 1.333 = 133.3
    expect(calculateE1RM(100, 10)).toBe(133.3);
  });

  it("should return 0 for 0 or negative reps/weight", () => {
    expect(calculateE1RM(0, 10)).toBe(0);
    expect(calculateE1RM(100, 0)).toBe(0);
  });

  it("should return 0 for reps > 30 (unreliable)", () => {
    expect(calculateE1RM(50, 31)).toBe(0);
  });

  it("should handle decimal weights", () => {
    // 52.5 × (1 + 12/30) = 52.5 × 1.4 = 73.5
    expect(calculateE1RM(52.5, 12)).toBe(73.5);
  });
});

// --- getMuscleGroup ---

describe("getMuscleGroup", () => {
  it("should resolve known exercises from default map", () => {
    expect(getMuscleGroup("Bench Press")).toBe("Chest");
    expect(getMuscleGroup("Bankdrücken")).toBe("Chest");
    expect(getMuscleGroup("Squat")).toBe("Quads");
    expect(getMuscleGroup("Klimmzüge")).toBe("Back");
  });

  it("should return null for unknown exercises", () => {
    expect(getMuscleGroup("Underwater Basket Weaving")).toBeNull();
  });

  it("should be case-insensitive on fallback", () => {
    expect(getMuscleGroup("bench press")).toBe("Chest");
    expect(getMuscleGroup("SQUAT")).toBe("Quads");
  });

  it("should prefer override map over default", () => {
    const override = { "Custom Exercise": "Glutes" as const };
    expect(getMuscleGroup("Custom Exercise", override)).toBe("Glutes");
  });

  it("should fall back to default if not in override", () => {
    const override = { "Custom Exercise": "Glutes" as const };
    expect(getMuscleGroup("Bench Press", override)).toBe("Chest");
  });
});

// --- e1RM Insights ---

describe("calculateE1RMInsights", () => {
  it("should calculate e1RM trend across sessions", () => {
    const logs = [
      createLog("Bench Press", new Date("2026-03-01"), 60, 10),
      createLog("Bench Press", new Date("2026-03-08"), 62.5, 10),
      createLog("Bench Press", new Date("2026-03-15"), 65, 10),
      createLog("Bench Press", new Date("2026-03-22"), 67.5, 10),
    ];

    const insights = calculateE1RMInsights(logs);

    expect(insights["Bench Press"]).toBeDefined();
    expect(insights["Bench Press"]!.trend).toHaveLength(4);
    expect(insights["Bench Press"]!.e1rm).toBe(calculateE1RM(67.5, 10));
    expect(insights["Bench Press"]!.plateau).toBe(false);
  });

  it("should detect a plateau when e1RM is flat for 3+ sessions", () => {
    const logs = [
      createLog("Bench Press", new Date("2026-03-01"), 60, 10),
      createLog("Bench Press", new Date("2026-03-08"), 60, 10),
      createLog("Bench Press", new Date("2026-03-15"), 60, 10),
    ];

    const insights = calculateE1RMInsights(logs);

    expect(insights["Bench Press"]!.plateau).toBe(true);
  });

  it("should ignore exercises with no muscle group mapping", () => {
    const logs = [createLog("Underwater Basket Weaving", new Date("2026-03-01"), 10, 10)];
    const insights = calculateE1RMInsights(logs);
    expect(Object.keys(insights)).toHaveLength(0);
  });

  it("should handle multiple sets per session (pick best e1RM)", () => {
    const logs = [
      createLog("Bench Press", new Date("2026-03-01"), 60, 10), // e1RM = 80
      createLog("Bench Press", new Date("2026-03-01"), 70, 5), // e1RM = 81.7
      createLog("Bench Press", new Date("2026-03-01"), 50, 15), // e1RM = 75
    ];

    const insights = calculateE1RMInsights(logs);
    // Best should be the 70×5 set
    expect(insights["Bench Press"]!.e1rm).toBe(calculateE1RM(70, 5));
  });

  it("should only keep the last 4 sessions in trend", () => {
    const logs = [
      createLog("Bench Press", new Date("2026-01-01"), 50, 10),
      createLog("Bench Press", new Date("2026-01-08"), 52.5, 10),
      createLog("Bench Press", new Date("2026-01-15"), 55, 10),
      createLog("Bench Press", new Date("2026-01-22"), 57.5, 10),
      createLog("Bench Press", new Date("2026-01-29"), 60, 10),
    ];

    const insights = calculateE1RMInsights(logs);
    expect(insights["Bench Press"]!.trend).toHaveLength(4);
  });
});

// --- Volume Landmarks ---

describe("calculateMuscleGroupInsights", () => {
  it("should classify volume into landmarks correctly", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    // 12 sets of chest in 7 days → should be at_MAV
    const logs: ExerciseLog[] = [];
    for (let i = 0; i < 12; i++) {
      logs.push(createLog("Bench Press", new Date("2026-03-23T12:00:00Z"), 60, 10));
    }

    const insights = calculateMuscleGroupInsights(logs, targetDate);

    expect(insights.Chest).toBeDefined();
    expect(insights.Chest!.sets).toBe(12);
    expect(insights.Chest!.landmark).toBe("at_MAV");
  });

  it("should detect below_MEV for low volume", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs = [
      createLog("Bench Press", new Date("2026-03-23T12:00:00Z"), 60, 10),
      createLog("Bench Press", new Date("2026-03-23T12:05:00Z"), 60, 10),
    ];

    const insights = calculateMuscleGroupInsights(logs, targetDate);
    expect(insights.Chest!.sets).toBe(2);
    expect(insights.Chest!.landmark).toBe("below_MEV");
  });

  it("should detect above_MRV for very high volume", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];
    for (let i = 0; i < 25; i++) {
      logs.push(createLog("Bench Press", new Date("2026-03-23T12:00:00Z"), 60, 10));
    }

    const insights = calculateMuscleGroupInsights(logs, targetDate);
    expect(insights.Chest!.landmark).toBe("above_MRV");
  });

  it("should calculate frequency per week from 14-day window", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    // 4 unique days in 14 days → 2x/week
    const logs = [
      createLog("Bench Press", new Date("2026-03-12T12:00:00Z"), 60, 10),
      createLog("Bench Press", new Date("2026-03-15T12:00:00Z"), 60, 10),
      createLog("Bench Press", new Date("2026-03-19T12:00:00Z"), 60, 10),
      createLog("Bench Press", new Date("2026-03-23T12:00:00Z"), 60, 10),
    ];

    const insights = calculateMuscleGroupInsights(logs, targetDate);
    expect(insights.Chest!.frequencyPerWeek).toBe(2);
  });

  it("should calculate hours since last trained", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs = [
      createLog("Bench Press", new Date("2026-03-23T12:00:00Z"), 60, 10), // 48 hours ago
    ];

    const insights = calculateMuscleGroupInsights(logs, targetDate);
    expect(insights.Chest!.hoursSinceLastTrained).toBe(48);
  });

  it("should aggregate across exercises in the same muscle group", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs = [
      createLog("Bench Press", new Date("2026-03-23T12:00:00Z"), 60, 10),
      createLog("Incline Bench Press", new Date("2026-03-23T12:00:00Z"), 50, 10),
      createLog("Push-Ups", new Date("2026-03-23T12:00:00Z"), undefined, 20),
    ];

    const insights = calculateMuscleGroupInsights(logs, targetDate);
    expect(insights.Chest!.sets).toBe(3);
  });
});

// --- Deload Detection ---

describe("calculateFatigueInsight", () => {
  it("should detect deload when volume rises for 4 consecutive weeks", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];

    // Week 1: 10 sets, Week 2: 12, Week 3: 14, Week 4: 18
    for (let w = 3; w >= 0; w--) {
      const setsThisWeek = 10 + (3 - w) * 3;
      for (let s = 0; s < setsThisWeek; s++) {
        const d = new Date(targetDate);
        d.setDate(d.getDate() - w * 7 - 1);
        logs.push(createLog("Bench Press", d, 60, 10));
      }
    }

    const e1rm = calculateE1RMInsights(logs);
    const fatigue = calculateFatigueInsight(logs, e1rm, targetDate);

    expect(fatigue.shouldDeload).toBe(true);
    expect(fatigue.reason).toContain("4 consecutive weeks");
  });

  it("should not trigger deload for stable volume", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];

    // 12 sets each week for 4 weeks
    for (let w = 3; w >= 0; w--) {
      for (let s = 0; s < 12; s++) {
        const d = new Date(targetDate);
        d.setDate(d.getDate() - w * 7 - 1);
        logs.push(createLog("Bench Press", d, 60, 10));
      }
    }

    const e1rm = calculateE1RMInsights(logs);
    const fatigue = calculateFatigueInsight(logs, e1rm, targetDate);

    expect(fatigue.shouldDeload).toBe(false);
  });

  it("should detect deload when multiple exercises show e1RM decline", () => {
    const e1rm = {
      "Bench Press": { e1rm: 70, trend: [80, 75, 70], plateau: false },
      Squat: { e1rm: 90, trend: [100, 95, 90], plateau: false },
    };

    const fatigue = calculateFatigueInsight([], e1rm);

    expect(fatigue.shouldDeload).toBe(true);
    expect(fatigue.reason).toContain("2 exercises");
  });

  it("should track weekly total sets array", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const fatigue = calculateFatigueInsight([], {}, targetDate);
    expect(fatigue.weeklyTotalSets).toHaveLength(4);
  });
});

// --- Integration ---

describe("calculateTrainingInsights", () => {
  it("should return a complete TrainingInsights object", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs = [
      createLog("Bench Press", new Date("2026-03-22T12:00:00Z"), 60, 10),
      createLog("Bench Press", new Date("2026-03-22T12:05:00Z"), 60, 8),
      createLog("Squat", new Date("2026-03-23T12:00:00Z"), 100, 5),
    ];

    const insights = calculateTrainingInsights(logs, targetDate);

    expect(insights.muscleGroups.Chest).toBeDefined();
    expect(insights.muscleGroups.Quads).toBeDefined();
    expect(insights.e1rm["Bench Press"]).toBeDefined();
    expect(insights.e1rm["Squat"]).toBeDefined();
    expect(insights.fatigue.weeklyTotalSets).toHaveLength(4);
  });

  it("should accept an override map", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs = [createLog("My Custom Press", new Date("2026-03-22T12:00:00Z"), 40, 10)];

    const override = { "My Custom Press": "Shoulders" as const };
    const insights = calculateTrainingInsights(logs, targetDate, override);

    expect(insights.muscleGroups.Shoulders).toBeDefined();
    expect(insights.muscleGroups.Shoulders!.sets).toBe(1);
    expect(insights.e1rm["My Custom Press"]).toBeDefined();
  });
});
