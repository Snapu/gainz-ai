import { describe, expect, it, vi } from "vitest";
import type { ExerciseE1RM, TrainingInsights } from "@/modules/trainingInsights/domain";
import { TrainingPlan } from "../domain";
import { formatExercises, formatPlanForPrompt } from "./promptBuilder";

describe("formatExercises", () => {
  it("appends rpe_trigger:overload_ready when rpeOverloadReady is true", () => {
    const e1rmData: Record<string, ExerciseE1RM> = {
      "Bench Press": {
        e1rm: 100,
        trend: [100, 100, 100],
        trendDates: [new Date("2024-01-01"), new Date("2024-01-08"), new Date("2024-01-16")],
        plateau: false,
        bestRPE: 7,
        rpeOverloadReady: true,
        unit: "kg",
        targetWeightHyp: null,
        targetWeightStr: null,
        swapRecommended: false,
      },
    };

    const output = formatExercises(
      { e1rm: e1rmData } as unknown as TrainingInsights,
      [],
      undefined,
    );
    expect(output).toContain("rpe_trigger:overload_ready");
  });

  it("appends rpe:<bestRPE> when rpeOverloadReady is false but bestRPE is present", () => {
    const e1rmData: Record<string, ExerciseE1RM> = {
      Squat: {
        e1rm: 150,
        trend: [150],
        trendDates: [new Date("2024-01-01")],
        plateau: false,
        bestRPE: 9,
        rpeOverloadReady: false,
        unit: "kg",
        targetWeightHyp: null,
        targetWeightStr: null,
        swapRecommended: false,
      },
    };

    const output = formatExercises(
      { e1rm: e1rmData } as unknown as TrainingInsights,
      [],
      undefined,
    );
    expect(output).toContain("rpe:9");
  });
});

describe("formatPlanForPrompt", () => {
  it("should format a valid training plan into compact text", () => {
    const plan = TrainingPlan.create("2026-06-02T10:00:00Z", 2, [
      {
        dayOfWeek: 1,
        weekNumber: 1,
        sessionLabel: "Unit A",
        focusDescription: "Push Focus",
        exercises: [
          {
            exerciseName: "Incline DB Press",
            targetSets: 3,
            targetReps: "6-8",
            targetRpe: 8.5,
            restSeconds: 120,
          },
          {
            exerciseName: "DB Squats",
            targetSets: 2,
            targetReps: "8-10",
            targetWeight: "60kg",
            notes: "Knees out",
          },
          {
            exerciseName: "Bicep Curls",
            targetSets: 3,
            targetReps: "12",
            supersetId: "A",
          },
        ],
      },
    ]);

    // Mark session as done so the output is deterministic regardless of current day
    const completedKeys = new Set(["W1-D1"]);
    const result = formatPlanForPrompt(plan, 1, completedKeys);
    const expected = `cycle: 2w, created: 2026-06-02
W1-Mon Unit A (Push Focus): [DONE]
  Incline DB Press: 3×6-8 @RPE8.5 120s
  DB Squats: 2×8-10 @60kg (Knees out)
  Bicep Curls: 3×12 [SS:A]`;

    expect(result).toBe(expected);
  });

  it("marks the missed Monday session [NEXT] when today is Wednesday", () => {
    // Pin clock to Wednesday 2026-07-22
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T08:00:00"));

    try {
      const plan = TrainingPlan.create("2026-06-02T10:00:00Z", 2, [
        {
          dayOfWeek: 1,
          weekNumber: 1,
          sessionLabel: "Upper A",
          focusDescription: "Push",
          exercises: [{ exerciseName: "Bench Press", targetSets: 3, targetReps: "6-8" }],
        },
        {
          dayOfWeek: 3,
          weekNumber: 1,
          sessionLabel: "Lower",
          focusDescription: "Legs",
          exercises: [{ exerciseName: "Squats", targetSets: 3, targetReps: "8-10" }],
        },
        {
          dayOfWeek: 5,
          weekNumber: 1,
          sessionLabel: "Upper B",
          focusDescription: "Pull",
          exercises: [{ exerciseName: "Rows", targetSets: 3, targetReps: "8-12" }],
        },
      ]);

      // No sessions completed — Monday is the next uncompleted, but today is Wednesday.
      const result = formatPlanForPrompt(plan, 1, new Set());

      expect(result).toContain("W1-Mon Upper A (Push): [NEXT]");
      // Wednesday and Friday should have no marker
      expect(result).toContain("W1-Wed Lower (Legs):");
      expect(result).not.toContain("W1-Wed Lower (Legs): [");
      expect(result).toContain("W1-Fri Upper B (Pull):");
      expect(result).not.toContain("W1-Fri Upper B (Pull): [");
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks the next uncompleted session [TODAY] when it falls on the current day", () => {
    // Pin clock to Monday 2026-07-20
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T08:00:00"));

    try {
      const plan = TrainingPlan.create("2026-06-02T10:00:00Z", 1, [
        {
          dayOfWeek: 1,
          weekNumber: 1,
          sessionLabel: "Monday Session",
          focusDescription: "Full Body",
          exercises: [{ exerciseName: "Deadlift", targetSets: 3, targetReps: "5" }],
        },
      ]);

      const result = formatPlanForPrompt(plan, 1, new Set());
      expect(result).toContain("Monday Session (Full Body): [TODAY]");
    } finally {
      vi.useRealTimers();
    }
  });
});
