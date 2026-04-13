import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "./exerciseLogs";
import { calculateUserProgress, getNextTitleMilestone, getTitleForLevel } from "./leveling";

function mockLog(date: Date, exercise = "Bench Press", weight = 60): ExerciseLog {
  return {
    id: crypto.randomUUID(),
    exerciseName: exercise,
    loggedAt: date,
    reps: 10,
    weight: weight,
    rpe: 10, // Use 10 for simplicity in PR calculation
  };
}

describe("leveling system", () => {
  describe("calculateUserProgress", () => {
    it("should return level 1 for new users with no logs", () => {
      const result = calculateUserProgress([], 3);

      expect(result.level).toBe(1);
      expect(result.totalXP).toBe(0);
      expect(result.readiness).toBe(0.5); // READINESS_MIN
      expect(result.title).toBe("Novice Challenger");
    });

    it("should calculate progress for a single exercise day", () => {
      const today = new Date();
      const result = calculateUserProgress([mockLog(today)], 3);

      expect(result.level).toBe(1);
      expect(result.totalXP).toBeGreaterThan(0);
      expect(result.readiness).toBeGreaterThan(0.5);
    });

    it("should build readiness over consistent weeks", () => {
      const logs: ExerciseLog[] = [];
      const startDate = new Date("2026-01-05"); // Monday

      // 4 weeks of consistent 3 workouts/week
      for (let week = 0; week < 4; week++) {
        for (let day = 0; day < 3; day++) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + week * 7 + day);
          logs.push(mockLog(date));
        }
      }

      const result = calculateUserProgress(logs, 3);

      expect(result.readiness).toBeGreaterThan(0.5);
      expect(result.readiness).toBeLessThanOrEqual(1.5); // READINESS_MAX
      expect(result.level).toBeGreaterThan(1);
    });

    it("should reduce readiness when weeks are missed", () => {
      const logs: ExerciseLog[] = [];
      const startDate = new Date("2026-01-05"); // Monday

      // Week 1: 3 workouts
      for (let day = 0; day < 3; day++) {
        logs.push(mockLog(new Date(startDate.getTime() + day * 24 * 60 * 60 * 1000)));
      }

      // Skip 2 weeks (Week 2, 3)

      // Week 4: 3 workouts
      for (let day = 0; day < 3; day++) {
        const date = new Date(startDate.getTime() + (21 + day) * 24 * 60 * 60 * 1000);
        logs.push(mockLog(date));
      }

      const result = calculateUserProgress(logs, 3);

      // Momentum should decay during the gap
      expect(result.readiness).toBeLessThan(0.8);
    });

    it("should cap readiness at 1.5", () => {
      const logs: ExerciseLog[] = [];
      const startDate = new Date("2026-01-05");

      // 40 weeks of perfect consistency
      for (let week = 0; week < 40; week++) {
        for (let day = 0; day < 3; day++) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + week * 7 + day);
          logs.push(mockLog(date));
        }
      }

      const result = calculateUserProgress(logs, 3);

      expect(result.readiness).toBe(1.5);
    });

    it("should award progression XP for hitting e1RM PRs (>2.5%)", () => {
      const week1 = new Date("2026-01-05");
      const week2 = new Date("2026-01-12");

      const logs: ExerciseLog[] = [
        mockLog(week1, "Squat", 60), // Week 1
      ];

      const result1 = calculateUserProgress(logs, 3);

      // Week 2: Higher weight
      logs.push(mockLog(week2, "Squat", 100)); // Significant jump

      const result2 = calculateUserProgress(logs, 3);

      const xpDifference = result2.totalXP - result1.totalXP;
      // Week 2 session (50) + 1 set (10 * 2.5) + PR Bonus (500) = ~575
      // Corrected for momentum (readiness): start at 0.5, builds to ~0.6
      expect(xpDifference).toBeGreaterThan(300); // 500 * readiness 0.6 is ~300
    });

    it("should reach high levels after 1 year of realistic training", () => {
      const logs: ExerciseLog[] = [];
      const startDate = new Date("2025-01-06");

      // 52 weeks of consistent training
      for (let week = 0; week < 52; week++) {
        for (let day = 0; day < 3; day++) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + week * 7 + day);

          // Realistic workout: 3 exercises, 3 sets each
          for (let e = 0; e < 3; e++) {
            for (let s = 0; s < 3; s++) {
              logs.push(mockLog(date, `Exercise-${e}`));
            }
          }
        }
      }

      const result = calculateUserProgress(logs, 3);

      expect(result.level).toBeGreaterThanOrEqual(80);
      expect(result.level).toBeLessThanOrEqual(130);
    });
  });

  describe("getTitleForLevel", () => {
    it("should return correct title for milestones", () => {
      expect(getTitleForLevel(1)).toBe("Novice Challenger");
      expect(getTitleForLevel(5)).toBe("Iron Warrior");
      expect(getTitleForLevel(10)).toBe("Flame Bearer");
      expect(getTitleForLevel(50)).toBe("Legendary Slayer");
      expect(getTitleForLevel(100)).toBe("Diamond Ascendant");
      expect(getTitleForLevel(300)).toBe("Celestial Transcendent");
    });
  });
});
