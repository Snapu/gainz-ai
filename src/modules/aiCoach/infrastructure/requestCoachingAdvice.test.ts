import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateTrainingInsights } from "@/modules/trainingInsights/domain";
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

import { requestCoachingAdvice } from "./requestCoachingAdvice";

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

  it("calls the Supabase ai-coach Edge Function and attaches thought to scratchpad if missing", async () => {
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

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        text: validPlanningJson,
        thought: "Planned 3 sets of Bench Press.",
      }),
    });

    const result = await requestCoachingAdvice(createBaseRequest());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/functions/v1/ai-coach");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-access-token");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.advice.scratchpad).toBe("Planned 3 sets of Bench Press.");
      expect(result.value.advice.trainingPlan?.sessions).toHaveLength(1);
    }
  });

  it("maps HTTP 429 from the Edge Function to rate-limit-exceeded", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: "rate-limit-exceeded" }),
    });

    const result = await requestCoachingAdvice(createBaseRequest());

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("rate-limit-exceeded");
    }
  });

  it("maps HTTP 401 from the Edge Function to unauthorized", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "unauthorized" }),
    });

    const result = await requestCoachingAdvice(createBaseRequest());

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("unauthorized");
    }
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
      ok: true,
      status: 200,
      json: async () => ({
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
      }),
    };

    fetchMock.mockResolvedValueOnce(mockPlanResponse).mockResolvedValueOnce(mockPlanResponse);

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
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        text: JSON.stringify({
          coachMessage: "Today's workout only",
          recommendedWorkout: [
            { exerciseName: "Squat", targetSets: 3, targetReps: "8", restSeconds: 120 },
          ],
        }),
      }),
    });

    const result = await requestCoachingAdvice(createBaseRequest({ mode: "planning" }));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("generate-content-stream-failed");
    }
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("compacts previous messages to user question and coachMessage, preventing char explosion", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        text: JSON.stringify({
          coachMessage: "Sure, leg press is a great alternative.",
          recommendedWorkout: [
            { exerciseName: "Leg Press", targetSets: 3, targetReps: "10-12", restSeconds: 90 },
          ],
        }),
      }),
    });

    const previousMessages = [
      {
        id: "msg-1",
        role: "user" as const,
        content:
          "# session\ndate: 2026-11-12\n# question\nCan I swap squat for leg press?\n# workload\n...",
        sessionId: "session-1",
        timestamp: new Date().toISOString(),
        logsCount: 0,
      },
      {
        id: "msg-2",
        role: "coach" as const,
        content: JSON.stringify({
          coachMessage: "Yes, leg press works well.",
          recommendedWorkout: [],
        }),
        sessionId: "session-1",
        timestamp: new Date().toISOString(),
        logsCount: 0,
      },
    ];

    await requestCoachingAdvice(
      createBaseRequest({
        previousMessages,
        question: "How heavy should I go?",
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestCallBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestCallBody.contents).toHaveLength(3);
    // User turn 1: only extracted question
    expect(requestCallBody.contents[0]).toEqual({
      role: "user",
      parts: [{ text: "Can I swap squat for leg press?" }],
    });
    // Model turn 1: extracted coachMessage
    expect(requestCallBody.contents[1]).toEqual({
      role: "model",
      parts: [{ text: "Yes, leg press works well." }],
    });
    // User turn 2: current fresh assembled prompt
    expect(requestCallBody.contents[2].role).toBe("user");
    expect(requestCallBody.contents[2].parts[0].text).toContain("How heavy should I go?");
  });

  it("caps conversation history to at most 40 total turns and 50,000 total characters", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        text: JSON.stringify({
          coachMessage: "Bounded history works.",
          recommendedWorkout: [],
        }),
      }),
    });

    const manyMessages = Array.from({ length: 46 }, (_, idx) => ({
      id: `msg-${idx}`,
      role: (idx % 2 === 0 ? "user" : "coach") as "user" | "coach",
      content:
        idx % 2 === 0
          ? `# question\nTurn ${idx} ${"x".repeat(2_000)}`
          : `Reply ${idx} ${"y".repeat(2_000)}`,
      sessionId: "session-1",
      timestamp: new Date().toISOString(),
      logsCount: 0,
    }));

    await requestCoachingAdvice(
      createBaseRequest({
        previousMessages: manyMessages,
        question: "Latest question",
      }),
    );

    const requestCallBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestCallBody.contents.length).toBeLessThanOrEqual(40);
    const totalChars = requestCallBody.contents.reduce(
      (sum: number, item: { parts: Array<{ text: string }> }) => sum + item.parts[0].text.length,
      0,
    );
    expect(totalChars).toBeLessThanOrEqual(50_000);
    expect(requestCallBody.contents[0].role).toBe("user");
    for (let i = 1; i < requestCallBody.contents.length; i++) {
      expect(requestCallBody.contents[i].role).not.toBe(requestCallBody.contents[i - 1].role);
    }
    expect(requestCallBody.contents.at(-1)?.parts[0].text).toContain("Latest question");
    expect(requestCallBody.contents.at(-2)?.parts[0].text).toContain("Reply 45");
    expect(requestCallBody.contents.at(-3)?.parts[0].text).toContain("Turn 44");
  });

  it("normalizes leading model turns and trailing unpaired user turns before sending", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        text: JSON.stringify({
          coachMessage: "Normalized turns.",
          recommendedWorkout: [],
        }),
      }),
    });

    await requestCoachingAdvice(
      createBaseRequest({
        previousMessages: [
          {
            id: "leading-model",
            role: "coach",
            content: "Orphan model intro",
            sessionId: "session-1",
            timestamp: new Date().toISOString(),
            logsCount: 0,
          },
          {
            id: "u1",
            role: "user",
            content: "# question\nValid user turn",
            sessionId: "session-1",
            timestamp: new Date().toISOString(),
            logsCount: 0,
          },
          {
            id: "m1",
            role: "coach",
            content: "Valid model reply",
            sessionId: "session-1",
            timestamp: new Date().toISOString(),
            logsCount: 0,
          },
          {
            id: "trailing-user",
            role: "user",
            content: "# question\nUnanswered trailing turn",
            sessionId: "session-1",
            timestamp: new Date().toISOString(),
            logsCount: 0,
          },
        ],
        question: "Current active turn",
      }),
    );

    const requestCallBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestCallBody.contents.map((item: { role: string }) => item.role)).toEqual([
      "user",
      "model",
      "user",
    ]);
    expect(requestCallBody.contents[0].parts[0].text).toContain("Valid user turn");
    expect(requestCallBody.contents[1].parts[0].text).toBe("Valid model reply");
    expect(requestCallBody.contents[2].parts[0].text).toContain("Current active turn");
  });
});
