import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "@/services/exerciseLogs";
import { calculateE1RM, calculateE1RMInsights } from "./e1rm";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createLog(
  exerciseName: string,
  date: Date,
  weight: number,
  reps: number,
  rpe?: number,
): ExerciseLog {
  return { id: crypto.randomUUID(), exerciseName, loggedAt: date, weight, reps, rpe };
}

const BASE = new Date("2024-01-01T12:00:00.000Z");
function daysLater(n: number) {
  return new Date(BASE.getTime() + n * 86_400_000);
}

// ---------------------------------------------------------------------------
// calculateE1RM — guard conditions
// ---------------------------------------------------------------------------

describe("calculateE1RM", () => {
  describe("guard conditions", () => {
    it("returns null for weight = 0", () => {
      expect(calculateE1RM(0, 5)).toBeNull();
    });

    it("returns null for reps = 0", () => {
      expect(calculateE1RM(100, 0)).toBeNull();
    });

    it("returns null for negative weight", () => {
      expect(calculateE1RM(-50, 5)).toBeNull();
    });

    it("returns null for reps > 20 (estimation unreliable above this range)", () => {
      expect(calculateE1RM(100, 21)).toBeNull();
      expect(calculateE1RM(100, 30)).toBeNull();
    });
  });

  describe("reps = 1 (direct measure, no formula needed)", () => {
    it("returns weight unchanged", () => {
      expect(calculateE1RM(100, 1)).toBe(100);
      expect(calculateE1RM(142.5, 1)).toBe(142.5);
    });

    it("ignores RPE when reps = 1 — weight IS the 1RM", () => {
      expect(calculateE1RM(100, 1, 8)).toBe(100);
    });
  });

  describe("Epley formula — reps 2-5 without RPE (Epley 1985)", () => {
    it("reps = 5 @ 100 kg: 100 x (1 + 5/30) = 116.7 kg", () => {
      expect(calculateE1RM(100, 5)).toBeCloseTo(100 * (1 + 5 / 30), 1);
    });

    it("reps = 2 @ 100 kg: 100 x (1 + 2/30) = 106.7 kg", () => {
      expect(calculateE1RM(100, 2)).toBeCloseTo(100 * (1 + 2 / 30), 1);
    });

    it("reps = 3 @ 100 kg: 100 x (1 + 3/30) = 110.0 kg", () => {
      expect(calculateE1RM(100, 3)).toBeCloseTo(100 * (1 + 3 / 30), 1);
    });

    it("e1RM increases monotonically with more reps at same weight", () => {
      expect(calculateE1RM(100, 5)!).toBeGreaterThan(calculateE1RM(100, 2)!);
    });
  });

  describe("Mayhew formula — reps 6-20 without RPE (Mayhew et al. 1992)", () => {
    // LeSuer et al. (1997) showed Mayhew outperforms Epley/Brzycki for 6-20 reps

    it("reps = 10 @ 80 kg matches Mayhew formula exactly", () => {
      const expected = (100 * 80) / (52.2 + 41.9 * Math.exp(-0.055 * 10));
      expect(calculateE1RM(80, 10)).toBeCloseTo(expected, 1);
    });

    it("reps = 6 @ 100 kg matches Mayhew formula", () => {
      const expected = (100 * 100) / (52.2 + 41.9 * Math.exp(-0.055 * 6));
      expect(calculateE1RM(100, 6)).toBeCloseTo(expected, 1);
    });

    it("reps = 20 is the highest valid boundary", () => {
      expect(calculateE1RM(60, 20)).not.toBeNull();
    });

    it("e1RM increases monotonically across reps 6-20 at same weight", () => {
      expect(calculateE1RM(100, 15)!).toBeGreaterThan(calculateE1RM(100, 8)!);
    });
  });

  describe("Zourdos RPE path — reps 1-12 with RPE (Zourdos et al. 2016)", () => {
    // e1RM = weight / pct1RM(reps, RPE) from empirically validated table
    // Reference: Zourdos MC et al. (2016). J Strength Cond Res, 30(1), 267-275.

    it("5 reps @ RPE 10: table 0.87 -> e1RM = 100/0.87 = 114.9 kg", () => {
      expect(calculateE1RM(100, 5, 10)).toBeCloseTo(100 / 0.87, 1);
    });

    it("5 reps @ RPE 8: table 0.77 -> e1RM = 100/0.77 = 129.9 kg", () => {
      expect(calculateE1RM(100, 5, 8)).toBeCloseTo(100 / 0.77, 1);
    });

    it("lower RPE at same reps/weight yields higher e1RM (more reps in reserve)", () => {
      const rpe10 = calculateE1RM(100, 5, 10)!;
      const rpe8 = calculateE1RM(100, 5, 8)!;
      const rpe6 = calculateE1RM(100, 5, 6)!;
      expect(rpe8).toBeGreaterThan(rpe10);
      expect(rpe6).toBeGreaterThan(rpe8);
    });

    it("RPE below 6 falls back to Epley (outside Zourdos table range)", () => {
      expect(calculateE1RM(100, 5, 5)).toBeCloseTo(calculateE1RM(100, 5)!, 1);
    });

    it("reps > 12 with RPE falls back to Mayhew (beyond Zourdos table coverage)", () => {
      const expected = (100 * 100) / (52.2 + 41.9 * Math.exp(-0.055 * 15));
      expect(calculateE1RM(100, 15, 9)).toBeCloseTo(expected, 1);
    });

    it("RPE rounded to nearest 0.5 step: RPE 8.3 treated as 8.5", () => {
      expect(calculateE1RM(100, 5, 8.3)).toBeCloseTo(calculateE1RM(100, 5, 8.5)!, 1);
    });

    it("result is rounded to 1 decimal place", () => {
      const result = calculateE1RM(87.5, 5, 8);
      expect(result).not.toBeNull();
      const decimals = result!.toString().split(".")[1]?.length ?? 0;
      expect(decimals).toBeLessThanOrEqual(1);
    });
  });

  describe("formula boundary: reps 5 uses Epley, reps 6 uses Mayhew", () => {
    it("reps = 5 without RPE matches Epley formula", () => {
      expect(calculateE1RM(100, 5)).toBeCloseTo(100 * (1 + 5 / 30), 1);
    });

    it("reps = 6 without RPE matches Mayhew formula", () => {
      const expected = (100 * 100) / (52.2 + 41.9 * Math.exp(-0.055 * 6));
      expect(calculateE1RM(100, 6)).toBeCloseTo(expected, 1);
    });
  });
});

