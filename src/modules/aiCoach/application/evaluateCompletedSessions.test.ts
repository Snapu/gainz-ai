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

  it("prioritizes exact exercise match on next uncompleted session over weekday muscle-volume match when two sessions share muscles", () => {
    const upperA = {
      dayOfWeek: 1, // Monday
      weekNumber: 1,
      sessionLabel: "Einheit A — Brust & V-Taper",
      focusDescription: "Incline & Pull-ups",
      exercises: [
        { exerciseName: "Schrägbankdrücken Kurzhanteln", targetSets: 3 },
        { exerciseName: "Klimmzüge", targetSets: 3 },
      ],
    };
    const upperC = {
      dayOfWeek: 5, // Friday
      weekNumber: 1,
      sessionLabel: "Einheit C — Kraft-Fundament",
      focusDescription: "Flat Bench & Rows",
      exercises: [
        { exerciseName: "Bankdrücken", targetSets: 3 },
        { exerciseName: "Seated Cable Row", targetSets: 3 },
      ],
    };
    const splitPlan = TrainingPlan.create(planCreated.toISOString(), 1, [upperA, upperC]);

    const muscleResolver = (name: string) => {
      if (name.includes("bankdrücken") || name.includes("Bankdrücken")) return "Chest";
      if (name.includes("Klimmzüge") || name.includes("Row")) return "Back";
      return undefined;
    };

    // User performs Einheit A on Friday (dayOfWeek = 5, which is upperC's scheduled weekday)
    const fridayLogsForUpperA = [
      {
        loggedAt: new Date("2026-01-09T12:00:00Z"),
        exerciseName: "Schrägbankdrücken Kurzhanteln",
      },
      {
        loggedAt: new Date("2026-01-09T12:03:00Z"),
        exerciseName: "Schrägbankdrücken Kurzhanteln",
      },
      {
        loggedAt: new Date("2026-01-09T12:06:00Z"),
        exerciseName: "Schrägbankdrücken Kurzhanteln",
      },
      { loggedAt: new Date("2026-01-09T12:10:00Z"), exerciseName: "Klimmzüge" },
      { loggedAt: new Date("2026-01-09T12:13:00Z"), exerciseName: "Klimmzüge" },
      { loggedAt: new Date("2026-01-09T12:16:00Z"), exerciseName: "Klimmzüge" },
    ];

    const result = evaluateCompletedSessions(
      splitPlan,
      new Set(),
      fridayLogsForUpperA,
      normalize,
      muscleResolver,
      new Date("2026-01-09T15:00:00Z"),
    );

    // Must mark Einheit A (W1-D1) as completed, NOT Einheit C (W1-D5)
    expect(result.newCompletedSessions.has(TrainingPlan.sessionKey(1, 1))).toBe(true);
    expect(result.newCompletedSessions.has(TrainingPlan.sessionKey(1, 5))).toBe(false);
  });

  it("evaluates days in chronological order even when logs array is reverse-sorted", () => {
    const upperW1 = {
      dayOfWeek: 1,
      weekNumber: 1,
      sessionLabel: "W1 Upper",
      focusDescription: "Chest",
      exercises: [{ exerciseName: "Bench Press", targetSets: 2 }],
    };
    const upperW2 = {
      dayOfWeek: 1,
      weekNumber: 2,
      sessionLabel: "W2 Upper",
      focusDescription: "Chest",
      exercises: [{ exerciseName: "Bench Press", targetSets: 2 }],
    };
    const twoWeekPlan = TrainingPlan.create(planCreated.toISOString(), 2, [upperW1, upperW2]);

    // Logs passed newest-first (Wednesday Jan 7, while only 1 session was done)
    const logsNewestFirst = [
      { loggedAt: new Date("2026-01-07T12:05:00Z"), exerciseName: "Bench Press" },
      { loggedAt: new Date("2026-01-07T12:00:00Z"), exerciseName: "Bench Press" },
    ];

    const result = evaluateCompletedSessions(
      twoWeekPlan,
      new Set(),
      logsNewestFirst,
      normalize,
      resolveMuscle,
      new Date("2026-01-08T12:00:00Z"),
    );

    expect(result.newCompletedSessions.has(TrainingPlan.sessionKey(1, 1))).toBe(true);
    expect(result.newCompletedSessions.has(TrainingPlan.sessionKey(2, 1))).toBe(false);
  });

  it("marks a session completed when workout sets cross midnight", () => {
    const mondayNightPlan = TrainingPlan.create(planCreated.toISOString(), 1, [
      {
        dayOfWeek: 1,
        weekNumber: 1,
        sessionLabel: "Legs",
        focusDescription: "Quads & Core",
        exercises: [
          { exerciseName: "Squat", targetSets: 2 },
          { exerciseName: "Plank", targetSets: 1 },
        ],
      },
    ]);

    // User starts Squat at 23:45 Monday, finishes Plank at 00:10 Tuesday
    const midnightCrossingLogs = [
      { loggedAt: new Date("2026-01-05T23:45:00Z"), exerciseName: "Squat" },
      { loggedAt: new Date("2026-01-05T23:55:00Z"), exerciseName: "Squat" },
      { loggedAt: new Date("2026-01-06T00:10:00Z"), exerciseName: "Plank" },
    ];

    const result = evaluateCompletedSessions(
      mondayNightPlan,
      new Set(),
      midnightCrossingLogs,
      normalize,
      resolveMuscle,
      new Date("2026-01-06T12:00:00Z"),
    );

    expect(result.newCompletedSessions.has(TrainingPlan.sessionKey(1, 1))).toBe(true);
    expect(result.isPlanFullyCompleted).toBe(true);
  });
});
