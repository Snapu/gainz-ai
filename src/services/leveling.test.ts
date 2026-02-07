import { describe, expect, it } from "vitest";
import {
  calculateUserProgress,
  getNextTitleMilestone,
  getTitleForLevel,
  type UserProgress,
} from "./leveling";

describe("leveling system", () => {
  describe("calculateUserProgress", () => {
    it("should return level 1 for new users with no exercise dates", () => {
      const result = calculateUserProgress([], 3);

      expect(result.level).toBe(1);
      expect(result.totalXP).toBe(0);
      expect(result.xpIntoLevel).toBe(0);
      expect(result.progressPercent).toBe(0);
      expect(result.momentum).toBe(0.5); // MOMENTUM_MIN
      expect(result.title).toBe("🔰 Novice Challenger");
    });

    it("should calculate progress for a single exercise day", () => {
      const today = new Date();
      const result = calculateUserProgress([today], 3);

      expect(result.level).toBe(1);
      expect(result.totalXP).toBeGreaterThan(0);
      expect(result.momentum).toBeGreaterThan(0.5);
    });

    it("should deduplicate multiple exercises on the same day", () => {
      const today = new Date();
      const sameDay1 = new Date(today);
      const sameDay2 = new Date(today);
      sameDay2.setHours(today.getHours() + 2); // Different time, same day

      const resultOne = calculateUserProgress([today], 3);
      const resultMultiple = calculateUserProgress([sameDay1, sameDay2], 3);

      expect(resultOne.totalXP).toBe(resultMultiple.totalXP);
    });

    it("should build momentum over consistent weeks", () => {
      const dates: Date[] = [];
      const startDate = new Date("2026-01-06"); // Monday

      // 4 weeks of consistent 3 workouts/week
      for (let week = 0; week < 4; week++) {
        for (let day = 0; day < 3; day++) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + week * 7 + day);
          dates.push(date);
        }
      }

      const result = calculateUserProgress(dates, 3);

      expect(result.momentum).toBeGreaterThan(0.5);
      expect(result.momentum).toBeLessThanOrEqual(1.25);
      expect(result.level).toBeGreaterThan(1);
    });

    it("should reduce momentum when weeks are missed", () => {
      const dates: Date[] = [];
      const startDate = new Date("2026-01-06"); // Monday

      // Week 1: 3 workouts
      for (let day = 0; day < 3; day++) {
        dates.push(new Date(startDate.getTime() + day * 24 * 60 * 60 * 1000));
      }

      // Skip 2 weeks

      // Week 4: 3 workouts
      for (let day = 0; day < 3; day++) {
        const date = new Date(startDate.getTime() + (21 + day) * 24 * 60 * 60 * 1000);
        dates.push(date);
      }

      const result = calculateUserProgress(dates, 3);

      // Momentum should be back near minimum after missing weeks
      expect(result.momentum).toBeGreaterThanOrEqual(0.5);
      expect(result.momentum).toBeLessThan(0.8);
    });

    it("should cap momentum at 1.25", () => {
      const dates: Date[] = [];
      const startDate = new Date("2026-01-06");

      // 30 weeks of perfect consistency
      for (let week = 0; week < 30; week++) {
        for (let day = 0; day < 3; day++) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + week * 7 + day);
          dates.push(date);
        }
      }

      const result = calculateUserProgress(dates, 3);

      expect(result.momentum).toBe(1.25);
    });

    it("should not award extra XP for overtraining (exceeding cap)", () => {
      const today = new Date("2026-01-06");
      const dates: Date[] = [];

      // 3 aimed + 1 cap = 4 effective max
      for (let day = 0; day < 3; day++) {
        dates.push(new Date(today.getTime() + day * 24 * 60 * 60 * 1000));
      }

      const result3Days = calculateUserProgress(dates, 3);

      // Add 3 more days (total 6 in one week, but capped at 4)
      for (let day = 3; day < 6; day++) {
        dates.push(new Date(today.getTime() + day * 24 * 60 * 60 * 1000));
      }

      const result6Days = calculateUserProgress(dates, 3);

      // Should cap at aimed + 1
      const expectedCappedXP = result3Days.totalXP + 100 * result3Days.momentum;
      expect(result6Days.totalXP).toBeCloseTo(expectedCappedXP, 0);
    });

    it("should progress through levels correctly", () => {
      const dates: Date[] = [];
      const startDate = new Date("2026-01-06");

      // 20 weeks of consistent training
      for (let week = 0; week < 20; week++) {
        for (let day = 0; day < 3; day++) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + week * 7 + day);
          dates.push(date);
        }
      }

      const result = calculateUserProgress(dates, 3);

      expect(result.level).toBeGreaterThan(1);
      expect(result.totalXP).toBeGreaterThan(result.xpIntoLevel);
      expect(result.xpIntoLevel).toBeLessThan(result.xpForNextLevel);
      expect(result.progressPercent).toBeGreaterThanOrEqual(0);
      expect(result.progressPercent).toBeLessThanOrEqual(100);
    });

    it("should reach approximately level 30-40 after 1 year of consistent training", () => {
      const dates: Date[] = [];
      const startDate = new Date("2025-01-06");

      // 52 weeks of consistent 3 workouts/week
      for (let week = 0; week < 52; week++) {
        for (let day = 0; day < 3; day++) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + week * 7 + day);
          dates.push(date);
        }
      }

      const result = calculateUserProgress(dates, 3);

      expect(result.level).toBeGreaterThanOrEqual(30);
      expect(result.level).toBeLessThanOrEqual(50);
    });

    it("should reach approximately level 100 after 3 years of consistent training", () => {
      const dates: Date[] = [];
      const startDate = new Date("2023-01-06");

      // 156 weeks (3 years) of consistent 3 workouts/week
      for (let week = 0; week < 156; week++) {
        for (let day = 0; day < 3; day++) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + week * 7 + day);
          dates.push(date);
        }
      }

      const result = calculateUserProgress(dates, 3);

      expect(result.level).toBeGreaterThanOrEqual(90);
      expect(result.level).toBeLessThanOrEqual(110);
    });

    it("should grant forgiveness for one missed week at high momentum", () => {
      const dates: Date[] = [];
      const startDate = new Date("2026-01-06");

      // Build momentum with 15 weeks of consistency
      for (let week = 0; week < 15; week++) {
        for (let day = 0; day < 3; day++) {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + week * 7 + day);
          dates.push(date);
        }
      }

      const resultBefore = calculateUserProgress(dates, 3);

      // Miss 1 week, then continue
      for (let day = 0; day < 3; day++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + 17 * 7 + day); // Skip week 16
        dates.push(date);
      }

      const resultAfter = calculateUserProgress(dates, 3);

      // Momentum should remain relatively stable (forgiveness for 1 week)
      expect(resultAfter.momentum).toBeGreaterThan(resultBefore.momentum - 0.1);
    });
  });

  describe("getTitleForLevel", () => {
    it("should return correct title for level 1", () => {
      expect(getTitleForLevel(1)).toBe("🔰 Novice Challenger");
    });

    it("should return correct title for level 5", () => {
      expect(getTitleForLevel(5)).toBe("⚔️ Iron Warrior");
    });

    it("should return correct title for level 10", () => {
      expect(getTitleForLevel(10)).toBe("🔥 Flame Bearer");
    });

    it("should return correct title for level 50", () => {
      expect(getTitleForLevel(50)).toBe("⚔️ Legendary Slayer");
    });

    it("should return correct title for level 100", () => {
      expect(getTitleForLevel(100)).toBe("💎 Diamond Ascendant");
    });

    it("should return correct title for level 300", () => {
      expect(getTitleForLevel(300)).toBe("🌠 Celestial Transcendent");
    });

    it("should return previous title for levels between milestones", () => {
      expect(getTitleForLevel(7)).toBe("⚔️ Iron Warrior"); // Between 5 and 10
      expect(getTitleForLevel(99)).toBe("🌪️ Storm Emperor"); // Between 75 and 100
    });

    it("should keep highest title for very high levels", () => {
      expect(getTitleForLevel(500)).toBe("🌠 Celestial Transcendent");
      expect(getTitleForLevel(1000)).toBe("🌠 Celestial Transcendent");
    });
  });

  describe("getNextTitleMilestone", () => {
    it("should return next milestone for level 1", () => {
      const next = getNextTitleMilestone(1);
      expect(next).toEqual({ level: 5, title: "⚔️ Iron Warrior" });
    });

    it("should return next milestone for level 5", () => {
      const next = getNextTitleMilestone(5);
      expect(next).toEqual({ level: 10, title: "🔥 Flame Bearer" });
    });

    it("should return next milestone for level 99", () => {
      const next = getNextTitleMilestone(99);
      expect(next).toEqual({ level: 100, title: "💎 Diamond Ascendant" });
    });

    it("should return null when max title is reached", () => {
      const next = getNextTitleMilestone(300);
      expect(next).toBeNull();
    });

    it("should return null for levels beyond max title", () => {
      const next = getNextTitleMilestone(500);
      expect(next).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("should handle unsorted exercise dates", () => {
      const dates = [new Date("2026-01-10"), new Date("2026-01-08"), new Date("2026-01-06")];

      const result = calculateUserProgress(dates, 3);
      expect(result.level).toBeGreaterThanOrEqual(1);
    });

    it("should handle dates spanning multiple years", () => {
      const dates = [new Date("2024-12-30"), new Date("2025-01-02"), new Date("2025-01-05")];

      const result = calculateUserProgress(dates, 3);
      expect(result.level).toBeGreaterThanOrEqual(1);
    });

    it("should handle very high aimed workouts per week", () => {
      const today = new Date("2026-01-06");
      const dates: Date[] = [];

      for (let day = 0; day < 7; day++) {
        dates.push(new Date(today.getTime() + day * 24 * 60 * 60 * 1000));
      }

      const result = calculateUserProgress(dates, 7);
      expect(result.totalXP).toBeGreaterThan(0);
    });

    it("should handle aimed workouts of 1 per week", () => {
      const dates = [new Date("2026-01-06")];
      const result = calculateUserProgress(dates, 1);

      expect(result.level).toBe(1);
      expect(result.totalXP).toBeGreaterThan(0);
    });
  });
});
