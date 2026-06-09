import { describe, expect, it } from "vitest";
import { translateCoachingAdviceJson } from "./CoachingAdviceTranslator";

describe("CoachingAdviceTranslator", () => {
  it("successfully parses valid coaching advice", () => {
    const validJson = JSON.stringify({
      coachMessage: "Great job!",
      recommendedWorkout: [
        {
          exerciseName: "Squat",
          targetSets: 3,
          targetReps: "8-10",
        },
      ],
    });

    const result = translateCoachingAdviceJson(validJson);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.coachMessage).toBe("Great job!");
      expect(result.value.recommendedWorkout?.[0].exerciseName).toBe("Squat");
    }
  });

  it("returns invalid-json for completely malformed json string", () => {
    const result = translateCoachingAdviceJson("{ coachMessage: 'missing quotes' ");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("invalid-json");
    }
  });

  it("returns invalid-json if required fields are missing", () => {
    const missingMessageJson = JSON.stringify({
      scratchpad: "Thinking...",
      // coachMessage is missing
    });

    const result = translateCoachingAdviceJson(missingMessageJson);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("invalid-json");
    }
  });

  it("returns invalid-json if types are wrong", () => {
    const wrongTypeJson = JSON.stringify({
      coachMessage: "Hi",
      recommendedWorkout: [
        {
          exerciseName: "Squat",
          targetSets: "Three", // Should be number
          targetReps: "8-10",
        },
      ],
    });

    const result = translateCoachingAdviceJson(wrongTypeJson);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("invalid-json");
    }
  });
});
