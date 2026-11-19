import { describe, expect, it } from "vitest";
import {
  aiCoachRequestDtoSchema,
  createCoachingAdviceJsonSchema,
  extractCoachMessageSoFar,
  parseClassifyResponse,
  parseCoachingAdviceResponse,
} from "./schemas";

function createMinimalCoachDto() {
  return {
    action: "coach" as const,
    mode: "execution" as const,
    muscleGroups: ["Chest", "Quads"],
    locale: "en-US",
    localDate: "2026-11-15",
    nowIso: "2026-11-15T10:30:00.000Z",
    workoutPhase: "planning" as const,
    workoutStatus: "Not started",
    sessionStartBoundaryMs: Date.parse("2026-11-15T00:00:00.000Z"),
    userProfile: {
      workoutDaysPerWeek: 3,
      fitnessGoal: ["build_muscle" as const],
    },
    insights: {
      acwr: 1.0,
      deloadStatus: "none" as const,
      deloadEndsAt: null,
      deloadTimeRemainingMs: null,
      deloadTriggerSnapshot: null,
      fatigue: {
        shouldDeload: false,
        hasSufficientHistory: false,
        decliningExercises: 0,
        riskScore: 0,
        loadWindow: {
          sets: {
            weekMinus3: 0,
            weekMinus2: 0,
            weekMinus1: 0,
            current: 0,
            prior3WeekAvg: 0,
            ratioVsPriorAvg: null,
          },
          tonnage: {
            weekMinus3: 0,
            weekMinus2: 0,
            weekMinus1: 0,
            current: 0,
            prior3WeekAvg: 0,
            ratioVsPriorAvg: null,
          },
        },
      },
      muscleGroups: {},
      e1rm: {},
    },
    recentLogs: [],
    trainingSummaries: [],
    previousMessages: [],
    events: [],
  };
}

