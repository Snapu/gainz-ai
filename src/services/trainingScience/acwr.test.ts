import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "@/services/exerciseLogs";
import { computeACWR, computeEWMAACWR } from "./acwr";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_DATE = new Date("2024-03-17T12:00:00.000Z");

function createLog(daysAgo: number, weight = 100, reps = 5, rpe?: number): ExerciseLog {
  return {
    id: crypto.randomUUID(),
    exerciseName: "Squat",
    loggedAt: new Date(BASE_DATE.getTime() - daysAgo * 86_400_000),
    weight,
    reps,
    rpe,
  };
}

// ---------------------------------------------------------------------------
// computeACWR — Rolling average method
// ---------------------------------------------------------------------------

describe("computeACWR (rolling average)", () => {
  it("returns null for empty logs", () => {
    expect(computeACWR([], BASE_DATE)).toBeNull();
  });

  it("returns null when all logs are within the acute window (no pre-acute baseline)", () => {
    const logs = [createLog(1), createLog(3), createLog(6)];
    expect(computeACWR(logs, BASE_DATE)).toBeNull();
  });

  it("returns null when logs sit exactly on the acute boundary (day 7 inclusive)", () => {
    const logs = [createLog(7), createLog(4)];
    // day-7 log: age = 7 days = 7 * MS_PER_DAY → still acute
    expect(computeACWR(logs, BASE_DATE)).toBeNull();
  });

  it("returns a value when there is at least one pre-acute log (day 8+)", () => {
    const logs = [createLog(10), createLog(3)];
    expect(computeACWR(logs, BASE_DATE)).not.toBeNull();
  });

  it("returns 1.0 when acute load equals chronic weekly average", () => {
    // 3 pre-acute + 1 acute, all with load = 100×5 = 500
    // chronicTotal = 4 × 500 = 2000; chronicWeekly = 2000 / 4 = 500
    // acuteLoad = 500
    // ACWR = 500 / 500 = 1.0
    const logs = [
      createLog(10), // pre-acute
      createLog(14), // pre-acute
      createLog(18), // pre-acute
      createLog(4), // acute
    ];
    expect(computeACWR(logs, BASE_DATE)).toBeCloseTo(1.0, 2);
  });

  it("returns > 1.0 when acute load exceeds chronic weekly average (spike)", () => {
    // Chronic: 1 log in pre-acute → chronic_total = 500, chronic_weekly = 500/4 = 125
    // Acute:   3 logs → acute = 1500
    // ACWR = 1500 / 125 = 12 (very high spike)
    const logs = [
      createLog(15), // pre-acute
      createLog(1),
      createLog(3),
      createLog(5),
    ];
    const acwr = computeACWR(logs, BASE_DATE);
    expect(acwr).not.toBeNull();
    expect(acwr!).toBeGreaterThan(1.0);
  });

  it("returns < 1.0 when acute load is below chronic weekly average (deload)", () => {
    // Heavy chronic training, light acute week
    const logs = [
      createLog(10, 100, 10), // pre-acute, high load
      createLog(12, 100, 10),
      createLog(14, 100, 10),
      createLog(3, 100, 1), // acute, very light
    ];
    const acwr = computeACWR(logs, BASE_DATE);
    expect(acwr).not.toBeNull();
    expect(acwr!).toBeLessThan(1.0);
  });

  it("ignores logs outside the 28-day window", () => {
    const logsWithOld = [
      createLog(35, 100, 100), // beyond 28-day window — should be ignored
      createLog(15),
      createLog(4),
    ];
    const logsWithout = [createLog(15), createLog(4)];
    expect(computeACWR(logsWithOld, BASE_DATE)).toBeCloseTo(
      computeACWR(logsWithout, BASE_DATE)!,
      2,
    );
  });

  it("ignores future logs (loggedAt after targetDate)", () => {
    const logsWithFuture = [
      createLog(-2, 100, 100), // future log
      createLog(15),
      createLog(4),
    ];
    const logsWithout = [createLog(15), createLog(4)];
    expect(computeACWR(logsWithFuture, BASE_DATE)).toBeCloseTo(
      computeACWR(logsWithout, BASE_DATE)!,
      2,
    );
  });

  it("RPE on a log does not affect volume load calculation", () => {
    // Both logs have the same weight/reps — different RPE must not change the result
    const withRPE = [createLog(15, 100, 5, 10), createLog(4, 100, 5, 6)];
    const withoutRPE = [createLog(15, 100, 5), createLog(4, 100, 5)];
    expect(computeACWR(withRPE, BASE_DATE)).toBeCloseTo(computeACWR(withoutRPE, BASE_DATE)!, 2);
  });

  it("rounds result to 2 decimal places", () => {
    const logs = [createLog(15, 73, 7), createLog(4, 88, 6)];
    const acwr = computeACWR(logs, BASE_DATE);
    expect(acwr).not.toBeNull();
    const decimalPart = acwr!.toString().split(".")[1] ?? "";
    expect(decimalPart.length).toBeLessThanOrEqual(2);
  });

  it("handles logs with missing weight or reps (treats as 0)", () => {
    const logs: ExerciseLog[] = [
      {
        id: crypto.randomUUID(),
        exerciseName: "Run",
        loggedAt: new Date(BASE_DATE.getTime() - 15 * 86_400_000),
      },
      {
        id: crypto.randomUUID(),
        exerciseName: "Run",
        loggedAt: new Date(BASE_DATE.getTime() - 4 * 86_400_000),
      },
    ];
    // Both loads are 0 → chronic = 0 → null
    expect(computeACWR(logs, BASE_DATE)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeEWMAACWR — Exponentially weighted moving average method
// ---------------------------------------------------------------------------

describe("computeEWMAACWR (EWMA)", () => {
  it("returns null for empty logs", () => {
    expect(computeEWMAACWR([], BASE_DATE)).toBeNull();
  });

  it("returns null when history is shorter than 7 days", () => {
    const logs = [createLog(3), createLog(1)];
    expect(computeEWMAACWR(logs, BASE_DATE)).toBeNull();
  });

  it("returns null when all logs are in the future", () => {
    const logs = [createLog(-5), createLog(-1)];
    expect(computeEWMAACWR(logs, BASE_DATE)).toBeNull();
  });

  it("returns a number when history spans at least 7 days", () => {
    const logs = [createLog(28), createLog(21), createLog(14), createLog(7), createLog(1)];
    expect(computeEWMAACWR(logs, BASE_DATE)).not.toBeNull();
  });

  it("returns > 1.0 after a sudden training spike", () => {
    // Low steady baseline, then burst of volume in the acute window
    const baseline = Array.from({ length: 8 }, (_, i) => createLog(28 - i * 3, 50, 3));
    const spike = [createLog(1, 100, 10), createLog(2, 100, 10), createLog(3, 100, 10)];
    const result = computeEWMAACWR([...baseline, ...spike], BASE_DATE);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(1.0);
  });

  it("returns < 1.0 after a deload week following heavy training", () => {
    // Heavy training for several weeks, then nothing in the acute window
    const heavy = Array.from({ length: 10 }, (_, i) => createLog(8 + i * 2, 120, 8));
    const deload: ExerciseLog[] = []; // no acute-week training
    const result = computeEWMAACWR([...heavy, ...deload], BASE_DATE);
    // EWMAacute decays toward 0, EWMAchronic stays elevated → ratio < 1
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(1.0);
  });

  it("accepts custom lambda parameters", () => {
    const logs = [createLog(28), createLog(21), createLog(14), createLog(7), createLog(1)];
    const defaultResult = computeEWMAACWR(logs, BASE_DATE);
    const customResult = computeEWMAACWR(logs, BASE_DATE, 0.5, 0.2);
    // Different lambdas should yield different ratios for the same logs
    expect(defaultResult).not.toBe(customResult);
  });

  it("ignores future logs", () => {
    const logs = [createLog(28), createLog(14), createLog(7), createLog(1)];
    const logsWithFuture = [...logs, createLog(-3, 100, 100)];
    expect(computeEWMAACWR(logs, BASE_DATE)).toBeCloseTo(
      computeEWMAACWR(logsWithFuture, BASE_DATE)!,
      2,
    );
  });

  it("rounds result to 2 decimal places", () => {
    const logs = [
      createLog(28, 73, 7),
      createLog(14, 88, 6),
      createLog(7, 55, 9),
      createLog(2, 91, 4),
    ];
    const result = computeEWMAACWR(logs, BASE_DATE);
    expect(result).not.toBeNull();
    const decimalPart = result!.toString().split(".")[1] ?? "";
    expect(decimalPart.length).toBeLessThanOrEqual(2);
  });

  it("returns null when EWMAchronic is 0 (no load ever recorded)", () => {
    // All logs have weight/reps undefined → load = 0 → both EWMAs stay at 0
    const logs: ExerciseLog[] = Array.from({ length: 5 }, (_, i) => ({
      id: crypto.randomUUID(),
      exerciseName: "Walk",
      loggedAt: new Date(BASE_DATE.getTime() - (i + 1) * 7 * 86_400_000),
    }));
    expect(computeEWMAACWR(logs, BASE_DATE)).toBeNull();
  });
});
