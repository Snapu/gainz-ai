import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import {
  createMuscleActivationResolver,
  getMuscleActivation,
  type MuscleActivation,
} from "./exerciseMuscleMap";
import {
  calculateMuscleGroupInsights,
  calculateWeeklyVolume,
  classifyLandmark,
  getIsoWeekStart,
  isRecovered,
  resolveVolumeLandmarks,
} from "./volumeLandmarks";

describe("Volume Landmarks", () => {
  describe("classifyLandmark", () => {
    it("classifies below_MEV", () => {
      // For Chest, MEV is 8. MEV / 2 is 4. So 5 is between MEV/2 and MEV.
      expect(classifyLandmark(5, "Chest")).toBe("below_MEV");
    });
    it("classifies detraining", () => {
      expect(classifyLandmark(3, "Chest")).toBe("detraining");
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

    describe("Empirical Overrides", () => {
      it("forces at_MAV when improving regardless of high volume", () => {
        expect(classifyLandmark(30, "Chest", "improving")).toBe("at_MAV");
      });
      it("forces at_MEV when improving but below table MEV", () => {
        expect(classifyLandmark(5, "Chest", "improving")).toBe("at_MEV"); // Chest MEV = 8
      });
      it("forces above_MRV when dropping and volume is high", () => {
        expect(classifyLandmark(12, "Chest", "dropping")).toBe("above_MRV"); // Chest mavLow = 12
      });
      it("forces below_MEV when dropping and volume is low (detraining)", () => {
        expect(classifyLandmark(10, "Chest", "dropping")).toBe("below_MEV"); // Chest mavLow = 12
      });
      it("forces approaching_MRV when plateauing at high volume", () => {
        expect(classifyLandmark(18, "Chest", "plateau")).toBe("approaching_MRV"); // Chest mavHigh = 18
      });
      it("forces below_MEV when plateauing at low volume", () => {
        expect(classifyLandmark(10, "Chest", "plateau")).toBe("below_MEV"); // Chest mavLow = 12
      });
    });
  });

  describe("isRecovered", () => {
    it("returns true when never trained (null hours)", () => {
      expect(isRecovered(null, 48)).toBe(true);
    });
    it("returns false within recovery window", () => {
      expect(isRecovered(24, 48)).toBe(false); // Chest (48)
      expect(isRecovered(24, 48)).toBe(false); // Lats (48)
      expect(isRecovered(48, 72)).toBe(false); // Glutes (72)
    });
    it("returns true after recovery threshold", () => {
      expect(isRecovered(48, 48)).toBe(true);
      expect(isRecovered(50, 48)).toBe(true);
      expect(isRecovered(72, 72)).toBe(true);
    });
    it("uses recovery hours threshold correctly", () => {
      expect(isRecovered(36, 24)).toBe(true);
      expect(isRecovered(36, 48)).toBe(false);
    });
  });

  describe("getIsoWeekStart", () => {
    it("returns Monday 00:00 for a Wednesday", () => {
      const wednesday = new Date("2024-01-10T15:30:00");
      const start = getIsoWeekStart(wednesday);
      expect(start.getFullYear()).toBe(2024);
      expect(start.getMonth()).toBe(0);
      expect(start.getDate()).toBe(8); // Monday Jan 8
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
    });

    it("returns same day 00:00 for a Monday", () => {
      const monday = new Date("2024-01-08T08:00:00");
      const start = getIsoWeekStart(monday);
      expect(start.getDate()).toBe(8);
      expect(start.getHours()).toBe(0);
    });

    it("returns previous Monday for a Sunday", () => {
      const sunday = new Date("2024-01-14T23:59:59");
      const start = getIsoWeekStart(sunday);
      expect(start.getDate()).toBe(8);
      expect(start.getHours()).toBe(0);
    });
  });

  describe("calculateWeeklyVolume", () => {
    // We use a Sunday night as baseDate so that logs from 1-6 days ago fall into the SAME ISO week.
    const baseDate = new Date("2024-01-14T23:00:00");

    function createLog(exerciseName: string, daysAgo: number, weight = 100, reps = 5): ExerciseLog {
      return {
        id: crypto.randomUUID(),
        exerciseName,
        loggedAt: new Date(baseDate.getTime() - daysAgo * 86400000),
        weight,
        reps,
      };
    }

    it("calculates primary muscle volume (isoWeekSets)", () => {
      const logs = [createLog("Bench Press", 2), createLog("Bench Press", 1)];
      const volumes = calculateWeeklyVolume(logs, baseDate);
      const chestVolume = volumes.find((v) => v.muscleGroup === "Chest");
      expect(chestVolume?.isoWeekSets).toBe(2);
      expect(chestVolume?.isoWeekDirectSets).toBe(2);
    });

    it("credits secondary muscles fractionally (isoWeekSets)", () => {
      const logs = [createLog("Bench Press", 2)];
      const volumes = calculateWeeklyVolume(logs, baseDate);
      const tricepsVolume = volumes.find((v) => v.muscleGroup === "Triceps");
      const shouldersVolume = volumes.find((v) => v.muscleGroup === "Front Delts");

      expect(tricepsVolume?.isoWeekSets).toBe(0.5);
      expect(tricepsVolume?.isoWeekDirectSets).toBe(0);
      expect(shouldersVolume?.isoWeekSets).toBe(0.3);
      expect(shouldersVolume?.isoWeekDirectSets).toBe(0);
    });

    it("combines direct and indirect volume for the same muscle (isoWeekSets)", () => {
      const logs = [
        createLog("Bench Press", 2), // Triceps +0.5 secondary
        createLog("Tricep Extension", 1), // Triceps +1 direct
      ];
      const volumes = calculateWeeklyVolume(logs, baseDate);
      const tricepsVolume = volumes.find((v) => v.muscleGroup === "Triceps");

      expect(tricepsVolume?.isoWeekSets).toBe(1.5);
      expect(tricepsVolume?.isoWeekDirectSets).toBe(1);
    });

    it("counts training frequency by distinct days in trailing 7d", () => {
      const logs = [createLog("Pull-Ups", 2), createLog("Pull-Ups", 2), createLog("Pull-Ups", 1)];
      const volumes = calculateWeeklyVolume(logs, baseDate);
      const backVolume = volumes.find((v) => v.muscleGroup === "Lats");
      const bicepsVolume = volumes.find((v) => v.muscleGroup === "Biceps");

      expect(backVolume?.frequencyPerWeek).toBe(2);
      expect(bicepsVolume?.frequencyPerWeek).toBe(2);
    });

    it("EWMA sets does not jump drastically at 7 day boundary", () => {
      const logs = [createLog("Squat", 6), createLog("Squat", 8)];
      const volumes = calculateWeeklyVolume(logs, baseDate);
      const quadsVolume = volumes.find((v) => v.muscleGroup === "Quads");

      // Raw 7 day window would exclude day 8 entirely.
      // With EWMA, both days contribute smoothed values.
      // Day 8: 1 set -> EWMA becomes something > 0
      // Day 6: 1 set -> EWMA increases again
      expect(quadsVolume?.sets).toBeGreaterThan(0);
      expect(quadsVolume?.sets).toBeLessThan(2);
    });

    it("isoWeekSets excludes logs before current ISO week", () => {
      // 8 days ago is the previous Saturday, which is before the current ISO week (started Monday)
      const logs = [createLog("Bench Press", 8), createLog("Bench Press", 1)];
      const volumes = calculateWeeklyVolume(logs, baseDate);
      const chestVolume = volumes.find((v) => v.muscleGroup === "Chest");
      // Only the 1-day-ago log is in the current ISO week
      expect(chestVolume?.isoWeekSets).toBe(1);
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

      expect(chestVolume?.isoWeekSets).toBe(1);
      expect(tricepsVolume?.isoWeekSets).toBe(0.5);
    });

    it("tracks hours since last trained", () => {
      const logs = [createLog("Pull-Ups", 2)];
      const volumes = calculateWeeklyVolume(logs, baseDate);
      const backVolume = volumes.find((v) => v.muscleGroup === "Lats");

      expect(backVolume?.hoursSinceLastTrained).toBeCloseTo(48, 1);
    });

    it("tracks most recent training date", () => {
      const logs = [createLog("Squat", 5), createLog("Squat", 2)];
      const volumes = calculateWeeklyVolume(logs, baseDate);
      const quadsVolume = volumes.find((v) => v.muscleGroup === "Quads");

      expect(quadsVolume?.hoursSinceLastTrained).toBeCloseTo(48, 1);
    });

    it("returns empty array for empty logs", () => {
      expect(calculateWeeklyVolume([], baseDate)).toEqual([]);
    });

    it("enforces exact 29-day cutoff and same-day post-targetDate boundaries", () => {
      const exactCutoff = new Date(baseDate);
      exactCutoff.setDate(exactCutoff.getDate() - 28);
      exactCutoff.setHours(0, 0, 0, 0);

      const justBeforeCutoff = new Date(exactCutoff.getTime() - 1);

      const included = calculateWeeklyVolume(
        [{ id: "in", exerciseName: "Bench Press", loggedAt: exactCutoff, weight: 100, reps: 5 }],
        baseDate,
      );
      expect(included.find((v) => v.muscleGroup === "Chest")?.sets).toBeGreaterThan(0);

      const excluded = calculateWeeklyVolume(
        [
          {
            id: "out",
            exerciseName: "Bench Press",
            loggedAt: justBeforeCutoff,
            weight: 100,
            reps: 5,
          },
        ],
        baseDate,
      );
      expect(excluded).toEqual([]);

      const middayTarget = new Date("2024-01-14T12:00:00");
      const laterSameDay = new Date("2024-01-14T18:00:00");
      const nextDayStart = new Date("2024-01-15T00:00:00.000");

      const sameDayAfterTarget = calculateWeeklyVolume(
        [
          {
            id: "same-day-late",
            exerciseName: "Bench Press",
            loggedAt: laterSameDay,
            weight: 100,
            reps: 5,
          },
        ],
        middayTarget,
      );
      const chest = sameDayAfterTarget.find((v) => v.muscleGroup === "Chest");
      expect(chest?.sets).toBeGreaterThan(0);
      expect(chest?.isoWeekSets).toBe(0);
      expect(chest?.frequencyPerWeek).toBe(0);

      expect(
        calculateWeeklyVolume(
          [
            {
              id: "next-day",
              exerciseName: "Bench Press",
              loggedAt: nextDayStart,
              weight: 100,
              reps: 5,
            },
          ],
          middayTarget,
        ),
      ).toEqual([]);
    });

    it("ignores multi-year out-of-window and future logs regardless of log ordering", () => {
      const log20d = createLog("Bench Press", 20);
      const log14d = createLog("Squat", 14);
      const log2d = createLog("Bench Press", 2);
      const sameDayEarlier: ExerciseLog = {
        id: "day-1-10am",
        exerciseName: "Bench Press",
        loggedAt: new Date("2024-01-13T10:00:00"),
        weight: 100,
        reps: 5,
      };
      const sameDayLater: ExerciseLog = {
        id: "day-1-6pm",
        exerciseName: "Bench Press",
        loggedAt: new Date("2024-01-13T18:00:00"),
        weight: 100,
        reps: 5,
      };
      const log1d = createLog("Pull-Ups", 1);
      const log0d = createLog("Tricep Extension", 0);

      // Chronological order (earlier same-day log before later same-day log)
      const inWindowOnly: ExerciseLog[] = [
        log20d,
        log14d,
        log2d,
        sameDayEarlier,
        sameDayLater,
        log1d,
        log0d,
      ];

      // Shuffled/reversed in-window order (later 18:00 log BEFORE earlier 10:00 log)
      const multiYearAndFuture: ExerciseLog[] = [
        {
          id: "old-2021",
          exerciseName: "Bench Press",
          loggedAt: new Date("2021-03-10T10:00:00"),
          weight: 80,
          reps: 8,
        },
        log0d,
        sameDayLater,
        {
          id: "old-2022",
          exerciseName: "Squat",
          loggedAt: new Date("2022-09-01T18:00:00"),
          weight: 120,
          reps: 5,
        },
        log1d,
        {
          id: "future-2d",
          exerciseName: "Pull-Ups",
          loggedAt: new Date(baseDate.getTime() + 2 * 86400000),
          weight: 0,
          reps: 10,
        },
        sameDayEarlier,
        log14d,
        {
          id: "old-2023",
          exerciseName: "Deadlift",
          loggedAt: new Date("2023-11-20T12:00:00"),
          weight: 160,
          reps: 5,
        },
        log2d,
        {
          id: "future-30d",
          exerciseName: "Bench Press",
          loggedAt: new Date(baseDate.getTime() + 30 * 86400000),
          weight: 105,
          reps: 5,
        },
        log20d,
      ];

      const shuffledVolumes = calculateWeeklyVolume(multiYearAndFuture, baseDate);
      expect(shuffledVolumes).toEqual(calculateWeeklyVolume(inWindowOnly, baseDate));
      // baseDate is 2024-01-14T23:00:00 -> 29h after sameDayLater (2024-01-13T18:00:00)
      expect(shuffledVolumes.find((v) => v.muscleGroup === "Chest")?.hoursSinceLastTrained).toBe(
        29,
      );
    });

    it("resolves case/whitespace-insensitive default and override names safely", () => {
      const overrideMap: Record<string, MuscleActivation> = {
        "cable crossover": {
          primaryMuscle: "Chest",
          secondaryMuscles: [{ muscleGroup: "Front Delts", contribution: 0.25 }],
        },
        "Custom Cable Fly": {
          primaryMuscle: "Chest",
          secondaryMuscles: [{ muscleGroup: "Front Delts", contribution: 0.2 }],
        },
      };

      const logs = [
        createLog("  bench   press ", 1),
        createLog("Cable Crossover", 2), // hits lowercase override key via normalized fast path
        createLog("custom cable fly", 3), // hits mixed-case override fallback
      ];
      const volumes = calculateWeeklyVolume(logs, baseDate, overrideMap);

      const chest = volumes.find((v) => v.muscleGroup === "Chest");
      const frontDelts = volumes.find((v) => v.muscleGroup === "Front Delts");
      expect(chest?.isoWeekSets).toBe(3);
      expect(chest?.isoWeekDirectSets).toBe(3);
      expect(frontDelts?.isoWeekSets).toBeCloseTo(0.75, 5);
      expect(getMuscleActivation("Cable Crossover", overrideMap)?.primaryMuscle).toBe("Chest");
      expect(getMuscleActivation("custom cable fly", overrideMap)?.primaryMuscle).toBe("Chest");
    });

    it("falls through to defaults when override has undefined value and ignores prototype keys or unknown exercises", () => {
      const sparseOverride = {
        "bench press": undefined as unknown as MuscleActivation,
        "Bench Press": undefined as unknown as MuscleActivation,
      };
      const resolver = createMuscleActivationResolver(sparseOverride);

      expect(getMuscleActivation("Bench Press", sparseOverride)?.primaryMuscle).toBe("Chest");
      expect(getMuscleActivation("bench press", sparseOverride)?.primaryMuscle).toBe("Chest");
      expect(resolver("Bench Press")?.primaryMuscle).toBe("Chest");

      const fallbackVolumes = calculateWeeklyVolume(
        [createLog("Bench Press", 1)],
        baseDate,
        sparseOverride,
      );
      expect(fallbackVolumes.find((v) => v.muscleGroup === "Chest")?.isoWeekSets).toBe(1);

      expect(getMuscleActivation("toString")).toBeNull();
      expect(getMuscleActivation("constructor", sparseOverride)).toBeNull();
      expect(resolver("toString")).toBeNull();
      expect(resolver("constructor")).toBeNull();

      expect(
        calculateWeeklyVolume(
          [createLog("toString", 1), createLog("constructor", 1)],
          baseDate,
          sparseOverride,
        ),
      ).toEqual([]);

      expect(
        calculateWeeklyVolume([createLog("Unmapped Exercise XYZ", 1)], baseDate, sparseOverride),
      ).toEqual([]);
    });
  });

  describe("calculateMuscleGroupInsights", () => {
    const baseDate = new Date("2024-01-14T23:00:00"); // Sunday

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
      // Because EWMA will smooth a single set, it will be well below MEV/2
      expect(insights.Chest?.landmark).toBe("detraining");
    });

    it("keeps direct and effective sets separate", () => {
      const logs = [createLog("Pull-Ups", 1), createLog("Pull-Ups", 1)];
      const insights = calculateMuscleGroupInsights(logs, baseDate);
      expect(insights.Lats?.isoWeekSets).toBe(2);
      expect(insights.Lats?.isoWeekDirectSets).toBe(2);
      expect(insights.Biceps?.isoWeekSets).toBe(1);
      expect(insights.Biceps?.isoWeekDirectSets).toBe(0);
    });

    it("determines recovery status adaptively based on volume", () => {
      // 8 sets = MEV for Chest = 1.0 ratio = 48h recovery required
      const heavyLogs = Array(8)
        .fill(null)
        .map(() => createLog("Bench Press", 1)); // 8 sets, 24h ago
      const insights = calculateMuscleGroupInsights(heavyLogs, baseDate);
      expect(insights.Chest?.recoveryReady).toBe(false); // requires 48h, only 24h passed

      // 1 set = 1/8 ratio = 6h recovery required
      const lightLogs = [createLog("Bench Press", 1)]; // 1 set, 24h ago
      const lightInsights = calculateMuscleGroupInsights(lightLogs, baseDate);
      expect(lightInsights.Chest?.recoveryReady).toBe(true); // requires 6h, 24h passed
    });

    it("rounds sets to 1 decimal", () => {
      const logs = [createLog("Bench Press", 1)];
      const insights = calculateMuscleGroupInsights(logs, baseDate);
      expect(Number.isInteger(insights.Chest!.sets * 10)).toBe(true);
    });

    it("applies personal MAV/MRV overrides to muscle landmark classification", () => {
      // Establish improving e1RM trend -> static without override at 22 sets is still at_MAV;
      // Without trend (stable/undefined), static Chest MRV is 22 and mavHigh is 18.
      // Lower personalMRV to 15 should classify ~15.4 sets as above_MRV even below static 22.
      const defaultLandmarks = resolveVolumeLandmarks("Chest");
      expect(defaultLandmarks.mrv).toBe(22);

      const loweredMRV = resolveVolumeLandmarks("Chest", { personalMRV: 15 });
      expect(loweredMRV).toEqual({ mev: 8, mavLow: 12, mavHigh: 15, mrv: 15 });
      expect(classifyLandmark(15, "Chest", undefined, { personalMRV: 15 })).toBe("above_MRV");
      expect(classifyLandmark(14, "Chest", undefined, { personalMRV: 15 })).toBe("at_MAV");

      const raisedMAV = resolveVolumeLandmarks("Chest", { personalMAV: 24 });
      expect(raisedMAV).toEqual({ mev: 8, mavLow: 12, mavHigh: 24, mrv: 26 });
      expect(classifyLandmark(22, "Chest", undefined, { personalMAV: 24 })).toBe("at_MAV");

      const loweredMAV = resolveVolumeLandmarks("Chest", { personalMAV: 14 });
      expect(loweredMAV).toEqual({ mev: 8, mavLow: 12, mavHigh: 14, mrv: 22 });
      expect(classifyLandmark(14, "Chest", undefined, { personalMAV: 14 })).toBe("approaching_MRV");

      const logs = Array(10)
        .fill(null)
        .map(() => createLog("Bench Press", 1));
      const withoutOverride = calculateMuscleGroupInsights(logs, baseDate);
      const withPersonalMRV = calculateMuscleGroupInsights(logs, baseDate, undefined, undefined, {
        Chest: { personalMRV: 12 },
      });

      expect(withoutOverride.Chest?.landmark).toBe("at_MAV");
      expect(withPersonalMRV.Chest?.landmark).toBe("above_MRV");
    });
  });
});
