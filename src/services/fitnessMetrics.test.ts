import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "./exerciseLogs";
import { calculateProgressiveOverload, calculateWeeklyVolume } from "./fitnessMetrics";

function createExerciseLog({
  exerciseName,
  loggedAt,
  reps,
  weight,
}: {
  exerciseName: string;
  loggedAt: Date;
  reps?: number;
  weight?: number;
}): ExerciseLog {
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

describe("fitnessMetrics - calculateWeeklyVolume", () => {
  it("should aggregate sets and reps for exercises in the last 7 days", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [
      createExerciseLog({
        exerciseName: "Bench Press",
        loggedAt: new Date("2026-03-24T12:00:00Z"),
        reps: 10,
      }),
      createExerciseLog({
        exerciseName: "Bench Press",
        loggedAt: new Date("2026-03-24T12:05:00Z"),
        reps: 8,
      }),
      createExerciseLog({
        exerciseName: "Squat",
        loggedAt: new Date("2026-03-20T12:00:00Z"),
        reps: 5,
      }),
    ];

    const volume = calculateWeeklyVolume(logs, targetDate);

    expect(volume).toHaveLength(2);

    const benchVolume = volume.find((v: any) => v.exerciseName === "Bench Press");
    expect(benchVolume).toBeDefined();
    expect(benchVolume?.sets).toBe(2);
    expect(benchVolume?.totalReps).toBe(18);

    const squatVolume = volume.find((v: any) => v.exerciseName === "Squat");
    expect(squatVolume).toBeDefined();
    expect(squatVolume?.sets).toBe(1);
    expect(squatVolume?.totalReps).toBe(5);
  });

  it("should ignore logs older than 7 days", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [
      createExerciseLog({
        exerciseName: "Bench Press",
        loggedAt: new Date("2026-03-24T12:00:00Z"),
        reps: 10,
      }),
      // 8 days ago
      createExerciseLog({
        exerciseName: "Bench Press",
        loggedAt: new Date("2026-03-17T11:59:00Z"),
        reps: 10,
      }),
    ];

    const volume = calculateWeeklyVolume(logs, targetDate);

    expect(volume).toHaveLength(1);
    expect(volume[0]?.sets).toBe(1);
    expect(volume[0]?.totalReps).toBe(10);
  });

  it("should return empty array when no logs exist", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const volume = calculateWeeklyVolume([], targetDate);
    expect(volume).toEqual([]);
  });
});

describe("fitnessMetrics - calculateProgressiveOverload", () => {
  it("should report 'progressed' when weight increases", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [
      // Previous week (100kg max)
      createExerciseLog({
        exerciseName: "Squat",
        loggedAt: new Date("2026-03-15T12:00:00Z"),
        weight: 100,
        reps: 5,
      }),
      // Current week (105kg max)
      createExerciseLog({
        exerciseName: "Squat",
        loggedAt: new Date("2026-03-22T12:00:00Z"),
        weight: 105,
        reps: 5,
      }),
    ];

    const overload = calculateProgressiveOverload(logs, targetDate);

    expect(overload).toHaveLength(1);
    expect(overload[0]?.exerciseName).toBe("Squat");
    expect(overload[0]?.status).toBe("progressed");
    expect(overload[0]?.previousMaxWeight).toBe(100);
    expect(overload[0]?.currentMaxWeight).toBe(105);
  });

  it("should report 'progressed' when reps increase at same max weight", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [
      // Previous week (100kg x 5 max)
      createExerciseLog({
        exerciseName: "Squat",
        loggedAt: new Date("2026-03-15T12:00:00Z"),
        weight: 100,
        reps: 5,
      }),
      // Current week (100kg x 8 max)
      createExerciseLog({
        exerciseName: "Squat",
        loggedAt: new Date("2026-03-22T12:00:00Z"),
        weight: 100,
        reps: 8,
      }),
    ];

    const overload = calculateProgressiveOverload(logs, targetDate);

    expect(overload[0]?.status).toBe("progressed");
    expect(overload[0]?.currentMaxRepsAtMaxWeight).toBe(8);
  });

  it("should report 'maintained' when weight and reps are identical", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [
      createExerciseLog({
        exerciseName: "Squat",
        loggedAt: new Date("2026-03-15T12:00:00Z"),
        weight: 100,
        reps: 5,
      }),
      createExerciseLog({
        exerciseName: "Squat",
        loggedAt: new Date("2026-03-22T12:00:00Z"),
        weight: 100,
        reps: 5,
      }),
    ];

    const overload = calculateProgressiveOverload(logs, targetDate);

    expect(overload[0]?.status).toBe("maintained");
  });

  it("should report 'regressed' when max weight decreases", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [
      createExerciseLog({
        exerciseName: "Squat",
        loggedAt: new Date("2026-03-15T12:00:00Z"),
        weight: 100,
        reps: 5,
      }),
      createExerciseLog({
        exerciseName: "Squat",
        loggedAt: new Date("2026-03-22T12:00:00Z"),
        weight: 90,
        reps: 5,
      }),
    ];

    const overload = calculateProgressiveOverload(logs, targetDate);

    expect(overload[0]?.status).toBe("regressed");
  });

  it("should report 'regressed' when reps decrease at same max weight", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [
      createExerciseLog({
        exerciseName: "Squat",
        loggedAt: new Date("2026-03-15T12:00:00Z"),
        weight: 100,
        reps: 8,
      }),
      createExerciseLog({
        exerciseName: "Squat",
        loggedAt: new Date("2026-03-22T12:00:00Z"),
        weight: 100,
        reps: 5,
      }),
    ];

    const overload = calculateProgressiveOverload(logs, targetDate);

    expect(overload[0]?.status).toBe("regressed");
  });

  it("should ignore exercises with no previous week data", () => {
    const targetDate = new Date("2026-03-25T12:00:00Z");
    const logs: ExerciseLog[] = [
      createExerciseLog({
        exerciseName: "Squat",
        loggedAt: new Date("2026-03-22T12:00:00Z"),
        weight: 100,
        reps: 8,
      }),
    ];

    const overload = calculateProgressiveOverload(logs, targetDate);

    // If there's no data from previous week to compare to, we just don't report it since it's not useful
    // for progressive overload calculations (it's essentially a 'new' baseline)
    expect(overload).toHaveLength(0);
  });
});
