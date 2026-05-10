import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import {
  aggregateLogsToSummary,
  getYearMonthsSummarized,
  getYearsSummarized,
  summaryToWorkoutDates,
  type TrainingSummary,
} from "@/modules/trainingSummary/application";

function createLog(
  exerciseName: string,
  loggedAt: Date,
  options: Partial<Pick<ExerciseLog, "reps" | "weight" | "distance" | "duration">> = {},
): ExerciseLog {
  return {
    id: crypto.randomUUID(),
    exerciseName,
    loggedAt,
    ...options,
  };
}

describe("trainingSummary", () => {
  describe("aggregateLogsToSummary", () => {
    it("should return empty array for empty logs", () => {
      const result = aggregateLogsToSummary([]);
      expect(result).toEqual([]);
    });

    it("should aggregate single exercise log", () => {
      const logs = [createLog("Bench Press", new Date("2024-03-15"), { reps: 10, weight: 60 })];

      const result = aggregateLogsToSummary(logs);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        year: 2024,
        month: 3,
        workoutDays: 1,
        exerciseName: "Bench Press",
        sets: 1,
        totalReps: 10,
        maxWeight: 60,
        totalVolume: 600,
      });
    });

    it("should count unique workout days correctly", () => {
      const logs = [
        createLog("Squat", new Date("2024-03-15T10:00:00"), { reps: 5, weight: 100 }),
        createLog("Squat", new Date("2024-03-15T10:05:00"), { reps: 5, weight: 100 }),
        createLog("Squat", new Date("2024-03-17T10:00:00"), { reps: 5, weight: 100 }),
      ];

      const result = aggregateLogsToSummary(logs);

      expect(result).toHaveLength(1);
      expect(result[0]?.workoutDays).toBe(2);
      expect(result[0]?.sets).toBe(3);
    });

    it("should track max weight across sets", () => {
      const logs = [
        createLog("Deadlift", new Date("2024-03-15"), { reps: 5, weight: 100 }),
        createLog("Deadlift", new Date("2024-03-15"), { reps: 3, weight: 140 }),
        createLog("Deadlift", new Date("2024-03-15"), { reps: 1, weight: 160 }),
      ];

      const result = aggregateLogsToSummary(logs);

      expect(result[0]?.maxWeight).toBe(160);
    });

    it("should calculate total volume correctly", () => {
      const logs = [
        createLog("Bench Press", new Date("2024-03-15"), { reps: 10, weight: 60 }),
        createLog("Bench Press", new Date("2024-03-15"), { reps: 8, weight: 70 }),
        createLog("Bench Press", new Date("2024-03-15"), { reps: 6, weight: 80 }),
      ];

      const result = aggregateLogsToSummary(logs);

      expect(result[0]?.totalVolume).toBe(10 * 60 + 8 * 70 + 6 * 80);
    });

    it("should calculate total reps correctly", () => {
      const logs = [
        createLog("Pull-ups", new Date("2024-03-15"), { reps: 10 }),
        createLog("Pull-ups", new Date("2024-03-15"), { reps: 8 }),
        createLog("Pull-ups", new Date("2024-03-15"), { reps: 6 }),
      ];

      const result = aggregateLogsToSummary(logs);

      expect(result[0]?.totalReps).toBe(24);
      expect(result[0]?.maxWeight).toBeUndefined();
      expect(result[0]?.totalVolume).toBeUndefined();
    });

    it("should aggregate distance for cardio exercises", () => {
      const logs = [
        createLog("Running", new Date("2024-03-15"), { distance: 5000, duration: 25 }),
        createLog("Running", new Date("2024-03-17"), { distance: 3000, duration: 15 }),
      ];

      const result = aggregateLogsToSummary(logs);

      expect(result[0]?.totalDistance).toBe(8000);
      expect(result[0]?.totalDuration).toBe(40);
    });

    it("should aggregate duration for timed exercises", () => {
      const logs = [
        createLog("Plank", new Date("2024-03-15"), { duration: 1 }),
        createLog("Plank", new Date("2024-03-15"), { duration: 1.5 }),
        createLog("Plank", new Date("2024-03-15"), { duration: 2 }),
      ];

      const result = aggregateLogsToSummary(logs);

      expect(result[0]?.totalDuration).toBe(4.5);
    });

    it("should separate exercises by name", () => {
      const logs = [
        createLog("Bench Press", new Date("2024-03-15"), { reps: 10, weight: 60 }),
        createLog("Squat", new Date("2024-03-15"), { reps: 8, weight: 100 }),
        createLog("Deadlift", new Date("2024-03-15"), { reps: 5, weight: 140 }),
      ];

      const result = aggregateLogsToSummary(logs);

      expect(result).toHaveLength(3);
      expect(result.map((s) => s.exerciseName).sort()).toEqual([
        "Bench Press",
        "Deadlift",
        "Squat",
      ]);
    });

    it("should separate logs by month", () => {
      const logs = [
        createLog("Squat", new Date("2024-03-15"), { reps: 5, weight: 100 }),
        createLog("Squat", new Date("2024-04-15"), { reps: 5, weight: 110 }),
      ];

      const result = aggregateLogsToSummary(logs);

      expect(result).toHaveLength(2);
      expect(result.find((s) => s.month === 3)?.maxWeight).toBe(100);
      expect(result.find((s) => s.month === 4)?.maxWeight).toBe(110);
    });

    it("should separate logs by year", () => {
      const logs = [
        createLog("Bench Press", new Date("2023-12-15"), { reps: 10, weight: 60 }),
        createLog("Bench Press", new Date("2024-01-15"), { reps: 10, weight: 65 }),
      ];

      const result = aggregateLogsToSummary(logs);

      expect(result).toHaveLength(2);
      expect(result.find((s) => s.year === 2023)?.maxWeight).toBe(60);
      expect(result.find((s) => s.year === 2024)?.maxWeight).toBe(65);
    });

    it("should handle mixed exercise types in same month", () => {
      const logs = [
        createLog("Bench Press", new Date("2024-03-15"), { reps: 10, weight: 60 }),
        createLog("Running", new Date("2024-03-16"), { distance: 5000, duration: 25 }),
        createLog("Plank", new Date("2024-03-17"), { duration: 2 }),
      ];

      const result = aggregateLogsToSummary(logs);

      expect(result).toHaveLength(3);

      const benchSummary = result.find((s) => s.exerciseName === "Bench Press")!;
      expect(benchSummary.totalReps).toBe(10);
      expect(benchSummary.totalVolume).toBe(600);

      const runningSummary = result.find((s) => s.exerciseName === "Running")!;
      expect(runningSummary.totalDistance).toBe(5000);
      expect(runningSummary.totalDuration).toBe(25);

      const plankSummary = result.find((s) => s.exerciseName === "Plank")!;
      expect(plankSummary.totalDuration).toBe(2);
    });

    it("should handle logs with partial data", () => {
      const logs = [
        createLog("Bench Press", new Date("2024-03-15"), { reps: 10, weight: 60 }),
        createLog("Bench Press", new Date("2024-03-15"), { reps: 8 }),
        createLog("Bench Press", new Date("2024-03-15"), {}),
      ];

      const result = aggregateLogsToSummary(logs);

      expect(result[0]?.sets).toBe(3);
      expect(result[0]?.totalReps).toBe(18);
      expect(result[0]?.maxWeight).toBe(60);
      expect(result[0]?.totalVolume).toBe(600);
    });
  });

  describe("summaryToWorkoutDates", () => {
    it("should return empty array for empty summaries", () => {
      const result = summaryToWorkoutDates([]);
      expect(result).toEqual([]);
    });

    it("should generate dates based on workoutDays count", () => {
      const summaries: TrainingSummary[] = [
        {
          year: 2024,
          month: 3,
          workoutDays: 3,
          exerciseName: "Bench Press",
          sets: 9,
        },
      ];

      const result = summaryToWorkoutDates(summaries);

      expect(result).toHaveLength(3);
      result.forEach((date) => {
        expect(date.getFullYear()).toBe(2024);
        expect(date.getMonth()).toBe(2);
      });
    });

    it("should not duplicate dates for multiple exercises in same month", () => {
      const summaries: TrainingSummary[] = [
        { year: 2024, month: 3, workoutDays: 5, exerciseName: "Bench Press", sets: 15 },
        { year: 2024, month: 3, workoutDays: 5, exerciseName: "Squat", sets: 12 },
        { year: 2024, month: 3, workoutDays: 5, exerciseName: "Deadlift", sets: 9 },
      ];

      const result = summaryToWorkoutDates(summaries);

      expect(result).toHaveLength(5);
    });

    it("should generate dates across multiple months", () => {
      const summaries: TrainingSummary[] = [
        { year: 2024, month: 1, workoutDays: 10, exerciseName: "Squat", sets: 30 },
        { year: 2024, month: 2, workoutDays: 8, exerciseName: "Squat", sets: 24 },
        { year: 2024, month: 3, workoutDays: 12, exerciseName: "Squat", sets: 36 },
      ];

      const result = summaryToWorkoutDates(summaries);

      expect(result).toHaveLength(30);

      const januaryDates = result.filter((d) => d.getMonth() === 0);
      const februaryDates = result.filter((d) => d.getMonth() === 1);
      const marchDates = result.filter((d) => d.getMonth() === 2);

      expect(januaryDates).toHaveLength(10);
      expect(februaryDates).toHaveLength(8);
      expect(marchDates).toHaveLength(12);
    });

    it("should generate dates across multiple years", () => {
      const summaries: TrainingSummary[] = [
        { year: 2023, month: 12, workoutDays: 10, exerciseName: "Squat", sets: 30 },
        { year: 2024, month: 1, workoutDays: 12, exerciseName: "Squat", sets: 36 },
      ];

      const result = summaryToWorkoutDates(summaries);

      expect(result).toHaveLength(22);

      const dates2023 = result.filter((d) => d.getFullYear() === 2023);
      const dates2024 = result.filter((d) => d.getFullYear() === 2024);

      expect(dates2023).toHaveLength(10);
      expect(dates2024).toHaveLength(12);
    });

    it("should spread dates across the month with reasonable distribution", () => {
      const summaries: TrainingSummary[] = [
        { year: 2024, month: 3, workoutDays: 5, exerciseName: "Squat", sets: 15 },
      ];

      const result = summaryToWorkoutDates(summaries);

      const days = result.map((d) => d.getDate());
      expect(days).toEqual([1, 3, 5, 7, 9]);
    });

    it("should cap day-of-month at 28 for high workout counts", () => {
      const summaries: TrainingSummary[] = [
        { year: 2024, month: 2, workoutDays: 20, exerciseName: "Running", sets: 20 },
      ];

      const result = summaryToWorkoutDates(summaries);

      result.forEach((date) => {
        expect(date.getDate()).toBeLessThanOrEqual(28);
      });
    });
  });

  describe("getYearsSummarized", () => {
    it("should return empty set for empty summaries", () => {
      const result = getYearsSummarized([]);
      expect(result.size).toBe(0);
    });

    it("should extract unique years from summaries", () => {
      const summaries: TrainingSummary[] = [
        { year: 2022, month: 6, workoutDays: 10, exerciseName: "Squat", sets: 30 },
        { year: 2023, month: 3, workoutDays: 12, exerciseName: "Squat", sets: 36 },
        { year: 2023, month: 6, workoutDays: 15, exerciseName: "Squat", sets: 45 },
        { year: 2024, month: 1, workoutDays: 8, exerciseName: "Squat", sets: 24 },
      ];

      const result = getYearsSummarized(summaries);

      expect(result.size).toBe(3);
      expect(result.has(2022)).toBe(true);
      expect(result.has(2023)).toBe(true);
      expect(result.has(2024)).toBe(true);
    });

    it("should deduplicate years from multiple exercises", () => {
      const summaries: TrainingSummary[] = [
        { year: 2023, month: 3, workoutDays: 12, exerciseName: "Squat", sets: 36 },
        { year: 2023, month: 3, workoutDays: 12, exerciseName: "Bench Press", sets: 30 },
        { year: 2023, month: 3, workoutDays: 12, exerciseName: "Deadlift", sets: 18 },
      ];

      const result = getYearsSummarized(summaries);

      expect(result.size).toBe(1);
      expect(result.has(2023)).toBe(true);
    });
  });

  describe("getYearMonthsSummarized", () => {
    it("should return empty set for empty summaries", () => {
      const result = getYearMonthsSummarized([]);
      expect(result.size).toBe(0);
    });

    it("should extract unique year-month combinations from summaries", () => {
      const summaries: TrainingSummary[] = [
        { year: 2024, month: 1, workoutDays: 10, exerciseName: "Squat", sets: 30 },
        { year: 2024, month: 2, workoutDays: 12, exerciseName: "Squat", sets: 36 },
        { year: 2024, month: 3, workoutDays: 8, exerciseName: "Squat", sets: 24 },
      ];

      const result = getYearMonthsSummarized(summaries);

      expect(result.size).toBe(3);
      expect(result.has("2024-1")).toBe(true);
      expect(result.has("2024-2")).toBe(true);
      expect(result.has("2024-3")).toBe(true);
    });

    it("should deduplicate year-months from multiple exercises", () => {
      const summaries: TrainingSummary[] = [
        { year: 2024, month: 3, workoutDays: 12, exerciseName: "Squat", sets: 36 },
        { year: 2024, month: 3, workoutDays: 12, exerciseName: "Bench Press", sets: 30 },
        { year: 2024, month: 3, workoutDays: 12, exerciseName: "Deadlift", sets: 18 },
      ];

      const result = getYearMonthsSummarized(summaries);

      expect(result.size).toBe(1);
      expect(result.has("2024-3")).toBe(true);
    });

    it("should handle multiple years and months", () => {
      const summaries: TrainingSummary[] = [
        { year: 2023, month: 11, workoutDays: 10, exerciseName: "Squat", sets: 30 },
        { year: 2023, month: 12, workoutDays: 12, exerciseName: "Squat", sets: 36 },
        { year: 2024, month: 1, workoutDays: 8, exerciseName: "Squat", sets: 24 },
        { year: 2024, month: 1, workoutDays: 8, exerciseName: "Bench Press", sets: 24 },
      ];

      const result = getYearMonthsSummarized(summaries);

      expect(result.size).toBe(3);
      expect(result.has("2023-11")).toBe(true);
      expect(result.has("2023-12")).toBe(true);
      expect(result.has("2024-1")).toBe(true);
    });
  });

  describe("integration: aggregateLogsToSummary -> summaryToWorkoutDates", () => {
    it("should preserve workout day count through the pipeline", () => {
      const logs = [
        createLog("Squat", new Date("2024-03-01"), { reps: 5, weight: 100 }),
        createLog("Squat", new Date("2024-03-03"), { reps: 5, weight: 100 }),
        createLog("Squat", new Date("2024-03-05"), { reps: 5, weight: 100 }),
        createLog("Bench Press", new Date("2024-03-01"), { reps: 10, weight: 60 }),
        createLog("Bench Press", new Date("2024-03-03"), { reps: 10, weight: 60 }),
      ];

      const summaries = aggregateLogsToSummary(logs);
      const dates = summaryToWorkoutDates(summaries);

      expect(dates).toHaveLength(3);
    });

    it("should handle year-spanning data correctly", () => {
      const logs = [
        createLog("Squat", new Date("2023-11-15"), { reps: 5, weight: 100 }),
        createLog("Squat", new Date("2023-12-15"), { reps: 5, weight: 105 }),
        createLog("Squat", new Date("2024-01-15"), { reps: 5, weight: 110 }),
        createLog("Squat", new Date("2024-02-15"), { reps: 5, weight: 115 }),
      ];

      const summaries = aggregateLogsToSummary(logs);
      const years = getYearsSummarized(summaries);
      const dates = summaryToWorkoutDates(summaries);

      expect(years.size).toBe(2);
      expect(years.has(2023)).toBe(true);
      expect(years.has(2024)).toBe(true);
      expect(dates).toHaveLength(4);
    });
  });
});
