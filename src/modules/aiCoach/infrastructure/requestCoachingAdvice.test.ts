import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateTrainingInsights } from "@/modules/trainingInsights/domain";
import { coachActionRequestDtoSchema } from "../../../../supabase/functions/ai-coach/schemas";
import { type CoachingAdviceRequest, TrainingPlan } from "../domain";

const { captureMessageMock, captureExceptionMock } = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@sentry/vue", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: captureMessageMock,
  captureException: captureExceptionMock,
}));

import {
  buildCoachActionRequestDto,
  recoverCoachingAdvice,
  requestCoachingAdvice,
} from "./requestCoachingAdvice";

function createBaseRequest(overrides: Partial<CoachingAdviceRequest> = {}): CoachingAdviceRequest {
  const insights = calculateTrainingInsights([]);

  return {
    accessToken: "test-access-token",
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
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns unauthorized without calling the backend when accessToken is empty", async () => {
    const result = await requestCoachingAdvice(createBaseRequest({ accessToken: "" }));
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("unauthorized");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends structured CoachActionRequestDto without contents and parses { advice } response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        advice: {
          coachMessage: "Your new plan is ready!",
          scratchpad: "Balanced Chest and Quad volume.",
          recommendedWorkout: [
            {
              exerciseName: "Bench Press",
              targetSets: 3,
              targetReps: "8-10",
              restSeconds: 120,
              primaryMuscle: "Chest",
            },
          ],
          suggestedFollowUps: [{ label: "Swap Bench?", prompt: "Can we swap Bench Press?" }],
        },
        quota: { currentCount: 1, dailyLimit: 15, resetAt: "2026-11-16T00:00:00.000Z" },
      }),
    });

    const result = await requestCoachingAdvice(
      createBaseRequest({
        question: "What should I train today?",
      }),
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.advice.coachMessage).toBe("Your new plan is ready!");
      expect(result.value.advice.scratchpad).toBe("Balanced Chest and Quad volume.");
      expect(result.value.requestPayload).toBeUndefined();
    }

    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as Record<
      string,
      unknown
    >;
    expect(requestBody.action).toBe("coach");
    expect(requestBody.clientRequestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(requestBody.question).toBe("What should I train today?");
    expect(requestBody.contents).toBeUndefined();
    expect(() => coachActionRequestDtoSchema.parse(requestBody)).not.toThrow();
  });

  it("maps 401 and 429 HTTP responses to domain errors", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "unauthorized" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: "rate-limit-exceeded" }),
      });

    const unauthorizedResult = await requestCoachingAdvice(createBaseRequest());
    expect(unauthorizedResult.isErr() && unauthorizedResult.error).toBe("unauthorized");

    const rateLimitResult = await requestCoachingAdvice(createBaseRequest());
    expect(rateLimitResult.isErr() && rateLimitResult.error).toBe("rate-limit-exceeded");
  });

  it("returns generate-content-stream-failed when backend response breaks coach payload schema", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        advice: { coachMessage: "" },
      }),
    });

    const result = await requestCoachingAdvice(createBaseRequest());
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("generate-content-stream-failed");
    }
  });

  it("strips activePlan on planning mode, preserves pre-computed activePlan in execution mode", () => {
    const existingPlan = TrainingPlan.create("2026-11-01T08:00:00.000Z", 2, [
      {
        dayOfWeek: 1,
        weekNumber: 1,
        sessionLabel: "Day 1",
        focusDescription: "Squat",
        exercises: [{ exerciseName: "Squat", targetSets: 3, targetReps: "5" }],
      },
      {
        dayOfWeek: 3,
        weekNumber: 1,
        sessionLabel: "Day 2",
        focusDescription: "Bench",
        exercises: [{ exerciseName: "Bench Press", targetSets: 3, targetReps: "8" }],
      },
    ]);

    const planningDto = buildCoachActionRequestDto(
      createBaseRequest({
        mode: "planning",
        activePlan: existingPlan,
        completedSessionKeys: new Set(["W1-D1"]),
      }),
    );
    expect(planningDto.activePlan).toBeNull();
    expect(planningDto.completedSessionKeys).toEqual([]);

    const executionDto = buildCoachActionRequestDto(
      createBaseRequest({
        mode: "execution",
        activePlan: existingPlan,
        completedSessionKeys: new Set(["W1-D1"]),
      }),
      {},
      new Date("2026-11-10T10:00:00.000Z"),
    );
    expect(executionDto.activePlan).not.toBeNull();
    expect(executionDto.activePlan?.currentWeekNumber).toBe(2);
    expect(executionDto.activePlan?.nextUncompletedSessionKey).toBe("W1-D3");
    expect(executionDto.completedSessionKeys).toEqual(["W1-D1"]);
  });

  it("passes strict frontend DTO contract parity with backend coachActionRequestDtoSchema", () => {
    const now = new Date("2026-11-15T10:30:00.000Z");
    const logs = [
      {
        id: "log-1",
        exerciseName: "Bench Press",
        reps: 8,
        weight: 80,
        rpe: 8,
        loggedAt: new Date("2026-11-14T10:00:00.000Z"),
      },
    ];
    const insights = calculateTrainingInsights(logs);
    const plan = TrainingPlan.create("2026-11-08T08:00:00.000Z", 2, [
      {
        dayOfWeek: 1,
        weekNumber: 1,
        sessionLabel: "Push A",
        focusDescription: "Chest",
        exercises: [{ exerciseName: "Bench Press", targetSets: 3, targetReps: "8-10" }],
      },
    ]);

    const dto = buildCoachActionRequestDto(
      createBaseRequest({
        mode: "execution",
        insights,
        exerciseLogs: logs,
        activePlan: plan,
        completedSessionKeys: new Set(),
        events: [{ id: "e1", type: "travel", dates: ["2026-11-16"] }],
        previousMessages: [
          {
            id: "u1",
            role: "user",
            content: "# session\ndate: 2026-11-15\n# question\nCan I press heavier today?",
            sessionId: "s1",
            timestamp: "2026-11-15T09:00:00.000Z",
            logsCount: 0,
          },
          {
            id: "c1",
            role: "coach",
            content: JSON.stringify({
              coachMessage: "Yes, aim for 82.5kg.",
              scratchpad: "Secret model rationale",
              trainingPlan: { cycleWeeks: 2, sessions: [] },
              suggestedFollowUps: [{ label: "More", prompt: "Tell me more" }],
            }),
            sessionId: "s1",
            timestamp: "2026-11-15T09:01:00.000Z",
            logsCount: 0,
          },
        ],
        question: "Should I add incline dumbbell press?",
      }),
      {},
      now,
    );

    const parsed = coachActionRequestDtoSchema.parse(dto);
    expect(parsed.insights.e1rm["Bench Press"]?.primaryMuscle).toBe("Chest");
    expect(parsed.insights.e1rm["Bench Press"]?.progressionIncrementKg).toBe(2.5);
    expect(parsed.previousMessages[0]?.content).toBe("Can I press heavier today?");
    expect(parsed.previousMessages[1]?.content).not.toContain("Secret model rationale");
    expect(parsed.previousMessages[1]?.content).not.toContain("trainingPlan");
  });

  it("sanitizes out-of-range profile numbers, truncates long e1rm keys, and passes now into session resolution", () => {
    const now = new Date("2026-11-15T10:30:00.000Z");
    const longExerciseName = `Extremely Long Exercise Name ${"x".repeat(130)}`;
    const logs = [
      {
        id: "log-1",
        exerciseName: longExerciseName,
        reps: 10,
        weight: 50,
        rpe: 8,
        loggedAt: new Date("2026-11-15T10:15:00.000Z"),
      },
    ];
    const insights = calculateTrainingInsights(logs);

    const dto = buildCoachActionRequestDto(
      createBaseRequest({
        userProfile: {
          age: 250,
          heightCm: 20,
          weightKg: 999,
          workoutDaysPerWeek: 12,
          workoutDurationMinutes: 2,
        },
        insights,
        exerciseLogs: logs,
      }),
      {},
      now,
    );

    const parsed = coachActionRequestDtoSchema.parse(dto);
    expect(parsed.workoutPhase).toBe("mid-workout");
    expect(parsed.sessionStartBoundaryMs).toBe(Date.parse("2026-11-15T10:15:00.000Z"));
    expect(parsed.userProfile.age).toBeUndefined();
    expect(parsed.userProfile.heightCm).toBeUndefined();
    expect(parsed.userProfile.weightKg).toBeUndefined();
    expect(parsed.userProfile.workoutDaysPerWeek).toBeUndefined();
    expect(parsed.userProfile.workoutDurationMinutes).toBeUndefined();
    expect(Object.keys(parsed.insights.e1rm)[0]?.length).toBeLessThanOrEqual(120);
  });

  it("clamps and sanitizes out-of-range activePlan values so DTO validation never fails", () => {
    const now = new Date("2026-11-15T10:30:00.000Z");
    const dirtyPlan = {
      id: "plan-dirty",
      createdAt: "2026-11-01T00:00:00.000Z",
      cycleWeeks: 8,
      sessions: [
        {
          dayOfWeek: 7,
          weekNumber: 9,
          sessionLabel: "Upper A",
          focusDescription: "Strength",
          exercises: [
            { exerciseName: "   ", targetSets: 3 },
            {
              exerciseName: "Bench Press",
              targetSets: 40,
              targetDurationSeconds: 99999,
              targetDistanceMeters: 500000,
              targetRpe: 15,
              restSeconds: 999,
            },
          ],
        },
      ],
      getCurrentWeekNumber: () => 9,
      getNextUncompletedSession: () => undefined,
    } as unknown as CoachingAdviceRequest["activePlan"];

    const dto = buildCoachActionRequestDto(createBaseRequest({ activePlan: dirtyPlan }), {}, now);

    const parsed = coachActionRequestDtoSchema.parse(dto);
    expect(parsed.activePlan?.cycleWeeks).toBe(4);
    expect(parsed.activePlan?.currentWeekNumber).toBe(4);
    expect(parsed.activePlan?.sessions[0]?.dayOfWeek).toBe(0);
    expect(parsed.activePlan?.sessions[0]?.weekNumber).toBe(4);
    expect(parsed.activePlan?.sessions[0]?.exercises).toHaveLength(1);
    expect(parsed.activePlan?.sessions[0]?.exercises[0]?.targetSets).toBe(20);
    expect(parsed.activePlan?.sessions[0]?.exercises[0]?.restSeconds).toBe(600);
    expect(parsed.activePlan?.sessions[0]?.exercises[0]?.targetRpe).toBe(10);
  });

  it("recovers completed advice, persists learned muscle groups, and maps 202/404/502 responses", async () => {
    const clientRequestId = "11111111-1111-4111-8111-111111111111";

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => ({ status: "processing" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: "completed",
          advice: {
            coachMessage: "Recovered plan!",
            recommendedWorkout: [
              {
                exerciseName: "Cable Lateral Raise XYZ",
                targetSets: 3,
                targetReps: "12-15",
                primaryMuscle: "Side Delts",
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "not-found" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ status: "failed", error: "coaching-request-failed" }),
      });

    const processingRes = await recoverCoachingAdvice(clientRequestId, "token");
    expect(processingRes.isOk() && processingRes.value).toEqual({ status: "processing" });

    const completedRes = await recoverCoachingAdvice(clientRequestId, "token");
    expect(completedRes.isOk()).toBe(true);
    if (completedRes.isOk() && completedRes.value.status === "completed") {
      expect(completedRes.value.advice.coachMessage).toBe("Recovered plan!");
    }
    // Verify persistLearnedMuscleGroups persisted primaryMuscle from recovered response
    const storedMuscles = localStorage.getItem("exerciseMuscleMap");
    expect(storedMuscles).toContain("Side Delts");

    const notFoundRes = await recoverCoachingAdvice(clientRequestId, "token");
    expect(notFoundRes.isErr() && notFoundRes.error).toBe("not-found");

    const serverFailedRes = await recoverCoachingAdvice(clientRequestId, "token");
    expect(serverFailedRes.isErr() && serverFailedRes.error).toBe("server-failed");
  });
});
