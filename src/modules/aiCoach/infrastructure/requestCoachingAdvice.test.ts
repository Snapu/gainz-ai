import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateTrainingInsights } from "@/modules/trainingInsights/domain";
import { type CoachingAdviceRequest, TrainingPlan } from "../domain";

const { generateContentMock, captureMessageMock, captureExceptionMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
  captureMessageMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

const googleGenAiMock = vi.hoisted(() => ({
  GoogleGenAI: vi.fn(function GoogleGenAI() {
    return {
      models: {
        generateContent: generateContentMock,
      },
    };
  }),
}));

vi.mock("@google/genai", () => googleGenAiMock);
vi.mock("@sentry/vue", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: captureMessageMock,
  captureException: captureExceptionMock,
}));

import { requestCoachingAdvice } from "./requestCoachingAdvice";

function createBaseRequest(overrides: Partial<CoachingAdviceRequest> = {}): CoachingAdviceRequest {
  const insights = calculateTrainingInsights([]);

  return {
    apiKey: "test-api-key",
    userProfile: {
      workoutDaysPerWeek: 3,
      fitnessGoal: ["build_muscle"],
    },
    insights,
    exerciseLogs: [],
    trainingSummaries: [],
    previousMessages: [],
    events: [],
    ...overrides,
  };
}

