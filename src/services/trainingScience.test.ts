import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "./exerciseLogs";
import {
  calculateE1RM,
  calculateE1RMInsights,
  calculateFatigueInsight,
  calculateMuscleGroupInsights,
  calculateTrainingInsights,
  computeSystemicPhase,
  type FatigueInsight,
  getMuscleActivation,
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
    // ensemble(52.5, 12): epley=73.5, brzycki=75.6, t=0.6 → 74.8
    expect(calculateE1RM(52.5, 12)).toBe(74.8);
  });

  it("should adjust e1RM based on RPE", () => {
    // 100x10 @ RPE 10 -> effective reps = 10 -> e1RM = 133.3
    expect(calculateE1RM(100, 10, 10)).toBe(133.3);

    // 100x10 @ RPE 8 -> effective reps = 12 -> ensemble: epley=140, brzycki=144, t=0.6 → 142.4
    expect(calculateE1RM(100, 10, 8)).toBe(142.4);
  });

  it("should clamp effectiveReps to 36 to avoid Brzycki division by zero", () => {
    // reps=30, rpe=3 → effectiveReps would be 30 + (10-3) = 37 → 37 - 37 = 0 → Infinity
    // Clamp to 36 → finite, positive result
    const result = calculateE1RM(100, 30, 3);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
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
    const override = {
      "Custom Exercise": { primaryMuscle: "Glutes" as const, secondaryMuscles: [] },
    };
    expect(getMuscleGroup("Custom Exercise", override)).toBe("Glutes");
  });

  it("should fall back to default if not in override", () => {
    const override = {
      "Custom Exercise": { primaryMuscle: "Glutes" as const, secondaryMuscles: [] },
    };
    expect(getMuscleGroup("Bench Press", override)).toBe("Chest");
  });
});

// --- getMuscleActivation ---

describe("getMuscleActivation", () => {
  it("should return primary muscle for isolation exercises", () => {
    const result = getMuscleActivation("Bicep Curl");
    expect(result).not.toBeNull();
    expect(result!.primaryMuscle).toBe("Biceps");
    expect(result!.secondaryMuscles).toHaveLength(0);
  });

  it("should return secondary muscles for compound exercises", () => {
    const result = getMuscleActivation("Bench Press");
    expect(result).not.toBeNull();
    expect(result!.primaryMuscle).toBe("Chest");
    expect(result!.secondaryMuscles.some((s) => s.muscleGroup === "Triceps")).toBe(true);
    expect(result!.secondaryMuscles.some((s) => s.muscleGroup === "Shoulders")).toBe(true);
  });

  it("should return null for unknown exercises", () => {
    expect(getMuscleActivation("Underwater Basket Weaving")).toBeNull();
  });

  it("should prefer override map activation over default", () => {
    const override = {
      "My Press": {
        primaryMuscle: "Shoulders" as const,
        secondaryMuscles: [{ muscleGroup: "Triceps" as const, contribution: 0.4 }],
      },
    };
    const result = getMuscleActivation("My Press", override);
    expect(result!.primaryMuscle).toBe("Shoulders");
    expect(result!.secondaryMuscles[0]!.muscleGroup).toBe("Triceps");
  });

  it("should include secondary contributions for Deadlift", () => {
    const result = getMuscleActivation("Deadlift");
    expect(result!.primaryMuscle).toBe("Back");
    const hamstrings = result!.secondaryMuscles.find((s) => s.muscleGroup === "Hamstrings");
    const glutes = result!.secondaryMuscles.find((s) => s.muscleGroup === "Glutes");
    expect(hamstrings).toBeDefined();
    expect(glutes).toBeDefined();
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

  it("should credit secondary muscles with fractional sets", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    // 4 sets of Bench Press — Triceps contribution is 0.5, Shoulders is 0.3
    const logs: ExerciseLog[] = [];
    for (let i = 0; i < 4; i++) {
      logs.push(createLog("Bench Press", new Date("2026-03-23T12:00:00Z"), 60, 10));
    }

    const insights = calculateMuscleGroupInsights(logs, targetDate);
    expect(insights.Chest!.sets).toBe(4);
    expect(insights.Triceps!.sets).toBe(2); // 4 × 0.5
    expect(insights.Shoulders!.sets).toBe(1.2); // 4 × 0.3
  });

  it("should count secondary muscle days in frequency", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    // Deadlift on 2 days — should credit Back AND Hamstrings AND Glutes frequency
    const logs = [
      createLog("Deadlift", new Date("2026-03-12T12:00:00Z"), 100, 5),
      createLog("Deadlift", new Date("2026-03-19T12:00:00Z"), 100, 5),
    ];

    const insights = calculateMuscleGroupInsights(logs, targetDate);
    expect(insights.Back!.frequencyPerWeek).toBe(1); // 2 days / 2 = 1x/wk
    expect(insights.Hamstrings!.frequencyPerWeek).toBe(1);
    expect(insights.Glutes!.frequencyPerWeek).toBe(1);
  });
});

