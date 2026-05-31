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

  it("sorts compounds before isolations but keeps supersets grouped", () => {
    const responseWithSupersets: AiResponseData = {
      coachMessage: "Supersets",
      recommendedWorkout: [
        { exerciseName: "Leg Extension", targetSets: 3, targetReps: "10", supersetId: "sup1" }, // Isolation
        { exerciseName: "Squat", targetSets: 3, targetReps: "10", supersetId: "sup1" }, // Compound
        { exerciseName: "Bicep Curls", targetSets: 3, targetReps: "10" }, // Isolation
        { exerciseName: "Bench Press", targetSets: 3, targetReps: "10" }, // Compound
      ],
    };

    const result = postProcessAiResponse(responseWithSupersets, "planning", "none");
    const names = result.recommendedWorkout!.map((e) => e.exerciseName);

    // Since Leg Extension and Squat are in sup1, they get the best score (compound)
    // Thus sup1 and Bench Press should come before Bicep Curls.
    // The relative order of Leg Extension and Squat within sup1 should remain stable.
    expect(names.indexOf("Bench Press")).toBeLessThan(names.indexOf("Bicep Curls"));
    expect(names.indexOf("Leg Extension")).toBeLessThan(names.indexOf("Bicep Curls"));
    expect(names.indexOf("Squat")).toBeLessThan(names.indexOf("Bicep Curls"));

    // Ensure superset members are adjacent and in original relative order
    expect(names.indexOf("Leg Extension") + 1).toBe(names.indexOf("Squat"));
  });
});
