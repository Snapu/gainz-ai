import { describe, expect, it } from "vitest";
import type { CoachingAdvice } from "../domain/types";
import { postProcessCoachingAdvice } from "./postProcessCoachingAdvice";

describe("postProcessCoachingAdvice", () => {
  const baseResponse: CoachingAdvice = {
    coachMessage: "Here is your workout.",
    recommendedWorkout: [
      {
        exerciseName: "Bicep Curls", // Isolation
        targetSets: 3,
        targetReps: "10",
        restSeconds: 60,
      },
      {
        exerciseName: "Bench Press", // Upper compound
        targetSets: 3,
        targetReps: "5",
        restSeconds: 120, // Should be clamped up to 180
      },
      {
        exerciseName: "Squat", // Lower compound
        targetSets: 3,
        targetReps: "8-12",
        restSeconds: 200, // Should be clamped down to 180
      },
    ],
    startDeload: true,
  };

  it("removes recommendedWorkout during post-workout phase", () => {
    const result = postProcessCoachingAdvice(baseResponse, "post-workout", "none");
    expect(result.recommendedWorkout).toBeUndefined();
    expect(result.coachMessage).toBe("Here is your workout.");
  });

  it("removes startDeload when deload is active", () => {
    const result = postProcessCoachingAdvice(baseResponse, "planning", "active");
    expect(result.startDeload).toBeUndefined();
  });

  it("keeps startDeload when deload is not active", () => {
    const result = postProcessCoachingAdvice(baseResponse, "planning", "none");
    expect(result.startDeload).toBe(true);
  });

  it("clamps rest periods based on rep ranges", () => {
    const result = postProcessCoachingAdvice(baseResponse, "planning", "none");
    const workout = result.recommendedWorkout ?? [];

    // Bicep Curls (10 reps -> 120-180s)
    expect(workout.find((e) => e.exerciseName === "Bicep Curls")?.restSeconds).toBe(120);

    // Bench Press (5 reps -> 180-300s)
    expect(workout.find((e) => e.exerciseName === "Bench Press")?.restSeconds).toBe(180);

    // Squat (8-12 reps -> max 12 -> 120-180s)
    expect(workout.find((e) => e.exerciseName === "Squat")?.restSeconds).toBe(180);
  });

  it("does not clamp rest periods for metabolic protocols", () => {
    const responseWithMetabolic: CoachingAdvice = {
      ...baseResponse,
      recommendedWorkout: [
        {
          exerciseName: "Lateral Raises",
          targetSets: 1,
          targetReps: "15",
          restSeconds: 15,
          isMetabolicProtocol: true,
        },
      ],
    };
    const result = postProcessCoachingAdvice(responseWithMetabolic, "planning", "none");
    const workout = result.recommendedWorkout ?? [];
    expect(workout.find((e) => e.exerciseName === "Lateral Raises")?.restSeconds).toBe(15);
  });

  it("clamps rest periods for exercises in the training plan", () => {
    const responseWithPlan: CoachingAdvice = {
      ...baseResponse,
      trainingPlan: {
        cycleWeeks: 1,
        sessions: [
          {
            dayOfWeek: 1,
            weekNumber: 1,
            sessionLabel: "A",
            focusDescription: "Push",
            exercises: [
              {
                exerciseName: "Bicep Curls",
                targetSets: 3,
                targetReps: "10",
                restSeconds: 60, // should clamp up to 120
              },
              {
                exerciseName: "Bench Press",
                targetSets: 3,
                targetReps: "5",
                restSeconds: 120, // should clamp up to 180
              },
            ],
          },
        ],
      },
    };

    const result = postProcessCoachingAdvice(responseWithPlan, "planning", "none");
    const planExercises = result.trainingPlan?.sessions[0]?.exercises;

    expect(planExercises?.find((e) => e.exerciseName === "Bicep Curls")?.restSeconds).toBe(120);
    expect(planExercises?.find((e) => e.exerciseName === "Bench Press")?.restSeconds).toBe(180);
  });

  it("derives recommendedWorkout from the first planned session if omitted during planning phase", () => {
    const responseWithoutRecommendedWorkout: CoachingAdvice = {
      coachMessage: "New plan ready.",
      trainingPlan: {
        cycleWeeks: 2,
        sessions: [
          {
            dayOfWeek: 1,
            weekNumber: 1,
            sessionLabel: "Day 1",
            focusDescription: "Upper",
            exercises: [
              {
                exerciseName: "Bench Press",
                targetSets: 3,
                targetReps: "8",
                restSeconds: 120,
              },
            ],
          },
        ],
      },
    };

    const result = postProcessCoachingAdvice(responseWithoutRecommendedWorkout, "planning", "none");
    expect(result.recommendedWorkout).toHaveLength(1);
    expect(result.recommendedWorkout?.[0]?.exerciseName).toBe("Bench Press");

    const midWorkoutResult = postProcessCoachingAdvice(
      responseWithoutRecommendedWorkout,
      "mid-workout",
      "none",
    );
    expect(midWorkoutResult.recommendedWorkout).toBeUndefined();

    const explicitRestDayResult = postProcessCoachingAdvice(
      { ...responseWithoutRecommendedWorkout, recommendedWorkout: [] },
      "planning",
      "none",
    );
    expect(explicitRestDayResult.recommendedWorkout).toEqual([]);
  });

  it("normalizes and defaults targetRpe for resistance exercises", () => {
    const advice: CoachingAdvice = {
      ...baseResponse,
      recommendedWorkout: [
        {
          exerciseName: "Squat",
          targetSets: 3,
          targetReps: "5",
          // omitted targetRpe
        },
        {
          exerciseName: "Bench Press",
          targetSets: 3,
          targetReps: "8",
          targetRpe: 8.3, // rounds to 8.5
        },
        {
          exerciseName: "Plank",
          targetSets: 3,
          targetDurationSeconds: 60,
          // duration exercise should NOT get targetRpe
        },
      ],
      trainingPlan: {
        cycleWeeks: 1,
        sessions: [
          {
            dayOfWeek: 1,
            weekNumber: 1,
            sessionLabel: "Legs",
            focusDescription: "Quads",
            exercises: [
              {
                exerciseName: "Squat",
                targetSets: 3,
                targetReps: "5",
              },
            ],
          },
        ],
      },
    };

    const normalResult = postProcessCoachingAdvice(advice, "planning", "none");
    expect(normalResult.recommendedWorkout?.[0]?.targetRpe).toBe(8.5);
    expect(normalResult.recommendedWorkout?.[1]?.targetRpe).toBe(8.5);
    expect(normalResult.recommendedWorkout?.[2]?.targetRpe).toBeUndefined();
    expect(normalResult.trainingPlan?.sessions[0]?.exercises[0]?.targetRpe).toBe(8.5);

    const deloadResult = postProcessCoachingAdvice(advice, "planning", "active");
    expect(deloadResult.recommendedWorkout?.[0]?.targetRpe).toBe(6.5);
    expect(deloadResult.trainingPlan?.sessions[0]?.exercises[0]?.targetRpe).toBe(6.5);
  });

  it("backfills today's workout matching today's day of week when recommendedWorkout is omitted", () => {
    const adviceWithoutRecommended: CoachingAdvice = {
      coachMessage: "Here is your plan.",
      trainingPlan: {
        cycleWeeks: 1,
        sessions: [
          {
            dayOfWeek: 1, // Monday
            weekNumber: 1,
            sessionLabel: "Day 1 (Mon)",
            focusDescription: "Legs",
            exercises: [{ exerciseName: "Squat", targetSets: 3, targetReps: "5" }],
          },
          {
            dayOfWeek: 3, // Wednesday
            weekNumber: 1,
            sessionLabel: "Day 2 (Wed)",
            focusDescription: "Chest",
            exercises: [{ exerciseName: "Bench Press", targetSets: 3, targetReps: "8" }],
          },
        ],
      },
    };

    // Reference date is Wednesday (day 3)
    const wednesday = new Date("2026-01-07T12:00:00Z");
    const resultWed = postProcessCoachingAdvice(
      adviceWithoutRecommended,
      "planning",
      "none",
      wednesday,
    );
    expect(resultWed.recommendedWorkout?.[0]?.exerciseName).toBe("Bench Press");

    // Reference date on an unscheduled day (e.g. Tuesday = 2) falls back to sessions[0] (Monday)
    const tuesday = new Date("2026-01-06T12:00:00Z");
    const resultTue = postProcessCoachingAdvice(
      adviceWithoutRecommended,
      "planning",
      "none",
      tuesday,
    );
    expect(resultTue.recommendedWorkout?.[0]?.exerciseName).toBe("Squat");
  });
});