// --- Deload Detection ---

describe("calculateFatigueInsight", () => {
  it("should detect deload when volume rises for 4 consecutive weeks above 125% of prior average", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];

    // Week 1: 30 sets, Week 2: 35, Week 3: 40, Week 4: 45
    const weekSets = [30, 35, 40, 45];
    for (let w = 3; w >= 0; w--) {
      for (let s = 0; s < weekSets[3 - w]!; s++) {
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

  it("should compute weeklyTonnage as weight × reps per week", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];

    // Week 4 (most recent): 3 sets of 10 reps @ 100kg = 3000
    for (let s = 0; s < 3; s++) {
      const d = new Date(targetDate);
      d.setDate(d.getDate() - 1); // 1 day ago = week 4
      logs.push(createLog("Bench Press", d, 100, 10));
    }
    // Week 3: 2 sets of 8 reps @ 80kg = 1280
    for (let s = 0; s < 2; s++) {
      const d = new Date(targetDate);
      d.setDate(d.getDate() - 8); // 8 days ago = week 3
      logs.push(createLog("Bench Press", d, 80, 8));
    }

    const e1rm = calculateE1RMInsights(logs);
    const fatigue = calculateFatigueInsight(logs, e1rm, targetDate);

    expect(fatigue.weeklyTonnage).toHaveLength(4);
    expect(fatigue.weeklyTonnage[3]).toBe(3000); // week 4: 3 × 100 × 10 × (10/10)
    expect(fatigue.weeklyTonnage[2]).toBe(1280); // week 3: 2 × 80 × 8 × (10/10)
    expect(fatigue.weeklyTonnage[0]).toBe(0); // week 1: no logs
  });

  it("should scale tonnage by RPE multiplier when rpe is provided", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const d = new Date(targetDate);
    d.setDate(d.getDate() - 1);
    // 100kg × 10 reps @ RPE 8 → multiplier 0.8 → tonnage = 800
    const log: ExerciseLog = {
      id: crypto.randomUUID(),
      exerciseName: "Bench Press",
      loggedAt: d,
      weight: 100,
      reps: 10,
      rpe: 8,
      distance: undefined,
      duration: undefined,
    };
    const e1rm = calculateE1RMInsights([log]);
    const fatigue = calculateFatigueInsight([log], e1rm, targetDate);
    expect(fatigue.weeklyTonnage[3]).toBeCloseTo(800);
  });

  it("should trigger deload on standalone tonnage spike (set count stable, load jumps 50%+)", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];

    // Weeks 1–3 ago: stable 3 sets at 60kg × 10 = 1800 tonnage/week
    for (let w = 1; w <= 3; w++) {
      const d = new Date(targetDate);
      d.setDate(d.getDate() - w * 7 - 3);
      for (let s = 0; s < 3; s++) {
        logs.push(createLog("Bench Press", d, 60, 10));
      }
    }
    // Current week: same 3 sets but at 150kg × 10 = 4500 tonnage (150% above prior avg 1800)
    const thisWeek = new Date(targetDate);
    thisWeek.setDate(thisWeek.getDate() - 1);
    for (let s = 0; s < 3; s++) {
      logs.push(createLog("Bench Press", thisWeek, 150, 10));
    }

    const e1rm = calculateE1RMInsights(logs);
    const fatigue = calculateFatigueInsight(logs, e1rm, targetDate);
    expect(fatigue.shouldDeload).toBe(true);
    expect(fatigue.reason).toContain("tonnage");
  });

  it("should trigger deload on standalone set-count spike without progressive increase (e.g. [15,15,15,40])", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];

    // 3 prior weeks: stable 15 sets/week
    for (let w = 1; w <= 3; w++) {
      const d = new Date(targetDate);
      d.setDate(d.getDate() - w * 7 - 3);
      for (let s = 0; s < 15; s++) {
        logs.push(createLog("Squat", d, 80, 8));
      }
    }
    // Current week: sudden jump to 40 sets (167% above prior avg 15)
    const thisWeek = new Date(targetDate);
    thisWeek.setDate(thisWeek.getDate() - 1);
    for (let s = 0; s < 40; s++) {
      logs.push(createLog("Squat", thisWeek, 80, 8));
    }

    const e1rm = calculateE1RMInsights(logs);
    const fatigue = calculateFatigueInsight(logs, e1rm, targetDate);
    expect(fatigue.shouldDeload).toBe(true);
    expect(fatigue.reason).toContain("spiked");
  });

  it("should NOT trigger deload for normal beginner volume progression (no spike in either sets or tonnage)", () => {
    // Pattern: [4, 4, 4, 5] — small absolute increase, well below the 12-set floor for set spike
    // and well below 50% tonnage threshold for tonnage spike.
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];
    const weekSets = [4, 4, 4, 5]; // week 1=oldest, week 4=current

    for (let w = 0; w < 4; w++) {
      const weeksAgo = 3 - w; // w=0 → 3 weeks ago, w=3 → current
      const d = new Date(targetDate);
      d.setDate(d.getDate() - weeksAgo * 7 - 3);
      for (let s = 0; s < (weekSets[w] ?? 0); s++) {
        logs.push(createLog("Bench Press", d, 60, 10));
      }
    }

    const e1rm = calculateE1RMInsights(logs);
    const fatigue = calculateFatigueInsight(logs, e1rm, targetDate);
    expect(fatigue.shouldDeload).toBe(false);
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

    const override = {
      "My Custom Press": { primaryMuscle: "Shoulders" as const, secondaryMuscles: [] },
    };
    const insights = calculateTrainingInsights(logs, targetDate, override);

    expect(insights.muscleGroups.Shoulders).toBeDefined();
    expect(insights.muscleGroups.Shoulders!.sets).toBe(1);
    expect(insights.e1rm["My Custom Press"]).toBeDefined();
  });

  it("should include phase in the result", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const insights = calculateTrainingInsights([], targetDate);

    expect(insights.phase).toBeDefined();
    expect(["Inactive", "Maintain", "Build", "Deload"]).toContain(insights.phase);
  });

  it("should return 'Inactive' phase for an empty log set", () => {
    const insights = calculateTrainingInsights([]);
    expect(insights.phase).toBe("Inactive");
  });

  it("should return null acwr when there is no training history", () => {
    const insights = calculateTrainingInsights([]);
    expect(insights.acwr).toBeNull();
  });

  it("should return null acwr when all logs are within the last 7 days (no chronic baseline)", () => {
    // Returning athlete after a 3-week gap — only trained this week
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];
    for (let d = 1; d <= 5; d++) {
      const date = new Date(targetDate);
      date.setDate(date.getDate() - d);
      logs.push(createLog("Bench Press", date, 100, 10));
    }
    const insights = calculateTrainingInsights(logs, targetDate);
    expect(insights.acwr).toBeNull();
  });

  it("should return 1.0 acwr when load is perfectly consistent across 4 weeks", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];

    // Same load every day for 28 days: 4 sets × 10 reps × 50kg = 2000/day
    for (let d = 1; d <= 28; d++) {
      const date = new Date(targetDate);
      date.setDate(date.getDate() - d);
      logs.push(createLog("Bench Press", date, 50, 10));
      logs.push(createLog("Bench Press", date, 50, 10));
      logs.push(createLog("Bench Press", date, 50, 10));
      logs.push(createLog("Bench Press", date, 50, 10));
    }

    const insights = calculateTrainingInsights(logs, targetDate);
    // acuteLoad = 7 days × 4 sets × 50 × 10 = 14000
    // chronicWeekly = (28 days × 4 × 50 × 10) / 4 = 14000
    // ACWR = 14000 / 14000 = 1.0
    expect(insights.acwr).toBe(1);
  });

  it("should return acwr > 1 when acute load spikes above chronic baseline", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];

    // Weeks 2–4 ago: 1 set/day at 50kg × 10 (low baseline)
    for (let d = 8; d <= 28; d++) {
      const date = new Date(targetDate);
      date.setDate(date.getDate() - d);
      logs.push(createLog("Bench Press", date, 50, 10));
    }
    // Last 7 days: 5 sets/day at 100kg × 10 (spike)
    for (let d = 1; d <= 7; d++) {
      const date = new Date(targetDate);
      date.setDate(date.getDate() - d);
      for (let s = 0; s < 5; s++) {
        logs.push(createLog("Bench Press", date, 100, 10));
      }
    }

    const insights = calculateTrainingInsights(logs, targetDate);
    expect(insights.acwr).not.toBeNull();
    expect(insights.acwr!).toBeGreaterThan(1.3);
  });

  it("should return ~1.0 acwr for a week-2 athlete with consistent load (not 2.0 from fixed /4)", () => {
    // Bug: old code always divided chronicLoad by 4.
    // A week-2 athlete only has 2 weeks of history → old code gave chronic = totalLoad/4
    // instead of totalLoad/2, making ACWR look like 2.0 for consistent training.
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];

    // Week 1 (days 8–14): same load as week 2
    for (let d = 8; d <= 14; d++) {
      const date = new Date(targetDate);
      date.setDate(date.getDate() - d);
      logs.push(createLog("Bench Press", date, 50, 10));
    }
    // Week 2 / current (days 1–7): same load
    for (let d = 1; d <= 7; d++) {
      const date = new Date(targetDate);
      date.setDate(date.getDate() - d);
      logs.push(createLog("Bench Press", date, 50, 10));
    }

    const insights = calculateTrainingInsights(logs, targetDate);
    // Both weeks have identical load → ACWR should be 1.0, not 2.0
    expect(insights.acwr).not.toBeNull();
    expect(insights.acwr!).toBeCloseTo(1.0, 1);
  });

  it("should produce different acwr for athletes of different bodyweight doing bodyweight exercises", () => {
    // Two athletes doing Pull-Ups (no weight logged). A heavier athlete produces higher load
    // → higher effective tonnage → higher acwr for the same training stimulus.
    const targetDate = new Date("2024-01-28");
    function makeBodyweightLogs(): ExerciseLog[] {
      return [3, 10, 17, 24].map((d) => ({
        id: crypto.randomUUID(),
        exerciseName: "Pull-Ups",
        reps: 8,
        sets: 3,
        rpe: 7,
        loggedAt: new Date(targetDate.getTime() - d * 86_400_000),
      }));
    }
    const lightInsights = calculateTrainingInsights(makeBodyweightLogs(), targetDate, undefined, 50);
    const heavyInsights = calculateTrainingInsights(makeBodyweightLogs(), targetDate, undefined, 100);
    expect(lightInsights.acwr).not.toBeNull();
    expect(heavyInsights.acwr).not.toBeNull();
    // Same ACWR ratio but derived from different absolute loads — both should equal ~1.0
    expect(lightInsights.acwr!).toBeCloseTo(heavyInsights.acwr!, 1);
  });
});

