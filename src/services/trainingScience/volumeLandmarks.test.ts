import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "@/services/exerciseLogs";
import {
  calculateMuscleGroupInsights,
  calculateWeeklyVolume,
  classifyLandmark,
  isRecovered,
} from "./volumeLandmarks";

describe("Volume Landmarks", () => {
  describe("classifyLandmark", () => {
    it("classifies below_MEV", () => {
      expect(classifyLandmark(3, "Chest")).toBe("below_MEV");
    });

    it("classifies at_MEV", () => {
      expect(classifyLandmark(8, "Chest")).toBe("at_MEV");
      expect(classifyLandmark(10, "Chest")).toBe("at_MEV");
    });

    it("classifies at_MAV", () => {
      expect(classifyLandmark(15, "Chest")).toBe("at_MAV");
    });

    it("classifies approaching_MRV", () => {
      expect(classifyLandmark(20, "Chest")).toBe("approaching_MRV");
    });

    it("classifies above_MRV", () => {
      expect(classifyLandmark(25, "Chest")).toBe("above_MRV");
    });

    it("uses muscle-specific thresholds", () => {
      expect(classifyLandmark(4, "Biceps")).toBe("at_MEV");
      expect(classifyLandmark(4, "Chest")).toBe("below_MEV");
    });
  });

  describe("isRecovered", () => {
    it("returns true when never trained (null hours)", () => {
      expect(isRecovered(null, "Chest")).toBe(true);
    });

    it("returns false within recovery window", () => {
      expect(isRecovered(24, "Chest")).toBe(false);
      expect(isRecovered(24, "Back")).toBe(false);
      expect(isRecovered(48, "Glutes")).toBe(false);
    });

    it("returns true after recovery threshold", () => {
      expect(isRecovered(48, "Chest")).toBe(true);
      expect(isRecovered(50, "Chest")).toBe(true);
      expect(isRecovered(72, "Glutes")).toBe(true);
    });

    it("uses muscle-specific recovery times", () => {
      expect(isRecovered(36, "Abs")).toBe(true);
      expect(isRecovered(36, "Back")).toBe(false);
    });
  });

  describe("calculateWeeklyVolume", () => {
    const baseDate = new Date("2024-01-08");

    function createLog(exerciseName: string, daysAgo: number, weight = 100, reps = 5): ExerciseLog {
      return {
        id: crypto.randomUUID(),
        exerciseName,
        loggedAt: new Date(baseDate.getTime() - daysAgo * 86400000),
        weight,
        reps,
      };
    }

    it("calculates primary muscle volume", () => {
      const logs = [createLog("Bench Press", 2), createLog("Bench Press", 1)];

      const volumes = calculateWeeklyVolume(logs, baseDate);
      const chestVolume = volumes.find((v) => v.muscleGroup === "Chest");
      expect(chestVolume?.sets).toBe(2);
      expect(chestVolume?.directSets).toBe(2);
    });

    it("credits secondary muscles fractionally", () => {
      const logs = [createLog("Bench Press", 2)];

      const volumes = calculateWeeklyVolume(logs, baseDate);
      const tricepsVolume = volumes.find((v) => v.muscleGroup === "Triceps");
      const shouldersVolume = volumes.find((v) => v.muscleGroup === "Shoulders");

      expect(tricepsVolume?.sets).toBe(0.5);
      expect(tricepsVolume?.directSets).toBe(0);
      expect(shouldersVolume?.sets).toBe(0.3);
      expect(shouldersVolume?.directSets).toBe(0);
    });

    it("combines direct and indirect volume for the same muscle", () => {
      const logs = [
        createLog("Bench Press", 2), // Triceps +0.5 secondary
        createLog("Tricep Extension", 1), // Triceps +1 direct
      ];

      const volumes = calculateWeeklyVolume(logs, baseDate);
      const tricepsVolume = volumes.find((v) => v.muscleGroup === "Triceps");

      expect(tricepsVolume?.sets).toBe(1.5);
      expect(tricepsVolume?.directSets).toBe(1);
    });

    it("counts training frequency by distinct days", () => {
      const logs = [createLog("Pull-Ups", 2), createLog("Pull-Ups", 2), createLog("Pull-Ups", 1)];

      const volumes = calculateWeeklyVolume(logs, baseDate);
      const backVolume = volumes.find((v) => v.muscleGroup === "Back");
      const bicepsVolume = volumes.find((v) => v.muscleGroup === "Biceps");

      expect(backVolume?.frequencyPerWeek).toBe(2);
      expect(bicepsVolume?.frequencyPerWeek).toBe(2);
    });

    it("ignores logs older than 7 days", () => {
      const logs = [createLog("Squat", 6), createLog("Squat", 8)];

      const volumes = calculateWeeklyVolume(logs, baseDate);
      const quadsVolume = volumes.find((v) => v.muscleGroup === "Quads");
      expect(quadsVolume?.sets).toBeCloseTo(1, 1);
    });

    it("excludes logs exactly at 7-day boundary", () => {
      const logs: ExerciseLog[] = [
        {
          id: crypto.randomUUID(),
          exerciseName: "Bench Press",
          loggedAt: new Date(baseDate.getTime() - 7 * 86400000),
          weight: 100,
          reps: 5,
        },
      ];

      const volumes = calculateWeeklyVolume(logs, baseDate);
      expect(volumes).toHaveLength(0);
    });

    it("accepts exact override map matches", () => {
      const logs = [createLog("My Custom Push", 1)];
      const volumes = calculateWeeklyVolume(logs, baseDate, {
        "My Custom Push": {
          primaryMuscle: "Chest",
          secondaryMuscles: [{ muscleGroup: "Triceps", contribution: 0.5 }],
        },
      });

      const chestVolume = volumes.find((v) => v.muscleGroup === "Chest");
      const tricepsVolume = volumes.find((v) => v.muscleGroup === "Triceps");

      expect(chestVolume?.sets).toBe(1);
      expect(chestVolume?.directSets).toBe(1);
      expect(tricepsVolume?.sets).toBe(0.5);
      expect(tricepsVolume?.directSets).toBe(0);
    });

    it("accepts normalized override map keys", () => {
      const logs = [createLog("my custom pull", 1)];
      const volumes = calculateWeeklyVolume(logs, baseDate, {
        "My   Custom Pull": {
          primaryMuscle: "Back",
          secondaryMuscles: [{ muscleGroup: "Biceps", contribution: 0.5 }],
        },
      });

      const backVolume = volumes.find((v) => v.muscleGroup === "Back");
      const bicepsVolume = volumes.find((v) => v.muscleGroup === "Biceps");

      expect(backVolume?.sets).toBe(1);
      expect(backVolume?.directSets).toBe(1);
      expect(bicepsVolume?.sets).toBe(0.5);
      expect(bicepsVolume?.directSets).toBe(0);
    });

    it("tracks hours since last trained", () => {
      const logs = [createLog("Pull-Ups", 2)];
      const volumes = calculateWeeklyVolume(logs, baseDate);
      const backVolume = volumes.find((v) => v.muscleGroup === "Back");

      expect(backVolume?.hoursSinceLastTrained).toBeCloseTo(48, 1);
    });

    it("tracks most recent training date", () => {
      const logs = [createLog("Squat", 5), createLog("Squat", 2)];
      const volumes = calculateWeeklyVolume(logs, baseDate);
      const quadsVolume = volumes.find((v) => v.muscleGroup === "Quads");

      expect(quadsVolume?.hoursSinceLastTrained).toBeCloseTo(48, 1);
    });

    it("handles unknown exercises gracefully", () => {
      const logs = [createLog("Unknown Exercise", 2)];
      const volumes = calculateWeeklyVolume(logs, baseDate);
      expect(volumes).toHaveLength(0);
    });
  });

  describe("calculateMuscleGroupInsights", () => {
    const baseDate = new Date("2024-01-08");

    function createLog(exerciseName: string, daysAgo: number): ExerciseLog {
      return {
        id: crypto.randomUUID(),
        exerciseName,
        loggedAt: new Date(baseDate.getTime() - daysAgo * 86400000),
        weight: 100,
        reps: 5,
      };
    }

    it("returns empty object for no logs", () => {
      const insights = calculateMuscleGroupInsights([], baseDate);
      expect(Object.keys(insights)).toHaveLength(0);
    });

    it("calculates landmark for each muscle", () => {
      const logs = [createLog("Bench Press", 1)];

      const insights = calculateMuscleGroupInsights(logs, baseDate);
      expect(insights.Chest?.landmark).toBe("below_MEV");
    });

    it("keeps direct and effective sets separate", () => {
      const logs = [createLog("Pull-Ups", 1), createLog("Pull-Ups", 1)];

      const insights = calculateMuscleGroupInsights(logs, baseDate);
      expect(insights.Back?.sets).toBe(2);
      expect(insights.Back?.directSets).toBe(2);
      expect(insights.Biceps?.sets).toBe(1);
      expect(insights.Biceps?.directSets).toBe(0);
    });

    it("determines recovery status", () => {
      const logs = [createLog("Bench Press", 1)];

      const insights = calculateMuscleGroupInsights(logs, baseDate);
      expect(insights.Chest?.recoveryReady).toBe(false);
    });

    it("rounds sets to 1 decimal", () => {
      const logs = [createLog("Bench Press", 1)];
      const insights = calculateMuscleGroupInsights(logs, baseDate);
      expect(insights.Chest?.sets).toBe(1);
      expect(insights.Chest?.directSets).toBe(1);
    });
  });
});
