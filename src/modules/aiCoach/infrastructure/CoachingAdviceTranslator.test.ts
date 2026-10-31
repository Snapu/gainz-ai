import { describe, expect, it } from "vitest";
import {
  createCoachingAdviceJsonSchema,
  translateCoachingAdviceJson,
} from "./CoachingAdviceTranslator";

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

  it("successfully parses suggestedFollowUps in coaching advice", () => {
    const validJsonWithFollowUps = JSON.stringify({
      coachMessage: "Push day ready!",
      suggestedFollowUps: [
        { label: "Swap Bench Press", prompt: "Can we swap Bench Press for Dumbbells?" },
        { label: "Warmup Sets", prompt: "How should I structure warmup sets for Bench?" },
      ],
    });

    const result = translateCoachingAdviceJson(validJsonWithFollowUps);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.suggestedFollowUps).toHaveLength(2);
      expect(result.value.suggestedFollowUps?.[0].label).toBe("Swap Bench Press");
      expect(result.value.suggestedFollowUps?.[0].prompt).toBe(
        "Can we swap Bench Press for Dumbbells?",
      );
    }
  });

  it("handles null suggestedFollowUps gracefully without error", () => {
    const validJsonWithNullFollowUps = JSON.stringify({
      coachMessage: "Push day ready!",
      suggestedFollowUps: null,
    });

    const result = translateCoachingAdviceJson(validJsonWithNullFollowUps);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.suggestedFollowUps).toBeUndefined();
    }
  });

  it("handles non-array suggestedFollowUps (string, object, number) gracefully without error", () => {
    const jsonWithString = JSON.stringify({
      coachMessage: "Push day ready!",
      suggestedFollowUps: "none",
    });
    const resultString = translateCoachingAdviceJson(jsonWithString);
    expect(resultString.isOk()).toBe(true);
    if (resultString.isOk()) {
      expect(resultString.value.suggestedFollowUps).toBeUndefined();
    }

    const jsonWithObj = JSON.stringify({
      coachMessage: "Push day ready!",
      suggestedFollowUps: { text: "none" },
    });
    const resultObj = translateCoachingAdviceJson(jsonWithObj);
    expect(resultObj.isOk()).toBe(true);
    if (resultObj.isOk()) {
      expect(resultObj.value.suggestedFollowUps).toBeUndefined();
    }
  });

  it("gracefully filters out follow-ups with empty or whitespace-only labels or prompts", () => {
    const jsonWithFlawedFollowUps = JSON.stringify({
      coachMessage: "Push day ready!",
      suggestedFollowUps: [
        { label: "Valid Label", prompt: "Valid question" },
        { label: "   ", prompt: "   " },
      ],
    });

    const result = translateCoachingAdviceJson(jsonWithFlawedFollowUps);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.suggestedFollowUps).toEqual([
        { label: "Valid Label", prompt: "Valid question" },
      ]);
    }
  });

  it("sets suggestedFollowUps to undefined when all follow-ups are whitespace or invalid", () => {
    const invalidJson = JSON.stringify({
      coachMessage: "Push day ready!",
      suggestedFollowUps: [{ label: "   ", prompt: "   " }],
    });

    const result = translateCoachingAdviceJson(invalidJson);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.suggestedFollowUps).toBeUndefined();
    }
  });

  it("deduplicates follow-ups by label and caps at 4 items", () => {
    const json = JSON.stringify({
      coachMessage: "Push day ready!",
      suggestedFollowUps: [
        { label: "Swap Bench", prompt: "Prompt 1" },
        { label: "swap bench", prompt: "Prompt 2" },
        { label: "Item 2", prompt: "Prompt 3" },
        { label: "Item 3", prompt: "Prompt 4" },
        { label: "Item 4", prompt: "Prompt 5" },
        { label: "Item 5", prompt: "Prompt 6" },
      ],
    });

    const result = translateCoachingAdviceJson(json);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.suggestedFollowUps).toHaveLength(4);
      expect(result.value.suggestedFollowUps?.map((f) => f.label)).toEqual([
        "Swap Bench",
        "Item 2",
        "Item 3",
        "Item 4",
      ]);
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

  it("rejects responses in planning mode that omit trainingPlan", () => {
    const workoutOnlyJson = JSON.stringify({
      coachMessage: "Here is today's workout!",
      recommendedWorkout: [
        {
          exerciseName: "Bench Press",
          targetSets: 3,
          targetReps: "8-10",
        },
      ],
    });

    expect(translateCoachingAdviceJson(workoutOnlyJson, "execution").isOk()).toBe(true);
    expect(translateCoachingAdviceJson(workoutOnlyJson, "planning").isErr()).toBe(true);
  });

  it("marks trainingPlan and recommendedWorkout as required in planning JSON schema", () => {
    const planningSchema = createCoachingAdviceJsonSchema(["Chest", "Back"], "planning");
    expect(planningSchema.$schema).toBeUndefined();
    expect(planningSchema.required).toEqual(
      expect.arrayContaining([
        "coachMessage",
        "trainingPlan",
        "recommendedWorkout",
        "suggestedFollowUps",
      ]),
    );

    const executionSchema = createCoachingAdviceJsonSchema(["Chest", "Back"], "execution", false);
    expect(executionSchema.required).toEqual(
      expect.arrayContaining(["coachMessage", "suggestedFollowUps"]),
    );
    expect(
      (executionSchema.properties as Record<string, unknown> | undefined)?.trainingPlan,
    ).toBeUndefined();

    const chatExecutionSchema = createCoachingAdviceJsonSchema(
      ["Chest", "Back"],
      "execution",
      true,
    );
    expect(
      (chatExecutionSchema.properties as Record<string, unknown> | undefined)?.trainingPlan,
    ).toBeDefined();
    expect(chatExecutionSchema.required).toEqual(["coachMessage"]);
    expect(chatExecutionSchema.required).not.toContain("suggestedFollowUps");

    const recommendedProps = (
      (planningSchema.properties as Record<string, unknown>)?.recommendedWorkout as {
        items?: { properties?: Record<string, { description?: string }> };
      }
    )?.items?.properties;
    expect(recommendedProps?.restSeconds?.description).toContain(
      "Recommended rest between sets in seconds",
    );
  });

  it("rejects a trainingPlan where a session has empty exercises", () => {
    const emptyExercisesPlanJson = JSON.stringify({
      coachMessage: "New plan!",
      trainingPlan: {
        cycleWeeks: 2,
        sessions: [
          {
            dayOfWeek: 1,
            weekNumber: 1,
            sessionLabel: "Unit A",
            focusDescription: "Push",
            exercises: [],
          },
        ],
      },
    });

    expect(translateCoachingAdviceJson(emptyExercisesPlanJson, "planning").isErr()).toBe(true);
    expect(translateCoachingAdviceJson(emptyExercisesPlanJson, "execution").isErr()).toBe(true);
  });

  it("normalizes dayOfWeek: 7 (ISO Sunday) to 0 and rejects out-of-range integer values like dayOfWeek: 8 or targetSets: 0", () => {
    const isoSundayPlanJson = JSON.stringify({
      coachMessage: "New plan!",
      trainingPlan: {
        cycleWeeks: 2,
        sessions: [
          {
            dayOfWeek: 7,
            weekNumber: 1,
            sessionLabel: "Unit A",
            focusDescription: "Push",
            exercises: [{ exerciseName: "Squat", targetSets: 3, targetReps: "5" }],
          },
        ],
      },
    });
    const sundayResult = translateCoachingAdviceJson(isoSundayPlanJson, "planning");
    expect(sundayResult.isOk()).toBe(true);
    if (sundayResult.isOk()) {
      expect(sundayResult.value.trainingPlan?.sessions[0]?.dayOfWeek).toBe(0);
    }

    const outOfRangeDayJson = JSON.stringify({
      coachMessage: "New plan!",
      trainingPlan: {
        cycleWeeks: 2,
        sessions: [
          {
            dayOfWeek: 8,
            weekNumber: 1,
            sessionLabel: "Unit A",
            focusDescription: "Push",
            exercises: [{ exerciseName: "Squat", targetSets: 3, targetReps: "5" }],
          },
        ],
      },
    });
    expect(translateCoachingAdviceJson(outOfRangeDayJson, "planning").isErr()).toBe(true);

    const zeroSetsJson = JSON.stringify({
      coachMessage: "Workout",
      recommendedWorkout: [{ exerciseName: "Squat", targetSets: 0, targetReps: "5" }],
    });
    expect(translateCoachingAdviceJson(zeroSetsJson, "execution").isErr()).toBe(true);
  });

  it("rounds float values in integer fields instead of rejecting the payload", () => {
    const floatFieldsJson = JSON.stringify({
      coachMessage: "Solid session!",
      recommendedWorkout: [
        {
          exerciseName: "Bench Press",
          targetSets: 3.2,
          restSeconds: 90.6,
          targetDurationSeconds: 45.4,
        },
      ],
    });

    const result = translateCoachingAdviceJson(floatFieldsJson, "execution");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.recommendedWorkout?.[0]?.targetSets).toBe(3);
      expect(result.value.recommendedWorkout?.[0]?.restSeconds).toBe(91);
      expect(result.value.recommendedWorkout?.[0]?.targetDurationSeconds).toBe(45);
    }
  });
});
