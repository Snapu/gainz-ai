import { describe, expect, it } from "vitest";
import { TrainingPlan } from "../domain";
import { evaluateCompletedSessions } from "./evaluateCompletedSessions";

describe("evaluateCompletedSessions", () => {
  const planCreated = new Date("2026-01-05T08:00:00Z"); // Monday
  const session1 = {
    dayOfWeek: 1, // Monday
    weekNumber: 1,
    sessionLabel: "Legs",
    focusDescription: "Quads & Hamstrings",
    exercises: [{ exerciseName: "Squat", targetSets: 3 }],
  };
  const session2 = {
    dayOfWeek: 3, // Wednesday
    weekNumber: 1,
    sessionLabel: "Upper",
    focusDescription: "Chest",
    exercises: [{ exerciseName: "Bench Press", targetSets: 3 }],
  };

  const plan = TrainingPlan.create(planCreated.toISOString(), 1, [session1, session2]);
  const normalize = (n: string) => n.trim().toLowerCase();
  const resolveMuscle = () => undefined;
  const cycleDate = new Date("2026-01-07T12:00:00Z"); // Inside week 1 of cycle

  it("returns no completed sessions when logs are empty", () => {
    const result = evaluateCompletedSessions(
      plan,
      new Set(),
      [],
      normalize,
      resolveMuscle,
      cycleDate,
    );
    expect(result.newCompletedSessions.size).toBe(0);
    expect(result.hasChanged).toBe(false);
    expect(result.isPlanFullyCompleted).toBe(false);
  });

  it("ignores logs from before the plan creation date", () => {
    const oldLog = {
      loggedAt: new Date("2026-01-01T10:00:00Z"),
      exerciseName: "Squat",
    };
    const result = evaluateCompletedSessions(
      plan,
      new Set(),
      [oldLog],
      normalize,
      resolveMuscle,
      cycleDate,
    );
    expect(result.newCompletedSessions.size).toBe(0);
  });

  it("marks a scheduled session completed when logs satisfy the session", () => {
    const logs = [
      { loggedAt: new Date("2026-01-05T12:00:00Z"), exerciseName: "Squat" },
      { loggedAt: new Date("2026-01-05T12:05:00Z"), exerciseName: "Squat" },
      { loggedAt: new Date("2026-01-05T12:10:00Z"), exerciseName: "Squat" },
    ];

    const result = evaluateCompletedSessions(
      plan,
      new Set(),
      logs,
      normalize,
      resolveMuscle,
      cycleDate,
    );
    const expectedKey = TrainingPlan.sessionKey(1, 1);
    expect(result.newCompletedSessions.has(expectedKey)).toBe(true);
    expect(result.hasChanged).toBe(true);
    expect(result.isPlanFullyCompleted).toBe(false);
  });

  it("matches an uncompleted session even if performed on a different day (fallback)", () => {
    // Session 2 is planned for Wednesday (day 3), but user performs Bench Press on Tuesday (day 2)
    const tuesdayLogs = [
      { loggedAt: new Date("2026-01-06T12:00:00Z"), exerciseName: "Bench Press" },
      { loggedAt: new Date("2026-01-06T12:05:00Z"), exerciseName: "Bench Press" },
      { loggedAt: new Date("2026-01-06T12:10:00Z"), exerciseName: "Bench Press" },
    ];

    const result = evaluateCompletedSessions(
      plan,
      new Set(),
      tuesdayLogs,
      normalize,
      resolveMuscle,
      cycleDate,
    );
    const expectedKey = TrainingPlan.sessionKey(1, 3);
    expect(result.newCompletedSessions.has(expectedKey)).toBe(true);
  });

  it("detects when all sessions in the plan are fully completed", () => {
    const logs = [
      // Monday logs
      { loggedAt: new Date("2026-01-05T12:00:00Z"), exerciseName: "Squat" },
      { loggedAt: new Date("2026-01-05T12:05:00Z"), exerciseName: "Squat" },
      { loggedAt: new Date("2026-01-05T12:10:00Z"), exerciseName: "Squat" },
      // Wednesday logs
      { loggedAt: new Date("2026-01-07T12:00:00Z"), exerciseName: "Bench Press" },
      { loggedAt: new Date("2026-01-07T12:05:00Z"), exerciseName: "Bench Press" },
      { loggedAt: new Date("2026-01-07T12:10:00Z"), exerciseName: "Bench Press" },
    ];

    const result = evaluateCompletedSessions(
      plan,
      new Set(),
      logs,
      normalize,
      resolveMuscle,
      cycleDate,
    );
    expect(result.newCompletedSessions.size).toBe(2);
    expect(result.isPlanFullyCompleted).toBe(true);
    expect(result.hasChanged).toBe(true);
  });

  it("does not re-select primary candidate if already completed and matches pending session via fallback", () => {
    // Suppose on Tuesday (day 2), user does Bench Press (satisfying Wednesday's session2 out of order).
    // Then on Wednesday (day 3), user does Squat (which satisfies Monday's session1).
    // The primary candidate for Wednesday is session2, but session2 was already completed on Tuesday.
    // It should NOT re-return session2, but fall through to complete session1!
    const logs = [
      // Tuesday logs (satisfies session 2 out of order)
      { loggedAt: new Date("2026-01-06T12:00:00Z"), exerciseName: "Bench Press" },
      { loggedAt: new Date("2026-01-06T12:05:00Z"), exerciseName: "Bench Press" },
      { loggedAt: new Date("2026-01-06T12:10:00Z"), exerciseName: "Bench Press" },
      // Wednesday logs (satisfies session 1 on session 2's planned day)
      { loggedAt: new Date("2026-01-07T12:00:00Z"), exerciseName: "Squat" },
      { loggedAt: new Date("2026-01-07T12:05:00Z"), exerciseName: "Squat" },
      { loggedAt: new Date("2026-01-07T12:10:00Z"), exerciseName: "Squat" },
    ];

    const result = evaluateCompletedSessions(
      plan,
      new Set(),
      logs,
      normalize,
      resolveMuscle,
      cycleDate,
    );

    const session1Key = TrainingPlan.sessionKey(1, 1);
    const session2Key = TrainingPlan.sessionKey(1, 3);
    expect(result.newCompletedSessions.has(session1Key)).toBe(true);
    expect(result.newCompletedSessions.has(session2Key)).toBe(true);
    expect(result.isPlanFullyCompleted).toBe(true);
  });
});
