import { describe, expect, it } from "vitest";
import { TrainingPlan } from "./trainingPlan";
import type { PlannedSession } from "./types";

describe("TrainingPlan", () => {
  const dummySession: PlannedSession = {
    dayOfWeek: 1, // Monday
    weekNumber: 1,
    sessionLabel: "Push",
    focusDescription: "Chest",
    exercises: [],
  };

  const dummySessionW2: PlannedSession = {
    dayOfWeek: 1, // Monday
    weekNumber: 2,
    sessionLabel: "Pull",
    focusDescription: "Upper Back",
    exercises: [],
  };

  describe("create", () => {
    it("creates a plan and clamps cycleWeeks between 1 and 4", () => {
      expect(TrainingPlan.create("2026-01-01T00:00:00Z", 0, []).cycleWeeks).toBe(2);
      expect(TrainingPlan.create("2026-01-01T00:00:00Z", 5, []).cycleWeeks).toBe(4);
      expect(TrainingPlan.create("2026-01-01T00:00:00Z", 2, []).cycleWeeks).toBe(2);
    });

    it("moves sessions that collide on the same (weekNumber, dayOfWeek) to the next free day", () => {
      const plan = TrainingPlan.create("2026-10-28T10:00:00.000Z", 2, [
        { ...dummySession, dayOfWeek: 1, sessionLabel: "Session A" },
        { ...dummySession, dayOfWeek: 1, sessionLabel: "Session B" },
        { ...dummySessionW2, dayOfWeek: 1, sessionLabel: "Other week" },
      ]);

      expect(plan.sessions.map((s) => s.dayOfWeek)).toEqual([1, 2, 1]);
    });

    it("caps planned sessions per week at 7 and drops excess sessions", () => {
      const eightSessions = Array.from({ length: 8 }, (_, i) => ({
        ...dummySession,
        dayOfWeek: i % 7,
        sessionLabel: `Session ${i + 1}`,
      }));

      const plan = TrainingPlan.create("2026-10-28T10:00:00.000Z", 1, eightSessions);
      expect(plan.sessions).toHaveLength(7);
      expect(new Set(plan.sessions.map((s) => s.dayOfWeek)).size).toBe(7);
    });

    it("sorts sessions chronologically by (weekNumber, ISO day of week)", () => {
      const unsorted = [
        { ...dummySessionW2, dayOfWeek: 5, sessionLabel: "W2 Friday" },
        { ...dummySession, dayOfWeek: 5, sessionLabel: "W1 Friday" },
        { ...dummySession, dayOfWeek: 0, sessionLabel: "W1 Sunday" },
        { ...dummySession, dayOfWeek: 1, sessionLabel: "W1 Monday" },
      ];

      const plan = TrainingPlan.create("2026-10-28T10:00:00.000Z", 2, unsorted);
      expect(plan.sessions.map((s) => `${s.weekNumber}:${s.dayOfWeek}`)).toEqual([
        "1:1", // W1 Monday
        "1:5", // W1 Friday
        "1:0", // W1 Sunday (end of ISO week)
        "2:5", // W2 Friday
      ]);
    });
  });

  describe("isStructuralReplacementFor", () => {
    const basePlan = TrainingPlan.create("2026-10-28T10:00:00.000Z", 2, [
      { ...dummySession, weekNumber: 1, dayOfWeek: 1, sessionLabel: "Upper" },
      { ...dummySession, weekNumber: 1, dayOfWeek: 3, sessionLabel: "Lower" },
    ]);

    it("returns false when cycleWeeks and session schedule match (in-place exercise adjustment)", () => {
      const adjustedExercisesPlan = TrainingPlan.create("2026-10-28T10:00:00.000Z", 2, [
        {
          ...dummySession,
          weekNumber: 1,
          dayOfWeek: 1,
          sessionLabel: "Upper",
          exercises: [{ exerciseName: "Incline Bench", targetSets: 4, restSeconds: 120 }],
        },
        { ...dummySession, weekNumber: 1, dayOfWeek: 3, sessionLabel: "Lower" },
      ]);

      expect(adjustedExercisesPlan.isStructuralReplacementFor(basePlan)).toBe(false);
    });

    it("returns true when cycleWeeks differ", () => {
      const diffWeeksPlan = TrainingPlan.create("2026-10-28T10:00:00.000Z", 4, [
        { ...dummySession, weekNumber: 1, dayOfWeek: 1 },
        { ...dummySession, weekNumber: 1, dayOfWeek: 3 },
      ]);

      expect(diffWeeksPlan.isStructuralReplacementFor(basePlan)).toBe(true);
    });

    it("returns true when session count or days differ", () => {
      const diffDaysPlan = TrainingPlan.create("2026-10-28T10:00:00.000Z", 2, [
        { ...dummySession, weekNumber: 1, dayOfWeek: 1 },
        { ...dummySession, weekNumber: 1, dayOfWeek: 4 }, // shifted from Wed (3) to Thu (4)
      ]);

      expect(diffDaysPlan.isStructuralReplacementFor(basePlan)).toBe(true);
    });
  });

  describe("reconstitute", () => {
    it("reconstitutes a plan without enforcing clamps", () => {
      // Reconstitute bypasses create() clamps since it's loading existing data
      const plan = TrainingPlan.reconstitute({
        createdAt: "2026-01-01T00:00:00Z",
        cycleWeeks: 5,
        sessions: [],
      });
      expect(plan.cycleWeeks).toBe(5);
    });
  });

  describe("getCurrentWeekNumber", () => {
    it("returns 1 if created in the future", () => {
      const plan = TrainingPlan.create(new Date(Date.now() + 100000).toISOString(), 2, []);
      expect(plan.getCurrentWeekNumber(new Date())).toBe(1);
    });

    it("calculates correct week number based on cycleWeeks", () => {
      const start = new Date("2026-01-01T00:00:00Z"); // Thursday
      const plan = TrainingPlan.create(start.toISOString(), 2, []); // 2 week cycle

      // Same week
      expect(plan.getCurrentWeekNumber(new Date("2026-01-05T00:00:00Z"))).toBe(1);
      // Next week (7 days later)
      expect(plan.getCurrentWeekNumber(new Date("2026-01-08T00:00:00Z"))).toBe(2);
      // Week 3 wraps back to week 1
      expect(plan.getCurrentWeekNumber(new Date("2026-01-15T00:00:00Z"))).toBe(1);
    });
  });

  describe("getNextUncompletedSession", () => {
    it("returns first uncompleted session chronologically", () => {
      const plan = TrainingPlan.create("2026-01-01T00:00:00Z", 2, [dummySession, dummySessionW2]);
      expect(plan.getNextUncompletedSession(new Set())).toBe(dummySession);
    });

    it("returns next session if first is completed", () => {
      const plan = TrainingPlan.create("2026-01-01T00:00:00Z", 2, [dummySession, dummySessionW2]);
      const completed = new Set([
        TrainingPlan.sessionKey(dummySession.weekNumber, dummySession.dayOfWeek),
      ]);
      expect(plan.getNextUncompletedSession(completed)).toBe(dummySessionW2);
    });

    it("returns undefined if all sessions are completed", () => {
      const plan = TrainingPlan.create("2026-01-01T00:00:00Z", 2, [dummySession]);
      const completed = new Set([
        TrainingPlan.sessionKey(dummySession.weekNumber, dummySession.dayOfWeek),
      ]);
      expect(plan.getNextUncompletedSession(completed)).toBeUndefined();
    });
  });

  describe("getPlannedSessionForDay", () => {
    it("returns exact match for day and week", () => {
      const plan = TrainingPlan.create("2026-01-01T00:00:00Z", 2, [dummySession, dummySessionW2]);
      expect(plan.getPlannedSessionForDay(1, 1)).toBe(dummySession);
      expect(plan.getPlannedSessionForDay(1, 2)).toBe(dummySessionW2);
    });

    it("falls back to day match if exact week is not found", () => {
      const plan = TrainingPlan.create("2026-01-01T00:00:00Z", 2, [dummySession]);
      // Week 2 requested, but only Week 1 exists for day 1
      expect(plan.getPlannedSessionForDay(1, 2)).toBe(dummySession);
    });

    it("returns undefined if no matching day exists", () => {
      const plan = TrainingPlan.create("2026-01-01T00:00:00Z", 2, [dummySession]);
      // Day 2 (Tuesday) requested, plan only has Monday
      expect(plan.getPlannedSessionForDay(2, 1)).toBeUndefined();
    });

    it("returns session even if it is completed", () => {
      const plan = TrainingPlan.create("2026-01-01T00:00:00Z", 2, [dummySession]);
      // The session should be returned regardless of completion status
      expect(plan.getPlannedSessionForDay(1, 1)).toBe(dummySession);
    });
  });

  describe("isFullyCompleted", () => {
    it("returns false for an empty plan so it does not trigger infinite regeneration", () => {
      const emptyPlan = TrainingPlan.create("2026-01-01T00:00:00Z", 2, []);
      expect(emptyPlan.isFullyCompleted(new Set())).toBe(false);
    });
  });

  describe("isInCurrentCycle", () => {
    it("rejects same-day logs recorded before the plan was created", () => {
      const plan = TrainingPlan.create("2026-10-28T14:00:00.000Z", 2, [dummySession]);
      const earlierSameDayLog = new Date("2026-10-28T10:30:00.000Z");
      const laterSameDayLog = new Date("2026-10-28T15:00:00.000Z");
      const now = new Date("2026-10-28T16:00:00.000Z");

      expect(plan.isInCurrentCycle(earlierSameDayLog, now)).toBe(false);
      expect(plan.isInCurrentCycle(laterSameDayLog, now)).toBe(true);
    });

    it("tolerates 23-hour daylight saving time transition days without dropping calendar days", () => {
      // In Berlin/CET, 2026-03-29 is the spring forward DST transition day (23 hours)
      const plan = TrainingPlan.create("2026-03-28T08:00:00.000Z", 2, [dummySession]);
      const dayAfterDst = new Date("2026-03-30T10:00:00.000Z");

      // 2 calendar days later must be in cycle
      expect(plan.isInCurrentCycle(dayAfterDst, dayAfterDst)).toBe(true);
    });
  });

  describe("findSatisfiedSession", () => {
    const sessionWithExercises: PlannedSession = {
      dayOfWeek: 1,
      weekNumber: 1,
      sessionLabel: "Upper",
      focusDescription: "Chest and Back",
      exercises: [
        { exerciseName: "Bench Press", targetSets: 3 },
        { exerciseName: "Barbell Row", targetSets: 3 },
      ],
    };

    it("evaluates satisfaction by exact exercise sets using default exerciseNameKey normalization", () => {
      const plan = TrainingPlan.create("2026-01-01T00:00:00Z", 2, [sessionWithExercises]);
      const monday = new Date("2026-01-05T10:00:00Z");

      // 3 sets of Bench Press completed (1 out of 2 exercises = 50% -> satisfied)
      const logsHalf = [
        { exerciseName: "bench press" },
        { exerciseName: "bench press" },
        { exerciseName: "bench press" },
      ];
      expect(plan.findSatisfiedSession(monday, logsHalf, new Set())).toEqual(sessionWithExercises);

      // Only 2 sets of Bench Press (0 out of 2 exercises completed -> undefined)
      const logsInsufficient = [{ exerciseName: "bench press" }, { exerciseName: "bench press" }];
      expect(plan.findSatisfiedSession(monday, logsInsufficient, new Set())).toBeUndefined();
    });

    it("falls back to muscle volume when exact exercise names do not match", () => {
      const plan = TrainingPlan.create("2026-01-01T00:00:00Z", 2, [sessionWithExercises]);
      const monday = new Date("2026-01-05T10:00:00Z");
      const getMuscle = (name: string) => {
        if (name.toLowerCase().includes("bench")) return "chest";
        if (name.toLowerCase().includes("row") || name.toLowerCase().includes("pull"))
          return "back";
        return undefined;
      };

      // Planned: 3 chest sets, 3 back sets = 6 total sets.
      // Logged: 3 chest sets (via Incline Bench Press substitute) = 3 sets done out of 6 (50%) -> satisfied
      const substituteLogs = [
        { exerciseName: "Incline Bench Press" },
        { exerciseName: "Incline Bench Press" },
        { exerciseName: "Incline Bench Press" },
      ];
      expect(
        plan.findSatisfiedSession(
          monday,
          substituteLogs,
          new Set(),
          (name) => name.toLowerCase(),
          getMuscle,
        ),
      ).toEqual(sessionWithExercises);

      // Only 2 sets logged out of 6 (33%) -> undefined
      expect(
        plan.findSatisfiedSession(
          monday,
          substituteLogs.slice(0, 2),
          new Set(),
          (name) => name.toLowerCase(),
          getMuscle,
        ),
      ).toBeUndefined();
    });
  });
});
