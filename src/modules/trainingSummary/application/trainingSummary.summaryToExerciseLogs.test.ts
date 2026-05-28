import { describe, expect, it } from "vitest";
import type { TrainingSummary } from "@/modules/trainingSummary/application";
import { summaryToExerciseLogs } from "@/modules/trainingSummary/application";

function makeSummary(overrides: Partial<TrainingSummary> = {}): TrainingSummary {
  return {
    year: 2025,
    month: 3,
    exerciseName: "Bench Press",
    sets: 12,
    totalReps: 120,
    totalVolume: 9600,
    maxWeight: 80,
    workoutDays: 3,
    ...overrides,
  };
}

describe("summaryToExerciseLogs", () => {
  it("returns empty array for empty summaries", () => {
    expect(summaryToExerciseLogs([])).toEqual([]);
  });

  it("returns one log per set", () => {
    const summary = makeSummary({ sets: 9, workoutDays: 3 });
    const logs = summaryToExerciseLogs([summary]);
    expect(logs).toHaveLength(9);
  });

  it("all logs have the correct exercise name", () => {
    const logs = summaryToExerciseLogs([makeSummary({ exerciseName: "Squat", sets: 6 })]);
    expect(logs.every((l) => l.exerciseName === "Squat")).toBe(true);
  });

  it("uses maxWeight for all generated log entries", () => {
    const logs = summaryToExerciseLogs([makeSummary({ maxWeight: 100, sets: 4 })]);
    expect(logs.every((l) => l.weight === 100)).toBe(true);
  });

  it("approximates reps as totalReps / sets", () => {
    const logs = summaryToExerciseLogs([makeSummary({ sets: 10, totalReps: 80 })]);
    expect(logs.every((l) => l.reps === 8)).toBe(true);
  });

  it("falls back to 10 reps when totalReps is undefined", () => {
    const logs = summaryToExerciseLogs([makeSummary({ sets: 4, totalReps: undefined })]);
    expect(logs.every((l) => l.reps === 10)).toBe(true);
  });

  it("distributes logs across distinct dates within the month", () => {
    const logs = summaryToExerciseLogs([makeSummary({ sets: 9, workoutDays: 3 })]);
    const dates = new Set(logs.map((l) => l.loggedAt.toDateString()));
    expect(dates.size).toBe(3);
  });

  it("generated dates fall within the correct month and year", () => {
    const logs = summaryToExerciseLogs([
      makeSummary({ year: 2025, month: 3, sets: 6, workoutDays: 2 }),
    ]);
    expect(
      logs.every((l) => l.loggedAt.getFullYear() === 2025 && l.loggedAt.getMonth() === 2),
    ).toBe(true);
  });

  it("all generated log IDs are unique", () => {
    const logs = summaryToExerciseLogs([makeSummary({ sets: 12, workoutDays: 4 })]);
    const ids = new Set(logs.map((l) => l.id));
    expect(ids.size).toBe(logs.length);
  });

  it("handles multiple summaries for different exercises in the same month", () => {
    const bench = makeSummary({ exerciseName: "Bench Press", sets: 6, workoutDays: 2 });
    const squat = makeSummary({ exerciseName: "Squat", sets: 6, workoutDays: 2 });
    const logs = summaryToExerciseLogs([bench, squat]);
    expect(logs.filter((l) => l.exerciseName === "Bench Press")).toHaveLength(6);
    expect(logs.filter((l) => l.exerciseName === "Squat")).toHaveLength(6);
  });

  it("handles multiple summaries across different months", () => {
    const jan = makeSummary({
      year: 2025,
      month: 1,
      exerciseName: "Squat",
      sets: 4,
      workoutDays: 2,
    });
    const feb = makeSummary({
      year: 2025,
      month: 2,
      exerciseName: "Squat",
      sets: 4,
      workoutDays: 2,
    });
    const logs = summaryToExerciseLogs([jan, feb]);
    const janLogs = logs.filter((l) => l.loggedAt.getMonth() === 0);
    const febLogs = logs.filter((l) => l.loggedAt.getMonth() === 1);
    expect(janLogs).toHaveLength(4);
    expect(febLogs).toHaveLength(4);
  });

  it("handles single workout day — all sets on one date", () => {
    const logs = summaryToExerciseLogs([makeSummary({ sets: 5, workoutDays: 1 })]);
    const dates = new Set(logs.map((l) => l.loggedAt.toDateString()));
    expect(dates.size).toBe(1);
    expect(logs).toHaveLength(5);
  });

  it("caps day-of-month to 28 to avoid invalid dates", () => {
    // 20 workout days would push day = 1 + 19*2 = 39 without capping
    const logs = summaryToExerciseLogs([makeSummary({ sets: 40, workoutDays: 20 })]);
    expect(logs.every((l) => l.loggedAt.getDate() <= 28)).toBe(true);
  });

  it("sets synthetic flag to true for all generated logs", () => {
    const logs = summaryToExerciseLogs([makeSummary({ sets: 4, workoutDays: 2 })]);
    expect(logs.length).toBe(4);
    expect(logs.every((l) => l.synthetic === true)).toBe(true);
  });
});
