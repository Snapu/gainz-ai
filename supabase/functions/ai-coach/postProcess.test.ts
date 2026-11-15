import { describe, expect, it } from "vitest";
import { postProcessCoachingAdvice } from "./postProcess";
import type { CoachActionRequestDto, CoachingAdvice } from "./schemas";

describe("postProcessCoachingAdvice", () => {
  const baseResponse: CoachingAdvice = {
    coachMessage: "Here is your workout.",
    recommendedWorkout: [
      {
        exerciseName: "Bicep Curls",
        targetSets: 3,
        targetReps: "10",
        restSeconds: 60,
      },
      {
        exerciseName: "Bench Press",
        targetSets: 3,
        targetReps: "5",
        restSeconds: 120,
      },
      {
        exerciseName: "Squat",
        targetSets: 3,
        targetReps: "8-12",
        restSeconds: 200,
      },
    ],
    startDeload: true,
  };

  it("removes recommendedWorkout during post-workout phase", () => {
    const result = postProcessCoachingAdvice(baseResponse, "post-workout", "none");
    expect(result.recommendedWorkout).toBeUndefined();
    expect(result.coachMessage).toBe("Here is your workout.");
  });

  it("removes startDeload only when deload is active", () => {
    expect(
      postProcessCoachingAdvice(baseResponse, "planning", "active").startDeload,
    ).toBeUndefined();
    expect(postProcessCoachingAdvice(baseResponse, "planning", "none").startDeload).toBe(true);
  });

  it("clamps rest periods based on rep ranges while respecting metabolic protocols", () => {
    const result = postProcessCoachingAdvice(baseResponse, "planning", "none");
    const workout = result.recommendedWorkout ?? [];
    expect(workout.find((e) => e.exerciseName === "Bicep Curls")?.restSeconds).toBe(120);
    expect(workout.find((e) => e.exerciseName === "Bench Press")?.restSeconds).toBe(180);
    expect(workout.find((e) => e.exerciseName === "Squat")?.restSeconds).toBe(180);

    const metabolic = postProcessCoachingAdvice(
      {
        coachMessage: "Burnout!",
        recommendedWorkout: [
          {
            exerciseName: "Lateral Raises",
            targetSets: 1,
            targetReps: "15",
            restSeconds: 15,
            isMetabolicProtocol: true,
          },
        ],
      },
      "planning",
      "none",
    );
    expect(metabolic.recommendedWorkout?.[0]?.restSeconds).toBe(15);
  });

  it("normalizes and defaults targetRpe for resistance exercises", () => {
    const advice: CoachingAdvice = {
      coachMessage: "Workout",
      recommendedWorkout: [
        { exerciseName: "Squat", targetSets: 3, targetReps: "5" },
        { exerciseName: "Bench Press", targetSets: 3, targetReps: "8", targetRpe: 8.3 },
        { exerciseName: "Plank", targetSets: 3, targetDurationSeconds: 60 },
      ],
    };

    const normal = postProcessCoachingAdvice(advice, "planning", "none");
    expect(normal.recommendedWorkout?.[0]?.targetRpe).toBe(8.5);
    expect(normal.recommendedWorkout?.[1]?.targetRpe).toBe(8.5);
    expect(normal.recommendedWorkout?.[2]?.targetRpe).toBeUndefined();

    const deload = postProcessCoachingAdvice(advice, "planning", "active");
    expect(deload.recommendedWorkout?.[0]?.targetRpe).toBe(6.5);
  });

  it("upcasts legacy string duration/distance in targetReps into explicit numeric fields", () => {
    const legacy: CoachingAdvice = {
      coachMessage: "Conditioning",
      recommendedWorkout: [
        { exerciseName: "Plank", targetSets: 3, targetReps: "45 secs" },
        { exerciseName: "Rowing", targetSets: 1, targetReps: "500m" },
      ],
    };

    const result = postProcessCoachingAdvice(legacy, "planning", "none");
    expect(result.recommendedWorkout?.[0]?.targetDurationSeconds).toBe(45);
    expect(result.recommendedWorkout?.[0]?.targetReps).toBeUndefined();
    expect(result.recommendedWorkout?.[1]?.targetDistanceMeters).toBe(500);
    expect(result.recommendedWorkout?.[1]?.targetReps).toBeUndefined();
  });

  it("backfills today's workout in planning phase when omitted, respecting completed keys & structural replacement", () => {
    const planAdvice: CoachingAdvice = {
      coachMessage: "Here is your plan.",
      trainingPlan: {
        cycleWeeks: 1,
        sessions: [
          {
            dayOfWeek: 3,
            weekNumber: 1,
            sessionLabel: "Day 2",
            focusDescription: "Chest",
            exercises: [{ exerciseName: "Bench Press", targetSets: 3, targetReps: "8" }],
          },
          {
            dayOfWeek: 1,
            weekNumber: 1,
            sessionLabel: "Day 1",
            focusDescription: "Legs",
            exercises: [{ exerciseName: "Squat", targetSets: 3, targetReps: "5" }],
          },
        ],
      },
    };

    const fromStart = postProcessCoachingAdvice(planAdvice, "planning", "none", new Set());
    expect(fromStart.recommendedWorkout?.[0]?.exerciseName).toBe("Squat");

    const nextInQueue = postProcessCoachingAdvice(
      planAdvice,
      "planning",
      "none",
      new Set(["W1-D1"]),
    );
    expect(nextInQueue.recommendedWorkout?.[0]?.exerciseName).toBe("Bench Press");

    const oldActivePlan: CoachActionRequestDto["activePlan"] = {
      createdAt: "2026-10-01T00:00:00.000Z",
      cycleWeeks: 1,
      currentWeekNumber: 1,
      sessions: [
        {
          dayOfWeek: 1,
          weekNumber: 1,
          sessionLabel: "Old",
          focusDescription: "Pull",
          exercises: [{ exerciseName: "Deadlift", targetSets: 3, targetReps: "5" }],
        },
      ],
    };
    const structuralReset = postProcessCoachingAdvice(
      planAdvice,
      "planning",
      "none",
      new Set(["W1-D1"]),
      oldActivePlan,
    );
    expect(structuralReset.recommendedWorkout?.[0]?.exerciseName).toBe("Squat");

    const explicitRest = postProcessCoachingAdvice(
      { ...planAdvice, recommendedWorkout: [] },
      "planning",
      "none",
    );
    expect(explicitRest.recommendedWorkout).toEqual([]);

    const midWorkout = postProcessCoachingAdvice(planAdvice, "mid-workout", "none");
    expect(midWorkout.recommendedWorkout).toBeUndefined();

    const collidingPlanAdvice: CoachingAdvice = {
      coachMessage: "Updated colliding sessions.",
      trainingPlan: {
        cycleWeeks: 1,
        sessions: [
          {
            dayOfWeek: 1,
            weekNumber: 1,
            sessionLabel: "Push",
            focusDescription: "Chest",
            exercises: [{ exerciseName: "Bench Press", targetSets: 3, targetReps: "8" }],
          },
          {
            // Collides with dayOfWeek: 1 -> normalized to W1-D2 cleanly
            dayOfWeek: 1,
            weekNumber: 1,
            sessionLabel: "Pull",
            focusDescription: "Back",
            exercises: [{ exerciseName: "Barbell Row", targetSets: 3, targetReps: "8" }],
          },
        ],
      },
    };
    const matchingActivePlan: CoachActionRequestDto["activePlan"] = {
      createdAt: "2026-11-01T00:00:00.000Z",
      cycleWeeks: 1,
      currentWeekNumber: 1,
      sessions: [
        {
          dayOfWeek: 1,
          weekNumber: 1,
          sessionLabel: "Push",
          focusDescription: "Chest",
          exercises: [{ exerciseName: "Bench Press", targetSets: 3, targetReps: "8" }],
        },
        {
          dayOfWeek: 2,
          weekNumber: 1,
          sessionLabel: "Pull",
          focusDescription: "Back",
          exercises: [{ exerciseName: "Barbell Row", targetSets: 3, targetReps: "8" }],
        },
      ],
    };

    const nextAfterCollisionShift = postProcessCoachingAdvice(
      collidingPlanAdvice,
      "planning",
      "none",
      new Set(["W1-D1"]),
      matchingActivePlan,
    );
    expect(nextAfterCollisionShift.recommendedWorkout?.[0]?.exerciseName).toBe("Barbell Row");

    const eightSessionWeekAdvice: CoachingAdvice = {
      coachMessage: "Overstuffed week capped cleanly.",
      trainingPlan: {
        cycleWeeks: 9,
        sessions: Array.from({ length: 8 }, (_, idx) => ({
          dayOfWeek: 1,
          weekNumber: 1,
          sessionLabel: `Day ${idx + 1}`,
          focusDescription: "Full Body",
          exercises: [{ exerciseName: `Exercise ${idx + 1}`, targetSets: 3, targetReps: "8" }],
        })),
      },
    };
    const capped = postProcessCoachingAdvice(eightSessionWeekAdvice, "planning", "none");
    expect(capped.recommendedWorkout?.[0]?.exerciseName).toBe("Exercise 1");
  });
});