// --- Mesocycle Week ---

describe("mesocycleWeek in calculateTrainingInsights", () => {
  it("should return 1 when there are no logs", () => {
    const insights = calculateTrainingInsights([]);
    expect(insights.mesocycleWeek).toBe(1);
  });

  it("should count weeks from the first active week when no deload is detected", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];

    // 3 active weeks of training (weeks 3, 2, 1 ago)
    for (let w = 1; w <= 3; w++) {
      const date = new Date(targetDate);
      date.setDate(date.getDate() - w * 7 + 1);
      logs.push(createLog("Squat", date, 80, 5));
    }

    const insights = calculateTrainingInsights(logs, targetDate);
    // First active week was 3 weeks ago → mesocycleWeek = 3
    expect(insights.mesocycleWeek).toBe(3);
  });

  it("should reset week count after a detected deload week", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];

    // Helper: create a date safely inside week W ago's bucket
    // Bucket for W weeks ago = (targetDate - W*7 - 7, targetDate - W*7]
    // Placing at -W*7 - 3 days lands in the middle of the bucket
    const midWeek = (w: number) => {
      const d = new Date(targetDate);
      d.setDate(d.getDate() - w * 7 - 3);
      return d;
    };

    // Weeks 7–4 ago: normal load (10 sets/week)
    for (let w = 4; w <= 7; w++) {
      for (let s = 0; s < 10; s++) {
        logs.push(createLog("Bench Press", midWeek(w), 80, 8));
      }
    }

    // Week 3 ago: deload (only 1 set — well below 50% of 10-set baseline)
    logs.push(createLog("Bench Press", midWeek(3), 60, 8));

    // Weeks 2 and 1 ago: normal training resumed (10 sets/week)
    for (let w = 1; w <= 2; w++) {
      for (let s = 0; s < 10; s++) {
        logs.push(createLog("Bench Press", midWeek(w), 80, 8));
      }
    }

    const insights = calculateTrainingInsights(logs, targetDate);
    // Deload was 3 weeks ago → week after deload = 2 weeks ago = week 1 of new block,
    // last week = week 2, current (empty) week = week 3
    expect(insights.mesocycleWeek).toBe(3);
  });

  it("should be included in calculateTrainingInsights result", () => {
    const insights = calculateTrainingInsights([]);
    expect(insights).toHaveProperty("mesocycleWeek");
    expect(typeof insights.mesocycleWeek).toBe("number");
  });

  it("should NOT count a vacation (zero-set week with low prior baseline) as a deload", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];

    const midWeek = (w: number) => {
      const d = new Date(targetDate);
      d.setDate(d.getDate() - w * 7 - 3);
      return d;
    };

    // Only 1–2 sets/week before the gap — below MIN_ACTIVE_SETS_FOR_DELOAD (4)
    for (let w = 5; w <= 7; w++) {
      logs.push(createLog("Bench Press", midWeek(w), 80, 8));
    }
    // Week 3 ago: 0 sets (vacation)
    // Weeks 2 and 1 ago: back to 1 set/week
    for (let w = 1; w <= 2; w++) {
      logs.push(createLog("Bench Press", midWeek(w), 80, 8));
    }

    const insights = calculateTrainingInsights(logs, targetDate);
    // The zero-set vacation week should NOT reset the counter — prior avg was ~1 set/week < 4
    // mesocycleWeek should count from first active week, not from the vacation gap
    expect(insights.mesocycleWeek).toBeGreaterThan(2);
  });
});

