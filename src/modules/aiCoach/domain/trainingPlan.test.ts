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
});
