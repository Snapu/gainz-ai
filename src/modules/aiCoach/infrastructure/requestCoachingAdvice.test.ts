import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateTrainingInsights } from "@/modules/trainingInsights/domain";
import { assembleCoachingPrompt } from "../../../../supabase/functions/ai-coach/prompt";
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
    vi.useRealTimers();
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
        userProfile: {
          workoutDaysPerWeek: 3,
          workoutDurationMinutes: 45,
          fitnessGoal: ["build_muscle"],
        },
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
    expect(parsed.userProfile.workoutDurationMinutes).toBe(45);
    expect(parsed.insights.e1rm["Bench Press"]?.primaryMuscle).toBe("Chest");
    expect(parsed.insights.e1rm["Bench Press"]?.progressionIncrementKg).toBe(2.5);
    expect(parsed.previousMessages[0]?.content).toBe("Can I press heavier today?");
    expect(parsed.previousMessages[1]?.content).not.toContain("Secret model rationale");
    expect(parsed.previousMessages[1]?.content).not.toContain("trainingPlan");
  });

  it("groups multi-year trainingSummaries into at most 12 chronological months instead of slicing last 12 rows", () => {
    const now = new Date("2026-11-15T10:30:00.000Z");
    const summaries = [];

    // 14 distinct months spanning 2025-09 through 2026-10, 3 exercises each (42 rows > 12),
    // provided out of chronological order (2026 rows before 2025 rows).
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.UTC(2025, 8 + i, 1));
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1;
      for (const [exerciseName, sets] of [
        ["Bench Press", 18],
        ["Squat", 15],
        ["Deadlift", 9],
      ] as const) {
        summaries.push({
          year,
          month,
          workoutDays: 12,
          exerciseName,
          sets,
          totalReps: sets * 8,
          maxWeight: 100 + i,
          totalVolume: sets * 8 * (80 + i),
        });
      }
    }

    // Add >20 exercises in 2026-10 plus dirty rows to verify per-month cap and sanitization
    for (let j = 1; j <= 20; j++) {
      summaries.push({
        year: 2026,
        month: 10,
        workoutDays: 12,
        exerciseName: `Accessory ${j}`,
        sets: 1,
      });
    }
    summaries.push({
      year: 2026,
      month: 10,
      workoutDays: 99,
      exerciseName: "   ",
      sets: 5,
    });

    const dto = buildCoachActionRequestDto(
      createBaseRequest({ trainingSummaries: summaries }),
      {},
      now,
    );

    const parsed = coachActionRequestDtoSchema.parse(dto);
    expect(parsed.trainingSummaries).toHaveLength(12);
    expect(parsed.trainingSummaries.map((m) => `${m.year}-${m.month}`)).toEqual([
      "2025-11",
      "2025-12",
      "2026-1",
      "2026-2",
      "2026-3",
      "2026-4",
      "2026-5",
      "2026-6",
      "2026-7",
      "2026-8",
      "2026-9",
      "2026-10",
    ]);
    const latestMonth = parsed.trainingSummaries.at(-1);
    expect(latestMonth?.exercises).toHaveLength(20);
    expect(latestMonth?.exercises.slice(0, 3).map((e) => e.exerciseName)).toEqual([
      "Bench Press",
      "Squat",
      "Deadlift",
    ]);

    const prompt = assembleCoachingPrompt(parsed);
    expect(prompt).toContain("2025-11 (12d):");
    expect(prompt).toContain("2026-10 (12d):");
    expect(prompt).not.toContain("2025-09 (12d):");
    expect(prompt.indexOf("2025-11")).toBeLessThan(prompt.indexOf("2026-10"));
    expect(new TextEncoder().encode(JSON.stringify(parsed)).byteLength).toBeLessThan(100 * 1024);
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

  it("streams live SSE preview chunks across UTF-8/CRLF splits, completes advice, and learns muscle groups", async () => {
    const encoder = new TextEncoder();
    const rawSse =
      'event: preview\r\ndata: {"text":"Focus on "}\r\n\r\n' +
      'event: preview\ndata: {"text":"Focus on Progressive Overload 💪"}\n\n' +
      `event: complete\ndata: ${JSON.stringify({
        advice: {
          coachMessage: "Focus on Progressive Overload 💪",
          recommendedWorkout: [
            {
              exerciseName: "Incline DB Press",
              targetSets: 3,
              targetReps: "8-10",
              primaryMuscle: "Chest",
            },
          ],
        },
        quota: { currentCount: 2, dailyLimit: 15, resetAt: "2026-11-16T00:00:00.000Z" },
      })}\n\n`;

    const bytes = encoder.encode(rawSse);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // Split across multi-byte UTF-8 emoji and SSE frame boundaries
        controller.enqueue(bytes.slice(0, 22));
        controller.enqueue(bytes.slice(22, 68));
        controller.enqueue(bytes.slice(68, 120));
        controller.enqueue(bytes.slice(120));
        controller.close();
      },
    });

    fetchMock.mockResolvedValueOnce(
      new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      }),
    );

    const previews: string[] = [];
    const result = await requestCoachingAdvice(
      createBaseRequest({
        onStreamPreview: (text) => previews.push(text),
      }),
    );

    expect(previews).toEqual(["Focus on ", "Focus on Progressive Overload 💪"]);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.advice.coachMessage).toBe("Focus on Progressive Overload 💪");
    }
    expect(localStorage.getItem("exerciseMuscleMap")).toContain("Chest");
    expect(body.locked).toBe(false);
  });

  it("maps SSE event: error to coaching-request-server-error", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: preview\ndata: {"text":"Start"}\n\n'));
        controller.enqueue(
          encoder.encode('event: error\ndata: {"error":"coaching-request-failed"}\n\n'),
        );
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const previews: string[] = [];
    const result = await requestCoachingAdvice(
      createBaseRequest({
        onStreamPreview: (text) => previews.push(text),
      }),
    );

    expect(previews).toEqual(["Start"]);
    expect(result.isErr() && result.error).toBe("coaching-request-server-error");
    expect(body.locked).toBe(false);
  });

  it("maps unexpected SSE stream termination before complete to coaching-request-failed and releases lock", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: preview\ndata: {"text":"Halfway..."}\n\n'));
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const result = await requestCoachingAdvice(createBaseRequest());

    expect(result.isErr() && result.error).toBe("coaching-request-failed");
    expect(body.locked).toBe(false);
  });

  it("aborts stalled SSE stream on client timeout and releases reader lock", async () => {
    vi.useFakeTimers();
    let capturedBody: ReadableStream<Uint8Array> | null = null;
    fetchMock.mockImplementationOnce(async (_url: string, init?: RequestInit) => {
      capturedBody = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => {
            controller.error(new DOMException("Aborted", "AbortError"));
          });
        },
      });
      return new Response(capturedBody, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });

    const pending = requestCoachingAdvice(
      createBaseRequest({
        previousMessages: [
          {
            id: "m1",
            role: "user",
            content: "Warmup?",
            timestamp: "2026-11-15T10:00:00.000Z",
            sessionId: "2026-11-15",
            logsCount: 0,
          },
        ],
        mode: "execution",
      }),
    );

    await vi.advanceTimersByTimeAsync(65_100);
    const result = await pending;

    expect(result.isErr() && result.error).toBe("coaching-request-failed");
    expect(capturedBody).not.toBeNull();
    expect((capturedBody as ReadableStream<Uint8Array> | null)?.locked).toBe(false);
  });

  it("preserves isMetabolicProtocol on planned trainingPlan exercises through response parsing and DTO mapping", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        advice: {
          coachMessage: "Circuit week ready!",
          trainingPlan: {
            cycleWeeks: 1,
            sessions: [
              {
                dayOfWeek: 1,
                weekNumber: 1,
                sessionLabel: "Metabolic",
                focusDescription: "Conditioning",
                exercises: [
                  {
                    exerciseName: "Battle Ropes",
                    targetSets: 4,
                    targetDurationSeconds: 30,
                    isMetabolicProtocol: true,
                  },
                ],
              },
            ],
          },
        },
      }),
    });

    const result = await requestCoachingAdvice(createBaseRequest({ mode: "planning" }));
    expect(result.isOk()).toBe(true);
    if (result.isOk() && result.value.advice.trainingPlan) {
      expect(result.value.advice.trainingPlan.sessions[0]?.exercises[0]?.isMetabolicProtocol).toBe(
        true,
      );
      const savedPlan = TrainingPlan.create(
        "2026-11-15T10:00:00.000Z",
        result.value.advice.trainingPlan.cycleWeeks,
        result.value.advice.trainingPlan.sessions,
      );
      const roundTrippedDto = buildCoachActionRequestDto(
        createBaseRequest({
          mode: "execution",
          activePlan: savedPlan,
        }),
      );
      expect(roundTrippedDto.activePlan?.sessions[0]?.exercises[0]?.isMetabolicProtocol).toBe(true);
    }
  });

  it("maps malformed or truncated JSON inside an SSE frame cleanly to coaching-request-failed instead of throwing SyntaxError", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('event: preview\ndata: {"text":"Valid"}\n\n'));
          controller.enqueue(
            encoder.encode('event: complete\ndata: {"advice":{"coachMessage":"Cut\n\n'),
          );
          controller.close();
        },
      });
      fetchMock.mockResolvedValueOnce(
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );

      const result = await requestCoachingAdvice(createBaseRequest());
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("coaching-request-failed");
      }
      expect(consoleErrorSpy).toHaveBeenCalled();
      const loggedErr = consoleErrorSpy.mock.calls[0]?.[1];
      expect(loggedErr).toBeInstanceOf(Error);
      expect(loggedErr).not.toBeInstanceOf(SyntaxError);
      expect((loggedErr as Error).message).toBe("coaching-stream-incomplete");
      expect(body.locked).toBe(false);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("maps primitive or null JSON SSE payloads cleanly to coaching-request-failed instead of TypeError", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("event: preview\ndata: null\n\n"));
          controller.close();
        },
      });
      fetchMock.mockResolvedValueOnce(
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      );

      const result = await requestCoachingAdvice(createBaseRequest());
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("coaching-request-failed");
      }
      const loggedErr = consoleErrorSpy.mock.calls[0]?.[1];
      expect(loggedErr).toBeInstanceOf(Error);
      expect(loggedErr).not.toBeInstanceOf(TypeError);
      expect((loggedErr as Error).message).toBe("coaching-stream-incomplete");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("normalizes and caps userProfile.equipmentAccess in buildCoachActionRequestDto so custom equipment satisfies coachActionRequestDtoSchema", () => {
    const dto = buildCoachActionRequestDto(
      createBaseRequest({
        userProfile: {
          workoutDaysPerWeek: 4,
          fitnessGoal: ["build_muscle"],
          equipmentAccess: [
            "  Dumbbells  ",
            "  Smith   Machine ",
            "a",
            "smith machine",
            "Hack\nSquat",
            ...Array.from({ length: 35 }, (_, i) => `Custom ${i + 1}`),
          ],
        },
      }),
    );

    expect(dto.userProfile.equipmentAccess).toHaveLength(30);
    expect(dto.userProfile.equipmentAccess?.slice(0, 3)).toEqual([
      "dumbbells",
      "Smith Machine",
      "HackSquat",
    ]);
    expect(() => coachActionRequestDtoSchema.parse(dto)).not.toThrow();
  });

  it("maps HTTP 402 to payment-required without Sentry capture and emits updated entitlement", async () => {
    const entitlement = {
      source: "free_allowance" as const,
      canUseCoach: false,
      canUseClassify: true,
      evaluatedAt: "2026-11-26T12:00:00.000Z",
      freeAllowance: { coachUsed: 30, coachLimit: 30, classifyUsed: 10, classifyLimit: 40 },
      subscription: null,
      inviteGrant: null,
      hasCustomerPortal: false,
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "payment-required", entitlement }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const onEntitlementUpdate = vi.fn();

    const result = await requestCoachingAdvice(
      createBaseRequest({ question: "One more tip?", onEntitlementUpdate }),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("payment-required");
    }
    expect(onEntitlementUpdate).toHaveBeenCalledWith(entitlement);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("hydrates onEntitlementUpdate from HTTP 429 rate-limit-exceeded responses", async () => {
    const entitlement = {
      source: "free_allowance" as const,
      canUseCoach: true,
      canUseClassify: true,
      evaluatedAt: "2026-11-26T12:00:00.000Z",
      freeAllowance: { coachUsed: 5, coachLimit: 30, classifyUsed: 0, classifyLimit: 40 },
      subscription: null,
      inviteGrant: null,
      hasCustomerPortal: false,
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rate-limit-exceeded", entitlement }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const onEntitlementUpdate = vi.fn();

    const result = await requestCoachingAdvice(
      createBaseRequest({ question: "Daily limit check?", onEntitlementUpdate }),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("rate-limit-exceeded");
    }
    expect(onEntitlementUpdate).toHaveBeenCalledWith(entitlement);
  });

  it("hydrates piggybacked entitlement from completed SSE and recover responses", async () => {
    const entitlement = {
      source: "free_allowance" as const,
      canUseCoach: true,
      canUseClassify: true,
      evaluatedAt: "2026-11-26T12:01:00.000Z",
      freeAllowance: { coachUsed: 2, coachLimit: 30, classifyUsed: 0, classifyLimit: 40 },
      subscription: null,
      inviteGrant: null,
      hasCustomerPortal: false,
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        advice: { coachMessage: "Keep pushing!" },
        entitlement,
      }),
    });
    const onEntitlementUpdate = vi.fn();

    const coachRes = await requestCoachingAdvice(createBaseRequest({ onEntitlementUpdate }));
    expect(coachRes.isOk()).toBe(true);
    if (coachRes.isOk()) {
      expect(coachRes.value.entitlement).toEqual(entitlement);
    }
    expect(onEntitlementUpdate).toHaveBeenCalledWith(entitlement);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: "completed",
        advice: { coachMessage: "Recovered!" },
        entitlement,
      }),
    });
    const recoverRes = await recoverCoachingAdvice("req-1", "test-access-token");
    expect(recoverRes.isOk()).toBe(true);
    if (recoverRes.isOk() && recoverRes.value.status === "completed") {
      expect(recoverRes.value.entitlement).toEqual(entitlement);
    }
  });
});