// --- Systemic Phase Detection ---

describe("computeSystemicPhase", () => {
  function fatigue(overrides?: Partial<FatigueInsight>): FatigueInsight {
    return {
      shouldDeload: false,
      weeklyTotalSets: [],
      weeklyTonnage: [],
      ...overrides,
    };
  }

  it("returns 'Deload' when shouldDeload is true regardless of volume", () => {
    expect(
      computeSystemicPhase(
        fatigue({
          shouldDeload: true,
          weeklyTotalSets: [5, 5, 5, 5],
        }),
      ),
    ).toBe("Deload");
  });

  it("returns 'Inactive' when 2-week trailing volume is below 24", () => {
    expect(
      computeSystemicPhase(
        fatigue({
          weeklyTotalSets: [10, 12, 5, 5],
        }),
      ),
    ).toBe("Inactive");
  });

  it("returns 'Inactive' with empty trend", () => {
    expect(
      computeSystemicPhase(
        fatigue({
          weeklyTotalSets: [],
        }),
      ),
    ).toBe("Inactive");
  });

  it("returns 'Inactive' with single-entry trend", () => {
    expect(
      computeSystemicPhase(
        fatigue({
          weeklyTotalSets: [10],
        }),
      ),
    ).toBe("Inactive");
  });

  it("returns 'Build' when volume is increasing and above threshold", () => {
    expect(
      computeSystemicPhase(
        fatigue({
          weeklyTotalSets: [10, 12, 14, 16],
        }),
      ),
    ).toBe("Build");
  });

  it("returns 'Maintain' when volume is stable above threshold", () => {
    expect(
      computeSystemicPhase(
        fatigue({
          weeklyTotalSets: [14, 14, 14, 14],
        }),
      ),
    ).toBe("Maintain");
  });

  it("returns 'Maintain' when volume decreases but stays above threshold", () => {
    expect(
      computeSystemicPhase(
        fatigue({
          weeklyTotalSets: [20, 18, 16, 14],
        }),
      ),
    ).toBe("Maintain");
  });

  it("returns 'Deload' with priority over Build", () => {
    // Even if volume is increasing, deload flag takes precedence
    expect(
      computeSystemicPhase(
        fatigue({
          shouldDeload: true,
          weeklyTotalSets: [10, 12, 14, 16],
        }),
      ),
    ).toBe("Deload");
  });

  it("handles boundary case at exactly 24 total 2-week volume", () => {
    // last=12, previous=12 → sum=24, NOT < 24 → should NOT be Inactive
    expect(
      computeSystemicPhase(
        fatigue({
          weeklyTotalSets: [10, 10, 12, 12],
        }),
      ),
    ).toBe("Maintain");
  });

  it("handles volume just under threshold (23 total)", () => {
    expect(
      computeSystemicPhase(
        fatigue({
          weeklyTotalSets: [10, 10, 11, 12],
        }),
      ),
    ).toBe("Inactive");
  });
});

