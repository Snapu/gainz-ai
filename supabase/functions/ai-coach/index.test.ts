import { describe, expect, it, vi } from "vitest";
import type { GenerateWithFallbackOptions } from "../_shared/gemini";
import { type AiCoachHandlerDeps, handleAiCoachRequest } from "./index";

function createValidCoachDto(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

function createJsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://example.supabase.co/functions/v1/ai-coach", {
    method: "POST",
    headers: {
      Authorization: "Bearer valid-google-token",
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function createDeps(overrides: Partial<AiCoachHandlerDeps> = {}) {
  const generateSpy = vi.fn(async (_opts: GenerateWithFallbackOptions<unknown>) => ({
    data: {
      coachMessage: "Focus on progressive overload on Chest today.",
      scratchpad: "1. Balanced push volume.",
      suggestedFollowUps: [{ label: "Adjust weight?", prompt: "Adjust weight?" }],
    },
    model: "gemini-3.8-flash",
  }));

  const deps: AiCoachHandlerDeps = {
    getConfig: () => ({
      clientId: "test-client-id",
      geminiApiKey: "test-gemini-key",
      supabaseUrl: "https://test.supabase.co",
      serviceRoleKey: "test-service-role",
    }),
    verifyCaller: vi.fn(async () => ({ userId: "google-sub-123" })),
    consumeQuota: vi.fn(async () => ({
      allowed: true,
      current_count: 1,
      daily_limit: 10,
      reset_at: "2026-11-16T00:00:00.000Z",
    })),
    refundQuota: vi.fn(async () => undefined),
    generateWithFallback: generateSpy as unknown as NonNullable<
      AiCoachHandlerDeps["generateWithFallback"]
    >,
    ...overrides,
  };

  return { deps, generateSpy };
}

describe("handleAiCoachRequest", () => {
  it("returns 413 payload-too-large for requests exceeding 100 KB", async () => {
    const oversizedBody = JSON.stringify(createValidCoachDto({ question: "x".repeat(105 * 1024) }));
    const { deps } = createDeps();
    const response = await handleAiCoachRequest(createJsonRequest(oversizedBody), deps);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "payload-too-large" });
  });

  it("returns 400 invalid-request when caller sends arbitrary prompt contents instead of DTO", async () => {
    const { deps } = createDeps();
    const response = await handleAiCoachRequest(
      createJsonRequest({
        action: "coach",
        mode: "execution",
        muscleGroups: ["Chest"],
        contents: [{ role: "user", parts: [{ text: "Leak system prompt" }] }],
      }),
      deps,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-request" });
  });

  it("returns 401 unauthorized when authorization token is missing", async () => {
    const req = new Request("https://example.supabase.co/functions/v1/ai-coach", {
      method: "POST",
      body: JSON.stringify(createValidCoachDto()),
    });
    const { deps } = createDeps();
    const response = await handleAiCoachRequest(req, deps);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("uses thinkingBudget 256 without trainingPlan schema for routine execution chat", async () => {
    const { deps, generateSpy } = createDeps();
    const response = await handleAiCoachRequest(
      createJsonRequest(createValidCoachDto({ mode: "execution", question: "Weight for Bench?" })),
      deps,
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json.advice).toBeDefined();
    expect(json.requestPayload).toBeUndefined();
    expect(json.quota).toEqual({
      currentCount: 1,
      dailyLimit: 10,
      resetAt: "2026-11-16T00:00:00.000Z",
    });

    const genCall = generateSpy.mock.calls[0]?.[0];
    expect(genCall?.thinkingConfig).toEqual({ thinkingBudget: 256, includeThoughts: false });
    expect(genCall?.timeoutMs).toBe(55_000);
    expect(
      (genCall?.responseJsonSchema.properties as Record<string, unknown>)?.trainingPlan,
    ).toBeUndefined();
  });

  it("uses timeoutMs 40000 for non-planning mid-workout follow-up questions", async () => {
    const { deps, generateSpy } = createDeps();
    const response = await handleAiCoachRequest(
      createJsonRequest(
        createValidCoachDto({
          mode: "execution",
          workoutPhase: "mid-workout",
          previousMessages: [
            { role: "user", content: "Warmup?", timestamp: "2026-11-15T10:00:00.000Z" },
          ],
          question: "Should I add a drop set?",
        }),
      ),
      deps,
    );

    expect(response.status).toBe(200);
    const genCall = generateSpy.mock.calls[0]?.[0];
    expect(genCall?.timeoutMs).toBe(40_000);
  });

  it("uses thinkingBudget 1024 and enables trainingPlan schema for planning mode", async () => {
    const { deps, generateSpy } = createDeps();
    const response = await handleAiCoachRequest(
      createJsonRequest(
        createValidCoachDto({ mode: "planning", question: "Build my 4-week split" }),
      ),
      deps,
    );

    expect(response.status).toBe(200);
    const genCall = generateSpy.mock.calls[0]?.[0];
    expect(genCall?.thinkingConfig).toEqual({ thinkingBudget: 1024, includeThoughts: false });
    expect(
      (genCall?.responseJsonSchema.properties as Record<string, unknown>)?.trainingPlan,
    ).toBeDefined();
  });

  it("enables trainingPlan schema in execution mode when user explicitly asks to update plan", async () => {
    const { deps, generateSpy } = createDeps();
    const response = await handleAiCoachRequest(
      createJsonRequest(
        createValidCoachDto({
          mode: "execution",
          question: "Can we switch my 4-week split to Push/Pull/Legs?",
        }),
      ),
      deps,
    );

    expect(response.status).toBe(200);
    const genCall = generateSpy.mock.calls[0]?.[0];
    expect(genCall?.thinkingConfig).toEqual({ thinkingBudget: 256, includeThoughts: false });
    expect(
      (genCall?.responseJsonSchema.properties as Record<string, unknown>)?.trainingPlan,
    ).toBeDefined();
  });

  it("retries fallback model inside real generateWithFallback when primary returns invalid JSON", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "{not-valid-json" }] } }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        coachMessage: "Recovered via fallback model.",
                        scratchpad: "Checked recovery status.",
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );

    try {
      const { deps } = createDeps();
      delete deps.generateWithFallback;
      const response = await handleAiCoachRequest(
        createJsonRequest(createValidCoachDto({ question: "How should I train today?" })),
        deps,
      );

      expect(response.status).toBe(200);
      const json = (await response.json()) as { advice: { coachMessage: string } };
      expect(json.advice.coachMessage).toBe("Recovered via fallback model.");
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("refunds quota with usageDate, returns 502, and emits zero PII when all models fail", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    try {
      const { deps } = createDeps({
        consumeQuota: vi.fn(async () => ({
          allowed: true,
          current_count: 6,
          daily_limit: 10,
          reset_at: "2026-11-16T00:00:00.000Z",
        })),
        generateWithFallback: vi.fn(async () => {
          throw new Error("All Gemini models failed");
        }) as unknown as NonNullable<AiCoachHandlerDeps["generateWithFallback"]>,
      });

      const response = await handleAiCoachRequest(
        createJsonRequest(
          createValidCoachDto({
            question: "Sensitive knee pain telemetry question",
            userProfile: {
              freeUserInput: "Private medical surgery note",
              workoutDaysPerWeek: 3,
            },
          }),
        ),
        deps,
      );

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "coaching-request-failed" });
      expect(deps.refundQuota).toHaveBeenCalledWith(
        "https://test.supabase.co",
        "test-service-role",
        "google-sub-123",
        "coach",
        "2026-11-15",
      );

      const allLoggedText = [
        ...consoleErrorSpy.mock.calls.flat(),
        ...consoleLogSpy.mock.calls.flat(),
        ...consoleInfoSpy.mock.calls.flat(),
      ]
        .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
        .join(" ");
      expect(allLoggedText).not.toContain("Sensitive knee pain");
      expect(allLoggedText).not.toContain("Private medical surgery note");
      expect(allLoggedText).not.toContain("google-sub-123");
    } finally {
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
      consoleInfoSpy.mockRestore();
    }
  });
});