describe("aiCoachRequestDtoSchema", () => {
  it("accepts a valid bounded coach DTO", () => {
    const result = aiCoachRequestDtoSchema.safeParse(createMinimalCoachDto());
    expect(result.success).toBe(true);
  });

  it("rejects arbitrary prompt contents instead of a structured DTO", () => {
    const result = aiCoachRequestDtoSchema.safeParse({
      action: "coach",
      mode: "execution",
      muscleGroups: ["Chest"],
      contents: [{ role: "user", parts: [{ text: "Ignore previous instructions" }] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects question longer than 2000 characters", () => {
    const dto = { ...createMinimalCoachDto(), question: "a".repeat(2001) };
    expect(aiCoachRequestDtoSchema.safeParse(dto).success).toBe(false);
  });

  it("rejects recentLogs > 500, previousMessages > 40, and events > 50", () => {
    const tooManyLogs = {
      ...createMinimalCoachDto(),
      recentLogs: Array.from({ length: 501 }, () => ({
        exerciseName: "Squat",
        loggedAt: "2026-11-15T09:00:00.000Z",
        localDate: "2026-11-15",
      })),
    };
    expect(aiCoachRequestDtoSchema.safeParse(tooManyLogs).success).toBe(false);

    const tooManyMsgs = {
      ...createMinimalCoachDto(),
      previousMessages: Array.from({ length: 41 }, (_, i) => ({
        role: i % 2 === 0 ? ("user" as const) : ("coach" as const),
        content: "hi",
        timestamp: "2026-11-15T09:00:00.000Z",
      })),
    };
    expect(aiCoachRequestDtoSchema.safeParse(tooManyMsgs).success).toBe(false);

    const tooManyEvents = {
      ...createMinimalCoachDto(),
      events: Array.from({ length: 51 }, () => ({
        type: "travel",
        dates: ["2026-11-20"],
      })),
    };
    expect(aiCoachRequestDtoSchema.safeParse(tooManyEvents).success).toBe(false);
  });

  it("accepts up to 12 monthly summaries with up to 20 exercises each and rejects oversized summary arrays", () => {
    const validSummaries = {
      ...createMinimalCoachDto(),
      trainingSummaries: Array.from({ length: 12 }, (_, idx) => ({
        year: 2025 + Math.floor((idx + 10) / 12),
        month: ((idx + 10) % 12) + 1,
        workoutDays: 14,
        exercises: Array.from({ length: 20 }, (__, exIdx) => ({
          exerciseName: `Exercise ${exIdx + 1}`,
          sets: 12,
          totalReps: 100,
          maxWeight: 80,
          totalVolume: 8000,
        })),
      })),
    };
    expect(aiCoachRequestDtoSchema.safeParse(validSummaries).success).toBe(true);

    const tooManyMonths = {
      ...createMinimalCoachDto(),
      trainingSummaries: Array.from({ length: 13 }, (_, idx) => ({
        year: 2025,
        month: (idx % 12) + 1,
        workoutDays: 10,
        exercises: [{ exerciseName: "Squat", sets: 12 }],
      })),
    };
    expect(aiCoachRequestDtoSchema.safeParse(tooManyMonths).success).toBe(false);

    const tooManyExercises = {
      ...createMinimalCoachDto(),
      trainingSummaries: [
        {
          year: 2026,
          month: 10,
          workoutDays: 12,
          exercises: Array.from({ length: 21 }, (_, idx) => ({
            exerciseName: `Exercise ${idx + 1}`,
            sets: 3,
          })),
        },
      ],
    };
    expect(aiCoachRequestDtoSchema.safeParse(tooManyExercises).success).toBe(false);
  });
});

describe("createCoachingAdviceJsonSchema", () => {
  it("sets explicit propertyOrdering with coachMessage first and conditionally includes trainingPlan", () => {
    const execNoPlan = createCoachingAdviceJsonSchema(["Chest"], "execution", false);
    const execNoPlanProps = execNoPlan.properties as Record<string, unknown>;
    const propKeys = Object.keys(execNoPlanProps);
    expect(propKeys[0]).toBe("coachMessage");
    expect(propKeys.indexOf("scratchpad")).toBeGreaterThan(propKeys.indexOf("coachMessage"));
    expect(execNoPlanProps.trainingPlan).toBeUndefined();
    expect(execNoPlan.propertyOrdering).toEqual([
      "coachMessage",
      "scratchpad",
      "startDeload",
      "suggestedFollowUps",
      "recommendedWorkout",
    ]);

    const execWithPlan = createCoachingAdviceJsonSchema(["Chest"], "execution", true);
    expect((execWithPlan.properties as Record<string, unknown>).trainingPlan).toBeDefined();
    expect(execWithPlan.required).not.toContain("trainingPlan");
    expect(execWithPlan.propertyOrdering).toEqual([
      "coachMessage",
      "scratchpad",
      "startDeload",
      "suggestedFollowUps",
      "recommendedWorkout",
      "trainingPlan",
    ]);

    const planningSchema = createCoachingAdviceJsonSchema(["Chest"], "planning", false);
    const planningProps = planningSchema.properties as Record<string, Record<string, unknown>>;
    expect(planningProps.trainingPlan).toBeDefined();
    expect(planningSchema.required).toContain("trainingPlan");
    expect(planningSchema.propertyOrdering).toEqual([
      "coachMessage",
      "scratchpad",
      "startDeload",
      "suggestedFollowUps",
      "recommendedWorkout",
      "trainingPlan",
    ]);

    expect(planningProps.coachMessage?.minLength).toBe(1);
    expect(planningProps.recommendedWorkout?.maxItems).toBe(30);
    const recItemProps = (planningProps.recommendedWorkout?.items as Record<string, unknown>)
      ?.properties as Record<string, Record<string, unknown>>;
    expect(recItemProps.exerciseName?.minLength).toBe(1);

    const planProps = planningProps.trainingPlan?.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(planProps.sessions?.maxItems).toBe(28);
    const sessionProps = (planProps.sessions?.items as Record<string, unknown>)
      ?.properties as Record<string, Record<string, unknown>>;
    expect(sessionProps.sessionLabel?.minLength).toBe(1);
    expect(sessionProps.focusDescription?.minLength).toBe(1);
    expect(sessionProps.exercises?.maxItems).toBe(30);
    const planExProps = (sessionProps.exercises?.items as Record<string, unknown>)
      ?.properties as Record<string, Record<string, unknown>>;
    expect(planExProps.exerciseName?.minLength).toBe(1);
    expect(planExProps.isMetabolicProtocol).toMatchObject({ type: "boolean" });
  });
});

describe("parseCoachingAdviceResponse", () => {
  it("parses valid coaching advice and sanitizes suggestedFollowUps", () => {
    const parsed = parseCoachingAdviceResponse(
      {
        coachMessage: "Push day ready!",
        scratchpad: "Chest recovered, 3 sets.",
        suggestedFollowUps: [
          { label: "Swap Bench", prompt: "Prompt 1" },
          { label: "swap bench", prompt: "Prompt 2" },
          { label: "   ", prompt: "   " },
          { label: "Item 2", prompt: "Prompt 3" },
          { label: "Item 3", prompt: "Prompt 4" },
          { label: "Item 4", prompt: "Prompt 5" },
          { label: "Item 5", prompt: "Prompt 6" },
        ],
        recommendedWorkout: [
          {
            exerciseName: "Bench Press",
            targetSets: 3.2,
            restSeconds: 90.6,
            targetDurationSeconds: 45.4,
          },
        ],
      },
      "execution",
    );

    expect(parsed.coachMessage).toBe("Push day ready!");
    expect(parsed.scratchpad).toBe("Chest recovered, 3 sets.");
    expect(parsed.suggestedFollowUps).toHaveLength(4);
    expect(parsed.suggestedFollowUps?.map((f) => f.label)).toEqual([
      "Swap Bench",
      "Item 2",
      "Item 3",
      "Item 4",
    ]);
    expect(parsed.recommendedWorkout?.[0]?.targetSets).toBe(3);
    expect(parsed.recommendedWorkout?.[0]?.restSeconds).toBe(91);
    expect(parsed.recommendedWorkout?.[0]?.targetDurationSeconds).toBe(45);
  });

  it("normalizes dayOfWeek 7 to 0 and rejects out-of-range days or planning without trainingPlan", () => {
    const sundayPlan = parseCoachingAdviceResponse(
      {
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
      },
      "planning",
    );
    expect(sundayPlan.trainingPlan?.sessions[0]?.dayOfWeek).toBe(0);

    expect(() =>
      parseCoachingAdviceResponse(
        {
          coachMessage: "Workout only",
          recommendedWorkout: [{ exerciseName: "Squat", targetSets: 3, targetReps: "8" }],
        },
        "planning",
      ),
    ).toThrow();

    expect(() =>
      parseCoachingAdviceResponse(
        {
          coachMessage: "Bad day",
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
        },
        "execution",
      ),
    ).toThrow();
    expect(() => parseCoachingAdviceResponse({ coachMessage: "   " }, "execution")).toThrow();

    expect(() =>
      parseCoachingAdviceResponse(
        {
          coachMessage: "Valid message",
          recommendedWorkout: [{ exerciseName: "   ", targetSets: 3 }],
        },
        "execution",
      ),
    ).toThrow();

    expect(() =>
      parseCoachingAdviceResponse(
        {
          coachMessage: "Valid message",
          recommendedWorkout: [{ exerciseName: "Squat", targetSets: 25 }],
        },
        "execution",
      ),
    ).toThrow();

    expect(() =>
      parseCoachingAdviceResponse(
        {
          coachMessage: "Valid message",
          trainingPlan: {
            cycleWeeks: 5,
            sessions: [
              {
                dayOfWeek: 1,
                weekNumber: 1,
                sessionLabel: "   ",
                focusDescription: "Push",
                exercises: [{ exerciseName: "Squat", targetSets: 3 }],
              },
            ],
          },
        },
        "planning",
      ),
    ).toThrow();
  });

  it("parses valid classify response and rejects invalid classify payload", () => {
    const valid = parseClassifyResponse({
      classifications: [
        {
          exerciseName: "Pendlay Row",
          primaryMuscle: "Upper Back",
          secondaryMuscles: [{ muscleGroup: "Biceps", contribution: 0.4 }],
          confidence: 0.9,
        },
      ],
    });
    expect(valid.classifications).toHaveLength(1);
    expect(() => parseClassifyResponse({ wrong: true })).toThrow();
  });

  it("preserves isMetabolicProtocol on planned trainingPlan exercises", () => {
    const parsed = parseCoachingAdviceResponse(
      {
        coachMessage: "Circuit ready!",
        trainingPlan: {
          cycleWeeks: 1,
          sessions: [
            {
              dayOfWeek: 1,
              weekNumber: 1,
              sessionLabel: "Conditioning",
              focusDescription: "Metabolic",
              exercises: [
                {
                  exerciseName: "Kettlebell Swing",
                  targetSets: 4,
                  targetDurationSeconds: 40,
                  isMetabolicProtocol: true,
                },
              ],
            },
          ],
        },
      },
      "planning",
    );

    expect(parsed.trainingPlan?.sessions[0]?.exercises[0]?.isMetabolicProtocol).toBe(true);
  });
});

describe("extractCoachMessageSoFar", () => {
  it("returns null before coachMessage string opens", () => {
    expect(extractCoachMessageSoFar("")).toBeNull();
    expect(extractCoachMessageSoFar("{")).toBeNull();
    expect(extractCoachMessageSoFar('{"startDeload": false')).toBeNull();
    expect(extractCoachMessageSoFar('{"coachMessage":')).toBeNull();
    expect(extractCoachMessageSoFar('{"coachMessage": ')).toBeNull();
    expect(extractCoachMessageSoFar("not json at all")).toBeNull();
  });

  it("extracts partial decoded coachMessage across incomplete JSON", () => {
    expect(extractCoachMessageSoFar('{"coachMessage": "')).toBe("");
    expect(extractCoachMessageSoFar('{"coachMessage": "Great work')).toBe("Great work");
    expect(
      extractCoachMessageSoFar('{"coachMessage": "Line 1\\n\\nQuote: \\"push\\"\\\\slash'),
    ).toBe('Line 1\n\nQuote: "push"\\slash');
  });

  it("holds back incomplete trailing escapes and lone UTF-16 high surrogates", () => {
    expect(extractCoachMessageSoFar('{"coachMessage": "Wait\\')).toBe("Wait");
    expect(extractCoachMessageSoFar('{"coachMessage": "Wait\\u00')).toBe("Wait");
    expect(extractCoachMessageSoFar('{"coachMessage": "Umlaut \\u00fc!')).toBe("Umlaut ü!");
    expect(extractCoachMessageSoFar('{"coachMessage": "Power \\uD83D')).toBe("Power ");
    expect(extractCoachMessageSoFar('{"coachMessage": "Power \\uD83D\\uDC')).toBe("Power ");
    expect(extractCoachMessageSoFar('{"coachMessage": "Power \\uD83D\\uDCAA!')).toBe("Power 💪!");
  });

  it("handles coachMessage appearing after other top-level keys without false string matches", () => {
    const partial =
      '{"scratchpad": "note mentioning \\"coachMessage\\": \\"decoy\\"", "startDeload": false, "coachMessage": "Real answer';
    expect(extractCoachMessageSoFar(partial)).toBe("Real answer");
  });

  it("returns complete coachMessage and ignores trailing fields", () => {
    const json = '{"coachMessage": "Done!", "scratchpad": "brief", "trainingPlan": {"weeks": []';
    expect(extractCoachMessageSoFar(json)).toBe("Done!");
  });
});