// --- Volume Landmark Edge Cases ---

describe("volume landmark edge cases", () => {
  it("should not include Abs in results when no ab exercises are logged", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    // No ab exercises → Abs should not appear in results at all
    const logs = [createLog("Bench Press", new Date("2026-03-23T12:00:00Z"), 60, 10)];
    const insights = calculateMuscleGroupInsights(logs, targetDate);
    expect(insights.Abs).toBeUndefined();
  });

  it("should classify Abs with 1 set as below_MEV (mev raised to 2)", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs = [createLog("Crunches", new Date("2026-03-23T12:00:00Z"), 0, 15)];
    const insights = calculateMuscleGroupInsights(logs, targetDate);
    expect(insights.Abs!.landmark).toBe("below_MEV");
  });

  it("should classify Chest at exact MEV boundary (8 sets)", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];
    for (let i = 0; i < 8; i++) {
      logs.push(createLog("Bench Press", new Date("2026-03-23T12:00:00Z"), 60, 10));
    }
    const insights = calculateMuscleGroupInsights(logs, targetDate);
    expect(insights.Chest!.landmark).toBe("at_MEV");
  });

  it("should classify Chest just below MEV (7 sets) as below_MEV", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];
    for (let i = 0; i < 7; i++) {
      logs.push(createLog("Bench Press", new Date("2026-03-23T12:00:00Z"), 60, 10));
    }
    const insights = calculateMuscleGroupInsights(logs, targetDate);
    expect(insights.Chest!.landmark).toBe("below_MEV");
  });

  it("should classify Chest at exact MRV boundary (22 sets) as above_MRV", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];
    for (let i = 0; i < 22; i++) {
      logs.push(createLog("Bench Press", new Date("2026-03-23T12:00:00Z"), 60, 10));
    }
    const insights = calculateMuscleGroupInsights(logs, targetDate);
    expect(insights.Chest!.landmark).toBe("above_MRV");
  });

  it("should classify Chest at mavHigh boundary (18 sets) as approaching_MRV", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];
    for (let i = 0; i < 18; i++) {
      logs.push(createLog("Bench Press", new Date("2026-03-23T12:00:00Z"), 60, 10));
    }
    const insights = calculateMuscleGroupInsights(logs, targetDate);
    expect(insights.Chest!.landmark).toBe("approaching_MRV");
  });

  it("should classify Chest at 11 sets as at_MEV (below new mavLow=12)", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];
    for (let i = 0; i < 11; i++) {
      logs.push(createLog("Bench Press", new Date("2026-03-23T12:00:00Z"), 60, 10));
    }
    const insights = calculateMuscleGroupInsights(logs, targetDate);
    expect(insights.Chest!.landmark).toBe("at_MEV");
  });
});

