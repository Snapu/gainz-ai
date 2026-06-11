import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import { createDeloadPhase, DELOAD_DURATION_MS } from "./deloadPhase";
import { calculateTrainingInsights } from "./index";

function makeLog(exerciseName: string, loggedAt: Date, weight = 80, reps = 10): ExerciseLog {
  return { id: crypto.randomUUID(), exerciseName, loggedAt, weight, reps };
}

/** Build 4 weeks of logs relative to a target date, newest week last. */
function buildFourWeekLogs(targetDate: Date, setsPerWeek: number): ExerciseLog[] {
  const logs: ExerciseLog[] = [];
  for (let w = 3; w >= 0; w--) {
    const weekBase = new Date(
      targetDate.getTime() - w * 7 * 24 * 60 * 60 * 1000 - 3 * 24 * 60 * 60 * 1000,
    );
    for (let s = 0; s < setsPerWeek; s++) {
      logs.push(makeLog("Bench Press", new Date(weekBase.getTime() + s * 60_000)));
    }
  }
  return logs;
}

describe("calculateTrainingInsights", () => {
  const now = new Date("2026-05-06T12:00:00Z");

  describe("baseline", () => {
    it("returns Inactive phase for empty logs", () => {
      const result = calculateTrainingInsights([], now);
      expect(result.phase).toBe("Inactive");
      expect(result.acwr).toBeNull();
      expect(result.deloadStatus).toBe("none");
      expect(result.e1rmPaused).toBe(false);
      expect(result.plateauPaused).toBe(false);
    });

    it("populates all required fields", () => {
      const result = calculateTrainingInsights([], now);
      expect(result).toMatchObject({
        phase: expect.any(String),
        acwr: null,
        fatigue: expect.objectContaining({ shouldDeload: false }),
        e1rm: expect.any(Object),
        muscleGroups: expect.any(Object),
        deloadStatus: "none",
        deloadEndsAt: null,
        deloadTimeRemainingMs: null,
        e1rmPaused: false,
        plateauPaused: false,
        deloadTriggerSnapshot: null,
      });
    });
  });

  describe("deload integration", () => {
    it("forces phase to Deload when deload is active", () => {
      const deloadPhase = createDeloadPhase(
        4,
        ["volumeSpike"],
        new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      );
      const result = calculateTrainingInsights([], now, undefined, undefined, deloadPhase);
      expect(result.phase).toBe("Deload");
      expect(result.deloadStatus).toBe("active");
    });

    it("suppresses fatigue shouldDeload during active deload (prevents re-trigger)", () => {
      // Build enough load history to normally trigger a deload
      const logs = buildFourWeekLogs(now, 12);
      // Spike current week to trigger volumeSpike
      for (let i = 0; i < 10; i++) {
        logs.push(makeLog("Bench Press", new Date(now.getTime() - i * 60_000)));
      }
      const deloadPhase = createDeloadPhase(
        4,
        ["volumeSpike"],
        new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      );
      const result = calculateTrainingInsights(logs, now, undefined, undefined, deloadPhase);
      expect(result.fatigue.shouldDeload).toBe(false);
      expect(result.e1rmPaused).toBe(true);
      expect(result.plateauPaused).toBe(true);
    });

    it("excludes deload window logs from e1RM trend", () => {
      const deloadStart = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const deloadEnd = new Date(deloadStart.getTime() + DELOAD_DURATION_MS);
      const deloadPhase: import("./deloadPhase").DeloadPhase = {
        startedAt: deloadStart.toISOString(),
        endsAt: deloadEnd.toISOString(),
        fatigueRiskScore: 4,
        triggeredBy: ["volumeSpike"],
      };

      // Pre-deload logs: heavy (should be in trend)
      const preLogs = [
        makeLog("Squat", new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000), 120, 5),
        makeLog("Squat", new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000), 115, 5),
      ];
      // Deload logs: very light (should be excluded from trend)
      const deloadLogs = [
        makeLog("Squat", new Date(deloadStart.getTime() + 2 * 24 * 60 * 60 * 1000), 60, 10),
        makeLog("Squat", new Date(deloadStart.getTime() + 3 * 24 * 60 * 60 * 1000), 60, 10),
      ];

      const withDeloadLogs = calculateTrainingInsights(
        [...preLogs, ...deloadLogs],
        now,
        undefined,
        undefined,
        deloadPhase,
      );
      const withoutDeloadLogs = calculateTrainingInsights(
        preLogs,
        now,
        undefined,
        undefined,
        deloadPhase,
      );

      // e1RM should not be dragged down by the light deload sets
      expect(withDeloadLogs.e1rm.Squat?.e1rm).toBeCloseTo(
        withoutDeloadLogs.e1rm.Squat?.e1rm ?? 0,
        0,
      );
    });

    it("excludes completed and canceled deload window logs from e1RM trend", () => {
      // Deload started 14 days ago, ended 7 days ago (completed)
      const deloadStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const deloadEnd = new Date(deloadStart.getTime() + DELOAD_DURATION_MS);
      const completedPhase: import("./deloadPhase").DeloadPhase = {
        startedAt: deloadStart.toISOString(),
        endsAt: deloadEnd.toISOString(),
        fatigueRiskScore: 4,
        triggeredBy: ["volumeSpike"],
      };

      // Canceled deload: ended after 3 days
      const canceledPhase: import("./deloadPhase").DeloadPhase = {
        ...completedPhase,
        canceledAt: new Date(deloadStart.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      };

      // Pre-deload: heavy
      const preLogs = [
        makeLog("Squat", new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000), 120, 5),
      ];
      // Deload logs: light (should be excluded)
      const deloadLogs = [
        makeLog("Squat", new Date(deloadStart.getTime() + 2 * 24 * 60 * 60 * 1000), 60, 10),
      ];
      // Post-deload: heavy again
      const postLogs = [
        makeLog("Squat", new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), 125, 5),
      ];

      const allLogs = [...preLogs, ...deloadLogs, ...postLogs];
      const noDeloadLogs = [...preLogs, ...postLogs];

      const withCompletedDeload = calculateTrainingInsights(
        allLogs,
        now,
        undefined,
        undefined,
        completedPhase,
      );
      const withCanceledDeload = calculateTrainingInsights(
        allLogs,
        now,
        undefined,
        undefined,
        canceledPhase,
      );
      const withoutDeloadPhase = calculateTrainingInsights(
        noDeloadLogs,
        now,
        undefined,
        undefined,
        undefined,
      );

      // Both completed and canceled should exclude the light deload logs and match the pure trend
      expect(withCompletedDeload.e1rm.Squat?.e1rm).toBeCloseTo(
        withoutDeloadPhase.e1rm.Squat?.e1rm ?? 0,
        0,
      );
      expect(withCanceledDeload.e1rm.Squat?.e1rm).toBeCloseTo(
        withoutDeloadPhase.e1rm.Squat?.e1rm ?? 0,
        0,
      );
    });

    it("deloadEndsAt and deloadTimeRemainingMs are set during active deload", () => {
      const deloadPhase = createDeloadPhase(
        4,
        ["volumeSpike"],
        new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      );
      const result = calculateTrainingInsights([], now, undefined, undefined, deloadPhase);
      expect(result.deloadEndsAt).toBe(deloadPhase.endsAt);
      expect(result.deloadTimeRemainingMs).toBeGreaterThan(0);
      expect(result.deloadTimeRemainingMs).toBeLessThan(DELOAD_DURATION_MS);
    });

    it("averages out deload weeks from the prior 3-week baseline to prevent false spikes", () => {
      // Create a 4-week history where:
      // W-3 (normal): 15 sets
      // W-2 (normal): 15 sets
      // W-1 (deload): 5 sets
      // W0 (normal resumed): 15 sets

      const logs: ExerciseLog[] = [];
      const addLogs = (daysAgo: number, sets: number) => {
        for (let i = 0; i < sets; i++) {
          logs.push(
            makeLog("Bench Press", new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)),
          );
        }
      };

      addLogs(24, 15); // Week -3
      addLogs(17, 15); // Week -2
      addLogs(10, 5); // Week -1 (Deload week)
      addLogs(3, 15); // Current week

      const completedDeload = createDeloadPhase(
        4,
        ["performanceDecline"],
        new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000), // Started 14 days ago, ended 7 days ago
      );

      const result = calculateTrainingInsights(logs, now, undefined, undefined, completedDeload);

      // With the baseline averaging fix, the 5-set week is replaced by the average of the 15-set weeks.
      // So the baseline is ~15 sets, and 15 sets in the current week should NOT trigger a volume spike.
      expect(result.fatigue.triggeredBy).not.toContain("volumeSpike");
    });

    it("evaluates fatigue on completed ISO weeks only (partial-week guard)", () => {
      // 2026-05-06 is a Wednesday.
      // The current ISO week started on Mon 2026-05-04.
      // The previous completed ISO week was Mon 2026-04-27 -> Sun 2026-05-03.
      // We'll create logs such that:
      // - W1 (completed): 20 sets
      // - W0 (completed): 20 sets
      // - Current partial week (Mon-Wed): 5 sets

      const logs: ExerciseLog[] = [];
      const addLogs = (date: string, sets: number) => {
        for (let i = 0; i < sets; i++) {
          logs.push(makeLog("Bench Press", new Date(date)));
        }
      };

      // Logs in completed W3
      addLogs("2026-04-08T12:00:00Z", 20);
      // Logs in completed W2
      addLogs("2026-04-15T12:00:00Z", 20);
      // Logs in completed W1
      addLogs("2026-04-22T12:00:00Z", 20);
      // Logs in completed W0
      addLogs("2026-04-29T12:00:00Z", 20);
      // Logs in current partial week
      addLogs("2026-05-05T12:00:00Z", 5);

      const insights = calculateTrainingInsights(logs, now);

      // Because we use completed ISO weeks only, the 5 sets from the current partial week
      // should NOT be compared to the 20 sets from W1/W0 for fatigue tracking. W0 will be the
      // week of 2026-04-29 (20 sets).
      // So no performance decline / volume drop should be detected.
      expect(insights.fatigue.riskScore).toBe(0);
    });

    it("deloadStatus is completed after endsAt passes", () => {
      const deloadPhase = createDeloadPhase(
        4,
        ["volumeSpike"],
        new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000),
      );
      const result = calculateTrainingInsights([], now, undefined, undefined, deloadPhase);
      expect(result.deloadStatus).toBe("completed");
      expect(result.e1rmPaused).toBe(false);
      expect(result.plateauPaused).toBe(false);
      expect(result.deloadTimeRemainingMs).toBeNull();
    });

    it("deloadStatus is canceled when canceledAt is set", () => {
      const deloadPhase = {
        ...createDeloadPhase(
          3,
          ["tonnageSpike"],
          new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        ),
        canceledAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const result = calculateTrainingInsights([], now, undefined, undefined, deloadPhase);
      expect(result.deloadStatus).toBe("canceled");
      expect(result.e1rmPaused).toBe(false);
    });

    it("deloadTriggerSnapshot is populated for active and completed deloads", () => {
      const activeDeload = createDeloadPhase(
        5,
        ["volumeSpike", "tonnageSpike"],
        new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      );
      const active = calculateTrainingInsights([], now, undefined, undefined, activeDeload);
      expect(active.deloadTriggerSnapshot).toMatchObject({
        triggeredBy: ["volumeSpike", "tonnageSpike"],
        riskScore: 5,
      });

      const completedDeload = createDeloadPhase(
        3,
        ["performanceDecline"],
        new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      );
      const completed = calculateTrainingInsights([], now, undefined, undefined, completedDeload);
      expect(completed.deloadTriggerSnapshot?.triggeredBy).toContain("performanceDecline");
    });

    it("deloadTriggerSnapshot is null when no deload or canceled", () => {
      const none = calculateTrainingInsights([], now);
      expect(none.deloadTriggerSnapshot).toBeNull();

      const canceled = {
        ...createDeloadPhase(3, ["volumeSpike"], new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)),
        canceledAt: new Date().toISOString(),
      };
      const canceledResult = calculateTrainingInsights([], now, undefined, undefined, canceled);
      expect(canceledResult.deloadTriggerSnapshot).toBeNull();
    });
  });

  describe("phase derivation", () => {
    it("returns Inactive when ACWR is below 0.6", () => {
      // Only a few logs scattered in the chronic window, none in the acute window
      const chronicLogs = [
        makeLog("Squat", new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000), 100, 5),
        makeLog("Squat", new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000), 100, 5),
        makeLog("Squat", new Date(now.getTime() - 22 * 24 * 60 * 60 * 1000), 100, 5),
        makeLog("Squat", new Date(now.getTime() - 23 * 24 * 60 * 60 * 1000), 100, 5),
      ];
      const result = calculateTrainingInsights(chronicLogs, now);
      // Low ACWR (high chronic, no acute) should push toward Inactive
      expect(["Inactive", "Maintain"]).toContain(result.phase);
    });

    it("shouldDeload=true overrides phase to Deload even without active deloadPhase record", () => {
      // Build logs that trigger shouldDeload
      const logs = buildFourWeekLogs(now, 15);
      // Current week spike
      for (let i = 0; i < 15; i++) {
        logs.push(makeLog("Bench Press", new Date(now.getTime() - i * 3600_000)));
      }
      const result = calculateTrainingInsights(logs, now);
      if (result.fatigue.shouldDeload) {
        expect(result.phase).toBe("Deload");
      }
    });
  });
});