describe("requestCoachingAdvice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("returns missing-api-key without calling the model when apiKey is empty", async () => {
    const result = await requestCoachingAdvice(createBaseRequest({ apiKey: "" }));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("missing-api-key");
    }
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "an empty response",
      primaryFailure: () =>
        generateContentMock.mockResolvedValueOnce({
          text: "   ",
          candidates: [{ finishReason: "MAX_TOKENS" }],
        }),
    },
    {
      label: "a 503 error",
      primaryFailure: () => generateContentMock.mockRejectedValueOnce({ status: 503 }),
    },
    {
      label: "a 429 rate-limit error",
      primaryFailure: () => generateContentMock.mockRejectedValueOnce({ status: 429 }),
    },
    {
      label: "a 404 error",
      primaryFailure: () => generateContentMock.mockRejectedValueOnce({ status: 404 }),
    },
  ])(
    "falls back from gemini-3.8-flash to gemini-2.5-flash on $label",
    async ({ primaryFailure }) => {
      const validPlanningJson = JSON.stringify({
        coachMessage: "Your new plan is ready!",
        recommendedWorkout: [
          {
            exerciseName: "Bench Press",
            targetSets: 3,
            targetReps: "8-10",
            restSeconds: 120,
            primaryMuscle: "Chest",
          },
        ],
        trainingPlan: {
          cycleWeeks: 2,
          sessions: [
            {
              dayOfWeek: 1,
              weekNumber: 1,
              sessionLabel: "Unit A",
              focusDescription: "Push",
              exercises: [
                {
                  exerciseName: "Bench Press",
                  targetSets: 3,
                  targetReps: "8-10",
                  restSeconds: 120,
                  primaryMuscle: "Chest",
                },
              ],
            },
          ],
        },
      });

      primaryFailure();
      generateContentMock.mockResolvedValueOnce({
        text: validPlanningJson,
        candidates: [
          {
            content: {
              parts: [{ thought: true, text: "Planned 3 sets of Bench Press." }],
            },
          },
        ],
      });

      const result = await requestCoachingAdvice(createBaseRequest());

      expect(googleGenAiMock.GoogleGenAI).toHaveBeenCalledWith({
        apiKey: "test-api-key",
        apiVersion: "v1beta",
      });
      expect(generateContentMock).toHaveBeenCalledTimes(2);
      expect(generateContentMock.mock.calls[0]?.[0]?.model).toBe("gemini-3.8-flash");
      expect(generateContentMock.mock.calls[1]?.[0]?.model).toBe("gemini-2.5-flash");
      expect(captureMessageMock).toHaveBeenCalledWith(
        expect.stringContaining("falling back to gemini-2.5-flash"),
        expect.anything(),
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.advice.scratchpad).toBe("Planned 3 sets of Bench Press.");
        expect(result.value.advice.trainingPlan?.sessions).toHaveLength(1);
      }
    },
  );

  it("falls back to gemini-3.5-flash-lite when both gemini-3.8-flash and gemini-2.5-flash are unavailable", async () => {
    const activePlan = TrainingPlan.create("2026-10-20T08:00:00.000Z", 2, [
      {
        dayOfWeek: 1,
        weekNumber: 1,
        sessionLabel: "Unit A",
        focusDescription: "Legs",
        exercises: [{ exerciseName: "Squat", targetSets: 3, targetReps: "5" }],
      },
    ]);

    generateContentMock
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          coachMessage: "Recovered via lite model!",
          recommendedWorkout: [
            { exerciseName: "Squat", targetSets: 3, targetReps: "5", restSeconds: 180 },
          ],
        }),
      });

    const result = await requestCoachingAdvice(
      createBaseRequest({ mode: "execution", activePlan }),
    );

    expect(generateContentMock).toHaveBeenCalledTimes(3);
    expect(generateContentMock.mock.calls.map((c) => c[0]?.model)).toEqual([
      "gemini-3.8-flash",
      "gemini-2.5-flash",
      "gemini-3.5-flash-lite",
    ]);
    expect(result.isOk()).toBe(true);
  });

  it("strips activePlan on explicit planning regeneration, but preserves # program when adjusting an existing plan via question", async () => {
    const existingPlan = TrainingPlan.create("2026-10-20T08:00:00.000Z", 2, [
      {
        dayOfWeek: 1,
        weekNumber: 1,
        sessionLabel: "Old Session",
        focusDescription: "Old",
        exercises: [{ exerciseName: "Squat", targetSets: 3, targetReps: "5" }],
      },
    ]);

    const mockPlanResponse = {
      text: JSON.stringify({
        coachMessage: "Rebuilt plan!",
        recommendedWorkout: [
          { exerciseName: "Deadlift", targetSets: 3, targetReps: "5", restSeconds: 180 },
        ],
        trainingPlan: {
          cycleWeeks: 2,
          sessions: [
            {
              dayOfWeek: 1,
              weekNumber: 1,
              sessionLabel: "New Session",
              focusDescription: "Pull",
              exercises: [
                { exerciseName: "Deadlift", targetSets: 3, targetReps: "5", restSeconds: 180 },
              ],
            },
          ],
        },
      }),
    };

    generateContentMock
      .mockResolvedValueOnce(mockPlanResponse)
      .mockResolvedValueOnce(mockPlanResponse);

    const explicitRegenResult = await requestCoachingAdvice(
      createBaseRequest({
        mode: "planning",
        activePlan: existingPlan,
        question: "Please generate a new 2-week mesocycle plan.",
      }),
    );

    expect(explicitRegenResult.isOk()).toBe(true);
    if (explicitRegenResult.isOk()) {
      expect(explicitRegenResult.value.requestPayload).not.toContain("# program");
      expect(explicitRegenResult.value.requestPayload).not.toContain("planStatus: active");
    }

    const adjustExistingPlanResult = await requestCoachingAdvice(
      createBaseRequest({
        mode: "execution",
        activePlan: existingPlan,
        question: "Please adjust my training plan for 3 days a week",
      }),
    );

    expect(adjustExistingPlanResult.isOk()).toBe(true);
    if (adjustExistingPlanResult.isOk()) {
      expect(adjustExistingPlanResult.value.requestPayload).toContain("# program");
      expect(adjustExistingPlanResult.value.requestPayload).toContain("planStatus: active");
    }
  });

  it("returns generate-content-stream-failed and captures Sentry once when planning response omits trainingPlan", async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        coachMessage: "Today's workout only",
        recommendedWorkout: [
          { exerciseName: "Squat", targetSets: 3, targetReps: "8", restSeconds: 120 },
        ],
      }),
    });

    const result = await requestCoachingAdvice(createBaseRequest({ mode: "planning" }));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("generate-content-stream-failed");
    }
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });
});