// ---------------------------------------------------------------------------
// calculateE1RMInsights
// ---------------------------------------------------------------------------

describe("calculateE1RMInsights", () => {
  it("returns empty object for no logs", () => {
    expect(calculateE1RMInsights([])).toEqual({});
  });

  it("calculates trend across multiple sessions with increasing weight", () => {
    const logs = [
      createLog("Bench Press", daysLater(0), 100, 3),
      createLog("Bench Press", daysLater(7), 105, 3),
      createLog("Bench Press", daysLater(14), 110, 3),
      createLog("Bench Press", daysLater(21), 115, 3),
    ];
    const result = calculateE1RMInsights(logs);
    expect(result["Bench Press"]!.trend).toHaveLength(4);
    expect(result["Bench Press"]!.e1rm).toBeGreaterThan(100);
    expect(result["Bench Press"]!.plateau).toBe(false);
  });

  it("detects plateau when e1RM is stable within 5% across last 3 sessions", () => {
    const logs = [
      createLog("Squat", daysLater(0), 100, 5),
      createLog("Squat", daysLater(7), 100, 5),
      createLog("Squat", daysLater(14), 100, 5),
      createLog("Squat", daysLater(21), 100, 5),
    ];
    expect(calculateE1RMInsights(logs, undefined, daysLater(22))["Squat"]!.plateau).toBe(true);
  });

  it("does not flag plateau with fewer than 3 sessions in trend", () => {
    const logs = [
      createLog("Squat", daysLater(0), 100, 5),
      createLog("Squat", daysLater(7), 100, 5),
    ];
    expect(calculateE1RMInsights(logs)["Squat"]!.plateau).toBe(false);
  });

  it("caps trend at 4 most recent sessions", () => {
    const logs = Array.from({ length: 8 }, (_, i) =>
      createLog("Deadlift", daysLater(i * 7), 100 + i * 5, 3),
    );
    expect(calculateE1RMInsights(logs)["Deadlift"]!.trend).toHaveLength(4);
  });

  it("uses best e1RM across multiple sets within the same session", () => {
    const logs = [
      createLog("Bench Press", daysLater(0), 80, 5),
      createLog("Bench Press", daysLater(0), 100, 5),
      createLog("Bench Press", daysLater(0), 95, 5),
    ];
    const result = calculateE1RMInsights(logs);
    expect(result["Bench Press"]!.trend[0]).toBeCloseTo(calculateE1RM(100, 5)!, 1);
  });

  it("skips sets with null e1RM (reps > 20) and counts only valid sessions", () => {
    const logs = [createLog("Curl", daysLater(0), 20, 25), createLog("Curl", daysLater(7), 30, 10)];
    expect(calculateE1RMInsights(logs)["Curl"]!.trend).toHaveLength(1);
  });

  it("returns nothing for exercise where all sets have null e1RM", () => {
    const logs = [createLog("Walk", daysLater(0), 0, 0)];
    expect(calculateE1RMInsights(logs)["Walk"]).toBeUndefined();
  });

  it("case-insensitive name matching groups all variants together", () => {
    const logs = [
      createLog("bench press", daysLater(0), 100, 5),
      createLog("BENCH PRESS", daysLater(7), 102, 5),
      createLog("Bench Press", daysLater(14), 104, 5),
    ];
    const result = calculateE1RMInsights(logs);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result["bench press"]!.trend).toHaveLength(3);
  });

  it("tracks multiple exercises independently", () => {
    const logs = [
      createLog("Bench Press", daysLater(0), 100, 5),
      createLog("Squat", daysLater(0), 150, 5),
      createLog("Bench Press", daysLater(7), 102, 5),
      createLog("Squat", daysLater(7), 155, 5),
    ];
    const result = calculateE1RMInsights(logs);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result["Squat"]!.e1rm).toBeGreaterThan(result["Bench Press"]!.e1rm);
  });

  it("excludes deload week logs from trend", () => {
    const logs = [
      createLog("OHP", daysLater(0), 60, 3),
      createLog("OHP", daysLater(7), 62, 3),
      createLog("OHP", daysLater(14), 30, 3),
      createLog("OHP", daysLater(21), 64, 3),
    ];
    const deloadRange = { start: daysLater(13), end: daysLater(15) };
    const withDeload = calculateE1RMInsights(logs, [deloadRange]);
    const withoutDeload = calculateE1RMInsights(logs);
    expect(withDeload["OHP"]!.trend).toHaveLength(3);
    expect(withDeload["OHP"]!.e1rm).toBeGreaterThanOrEqual(withoutDeload["OHP"]!.e1rm);
  });

  it("tracks best RPE across all sessions", () => {
    const logs = [
      createLog("Row", daysLater(0), 100, 8, 7),
      createLog("Row", daysLater(7), 110, 6, 9),
      createLog("Row", daysLater(14), 105, 7, 8),
    ];
    expect(calculateE1RMInsights(logs)["Row"]!.bestRPE).toBe(9);
  });

  it("bestRPE is undefined when no log has RPE recorded", () => {
    const logs = [createLog("Row", daysLater(0), 100, 8), createLog("Row", daysLater(7), 110, 6)];
    expect(calculateE1RMInsights(logs)["Row"]!.bestRPE).toBeUndefined();
  });
});
