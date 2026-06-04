import { describe, expect, it } from "vitest";
import type { AiResponseData } from "../domain/types";
import { postProcessAiResponse } from "./postProcessAiResponse";

describe("postProcessAiResponse", () => {
  const baseResponse: AiResponseData = {
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
    const result = postProcessAiResponse(baseResponse, "post-workout", "none");
    expect(result.recommendedWorkout).toBeUndefined();
    expect(result.coachMessage).toBe("Here is your workout.");
  });

  it("removes startDeload when deload is active", () => {
    const result = postProcessAiResponse(baseResponse, "planning", "active");
    expect(result.startDeload).toBeUndefined();
  });

  it("keeps startDeload when deload is not active", () => {
    const result = postProcessAiResponse(baseResponse, "planning", "none");
    expect(result.startDeload).toBe(true);
  });

  it("clamps rest periods based on rep ranges", () => {
    const result = postProcessAiResponse(baseResponse, "planning", "none");
    const workout = result.recommendedWorkout!;

    // Bicep Curls (10 reps -> 120-180s)
    expect(workout.find((e) => e.exerciseName === "Bicep Curls")?.restSeconds).toBe(120);

    // Bench Press (5 reps -> 180-300s)
    expect(workout.find((e) => e.exerciseName === "Bench Press")?.restSeconds).toBe(180);

    // Squat (8-12 reps -> max 12 -> 120-180s)
    expect(workout.find((e) => e.exerciseName === "Squat")?.restSeconds).toBe(180);
  });

  it("does not clamp rest periods for metabolic protocols", () => {
    const responseWithMetabolic: AiResponseData = {
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
    const result = postProcessAiResponse(responseWithMetabolic, "planning", "none");
    const workout = result.recommendedWorkout!;
    expect(workout.find((e) => e.exerciseName === "Lateral Raises")?.restSeconds).toBe(15);
  });

  it("clamps rest periods for exercises in the training plan", () => {
    const responseWithPlan: AiResponseData = {
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

    const result = postProcessAiResponse(responseWithPlan, "planning", "none");
    const planExercises = result.trainingPlan!.sessions[0]!.exercises;

    expect(planExercises.find((e) => e.exerciseName === "Bicep Curls")?.restSeconds).toBe(120);
    expect(planExercises.find((e) => e.exerciseName === "Bench Press")?.restSeconds).toBe(180);
  });
});
