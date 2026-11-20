import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import { computeEWMAACWR } from "./acwr";

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
    const decimalPart = result?.toString().split(".")[1] ?? "";
    expect(decimalPart.length).toBeLessThanOrEqual(2);
  });

  it("returns null when EWMAchronic is 0 (no load ever recorded)", () => {
    // All logs have RPE 0 → load = 0 → both EWMAs stay at 0
    const logs: ExerciseLog[] = Array.from({ length: 5 }, (_, i) => ({
      id: crypto.randomUUID(),
      exerciseName: "Walk",
      loggedAt: new Date(BASE_DATE.getTime() - (i + 1) * 7 * 86_400_000),
      rpe: 0,
    }));
    expect(computeEWMAACWR(logs, BASE_DATE)).toBeNull();
  });
});