// --- e1RM RPE Edge Cases ---

describe("calculateE1RM RPE edge cases", () => {
  it("should handle RPE 6 correctly (4 reps in reserve)", () => {
    // 100x5 @ RPE 6 → effective reps = 9
    // ensemble: epley=130, brzycki=128.6, t=0.45 → 129.4
    expect(calculateE1RM(100, 5, 6)).toBe(129.4);
  });

  it("should treat undefined RPE as RPE 10", () => {
    expect(calculateE1RM(100, 10)).toBe(calculateE1RM(100, 10, 10));
  });

  it("should handle 1 rep at RPE 10 (true 1RM)", () => {
    // effectiveReps = 1 + (10-10) = 1 → returns weight directly
    expect(calculateE1RM(100, 1, 10)).toBe(100);
  });

  it("should handle 1 rep at RPE 8 (2 reps in reserve)", () => {
    // effectiveReps = 3
    // ensemble: epley=110, brzycki=105.9, t=0.15 → 109.4
    expect(calculateE1RM(100, 1, 8)).toBe(109.4);
  });
});

// --- Fatigue Detection Edge Cases ---

describe("calculateFatigueInsight edge cases", () => {
  it("should not trigger deload when volume increases gradually (no 25%+ spike vs prior average)", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [];

    // 4 weeks: 20, 22, 24, 26 — increasing but week 4 is only ~10% above prior avg (22) → no spike
    const weekSets = [20, 22, 24, 26];
    for (let w = 3; w >= 0; w--) {
      for (let s = 0; s < weekSets[3 - w]!; s++) {
        const d = new Date(targetDate);
        d.setDate(d.getDate() - w * 7 - 1);
        logs.push(createLog("Bench Press", d, 60, 10));
      }
    }

    const e1rm = calculateE1RMInsights(logs);
    const fatigue = calculateFatigueInsight(logs, e1rm, targetDate);
    expect(fatigue.shouldDeload).toBe(false);
  });

  it("should not trigger deload for a single declining exercise", () => {
    const e1rm = {
      "Bench Press": { e1rm: 70, trend: [80, 70], plateau: false },
    };
    const fatigue = calculateFatigueInsight([], e1rm);
    expect(fatigue.shouldDeload).toBe(false);
  });

  it("should require >5% decline for e1RM performance trigger", () => {
    // 3% decline should NOT trigger
    const e1rm = {
      "Bench Press": { e1rm: 97, trend: [100, 100, 97], plateau: false },
      Squat: { e1rm: 97, trend: [100, 100, 97], plateau: false },
    };
    const fatigue = calculateFatigueInsight([], e1rm);
    expect(fatigue.shouldDeload).toBe(false);
  });

  it("should require 3+ sessions in trend to detect performance decline (no single-day false positives)", () => {
    // 2-point trend: current 90 vs prev 100 = 10% decline, but only 2 sessions → ignored
    const e1rm = {
      "Bench Press": { e1rm: 90, trend: [100, 90], plateau: false },
      Squat: { e1rm: 90, trend: [100, 90], plateau: false },
    };
    const fatigue = calculateFatigueInsight([], e1rm);
    expect(fatigue.shouldDeload).toBe(false);
  });

  it("should trigger deload when >5% decline is sustained over 3+ sessions in 2+ exercises", () => {
    // 3-point trend: [100, 100, 90] → prior2Avg=100, current=90, decline=10% → triggers
    const e1rm = {
      "Bench Press": { e1rm: 90, trend: [100, 100, 90], plateau: false },
      Squat: { e1rm: 90, trend: [100, 100, 90], plateau: false },
    };
    const fatigue = calculateFatigueInsight([], e1rm);
    expect(fatigue.shouldDeload).toBe(true);
    expect(fatigue.reason).toContain("declining");
  });

  it("should filter out logs without reps from weekly set count", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs = [
      // This log has no reps (cardio/distance-based) — should be excluded
      createLog("Running", new Date("2026-03-23T12:00:00Z"), undefined, undefined),
      createLog("Bench Press", new Date("2026-03-23T12:00:00Z"), 60, 10),
    ];
    const e1rm = calculateE1RMInsights(logs);
    const fatigue = calculateFatigueInsight(logs, e1rm, targetDate);
    // Only the Bench Press log should count
    expect(fatigue.weeklyTotalSets[3]).toBe(1);
  });
});
