import { describe, expect, it, vi } from "vitest";
import type { GenerateWithFallbackOptions } from "../_shared/gemini";
import { type AiCoachHandlerDeps, handleAiCoachRequest } from "./index";
import {
  type AiRequestResultRow,
  type AiRequestResultsStore,
  createSupabaseRequestResultsStore,
} from "./requestResults";

const VALID_UUID_V4 = "11111111-1111-4111-8111-111111111111";
const UUID_V1 = "11111111-1111-1111-8111-111111111111";

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

function createMockRequestResultsStore(initial: Record<string, AiRequestResultRow> = {}): {
  store: AiRequestResultsStore;
  rows: Map<string, AiRequestResultRow>;
} {
  const rows = new Map<string, AiRequestResultRow>(Object.entries(initial));
  const key = (userId: string, id: string) => `${userId}:${id}`;

  const store: AiRequestResultsStore = {
    getActive: vi.fn(
      async (userId, clientRequestId) => rows.get(key(userId, clientRequestId)) ?? null,
    ),
    claimTerminalResult: vi.fn(async (userId, clientRequestId) => {
      const k = key(userId, clientRequestId);
      const row = rows.get(k);
      if (!row || (row.status !== "completed" && row.status !== "failed")) return null;
      rows.delete(k);
      return row;
    }),
    acquireProcessingLock: vi.fn(async (userId, clientRequestId) => {
      const k = key(userId, clientRequestId);
      if (rows.has(k)) return "conflict";
      rows.set(k, { status: "processing", response_payload: null, error_code: null });
      return "acquired";
    }),
    markCompleted: vi.fn(async (userId, clientRequestId, responsePayload) => {
      rows.set(key(userId, clientRequestId), {
        status: "completed",
        response_payload: responsePayload,
        error_code: null,
      });
    }),
    markFailed: vi.fn(async (userId, clientRequestId, errorCode) => {
      rows.set(key(userId, clientRequestId), {
        status: "failed",
        response_payload: null,
        error_code: errorCode,
      });
    }),
    deleteEntry: vi.fn(async (userId, clientRequestId) => {
      rows.delete(key(userId, clientRequestId));
    }),
  };

  return { store, rows };
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
  const { store: defaultRequestResults } = createMockRequestResultsStore();

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
    requestResults: defaultRequestResults,
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

describe("ai-coach idempotency and request recovery", () => {
  it("rejects non-UUID-v4 clientRequestId on coach and recover actions with 400", async () => {
    const { deps } = createDeps();

    const badCoachRes = await handleAiCoachRequest(
      createJsonRequest(createValidCoachDto({ clientRequestId: UUID_V1 })),
      deps,
    );
    expect(badCoachRes.status).toBe(400);

    const badRecoverRes = await handleAiCoachRequest(
      createJsonRequest({ action: "recover", clientRequestId: "not-a-uuid" }),
      deps,
    );
    expect(badRecoverRes.status).toBe(400);
  });

  it("returns cached 200 payload on duplicate coach clientRequestId without calling quota or Gemini", async () => {
    const cachedPayload = {
      advice: { coachMessage: "Cached workout ready." },
      quota: { currentCount: 2, dailyLimit: 15, resetAt: "2026-11-16T00:00:00.000Z" },
    };
    const { store } = createMockRequestResultsStore({
      [`google-sub-123:${VALID_UUID_V4}`]: {
        status: "completed",
        response_payload: cachedPayload,
        error_code: null,
      },
    });
    const { deps, generateSpy } = createDeps({ requestResults: store });

    const res = await handleAiCoachRequest(
      createJsonRequest(createValidCoachDto({ clientRequestId: VALID_UUID_V4 })),
      deps,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(cachedPayload);
    expect(deps.consumeQuota).not.toHaveBeenCalled();
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it("returns 202 Accepted when clientRequestId is already processing or races on lock conflict", async () => {
    const { store } = createMockRequestResultsStore({
      [`google-sub-123:${VALID_UUID_V4}`]: {
        status: "processing",
        response_payload: null,
        error_code: null,
      },
    });
    const { deps, generateSpy } = createDeps({ requestResults: store });

    const res = await handleAiCoachRequest(
      createJsonRequest(createValidCoachDto({ clientRequestId: VALID_UUID_V4 })),
      deps,
    );

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: "processing" });
    expect(deps.consumeQuota).not.toHaveBeenCalled();
    expect(generateSpy).not.toHaveBeenCalled();

    // Simulate concurrent race: acquireProcessingLock returns conflict and getActive sees in-flight processing
    const racedStore = createMockRequestResultsStore().store;
    vi.mocked(racedStore.acquireProcessingLock).mockResolvedValueOnce("conflict");
    vi.mocked(racedStore.getActive).mockResolvedValueOnce({
      status: "processing",
      response_payload: null,
      error_code: null,
    });
    const { deps: raceDeps, generateSpy: raceGen } = createDeps({ requestResults: racedStore });

    const raceRes = await handleAiCoachRequest(
      createJsonRequest(createValidCoachDto({ clientRequestId: VALID_UUID_V4 })),
      raceDeps,
    );

    expect(raceRes.status).toBe(202);
    expect(raceDeps.consumeQuota).not.toHaveBeenCalled();
    expect(raceGen).not.toHaveBeenCalled();
  });

  it("deletes processing lock immediately when consumeQuota denies (429) or fails (500)", async () => {
    const { store: quotaDeniedStore, rows: deniedRows } = createMockRequestResultsStore();
    const { deps: deniedDeps } = createDeps({
      requestResults: quotaDeniedStore,
      consumeQuota: vi.fn(async () => ({
        allowed: false,
        current_count: 15,
        daily_limit: 15,
        reset_at: "2026-11-16T00:00:00.000Z",
      })),
    });

    const deniedRes = await handleAiCoachRequest(
      createJsonRequest(createValidCoachDto({ clientRequestId: VALID_UUID_V4 })),
      deniedDeps,
    );
    expect(deniedRes.status).toBe(429);
    expect(quotaDeniedStore.deleteEntry).toHaveBeenCalledWith("google-sub-123", VALID_UUID_V4);
    expect(deniedRows.size).toBe(0);

    const { store: rpcErrorStore, rows: errRows } = createMockRequestResultsStore();
    const { deps: rpcErrorDeps } = createDeps({
      requestResults: rpcErrorStore,
      consumeQuota: vi.fn(async () => null),
    });

    const errRes = await handleAiCoachRequest(
      createJsonRequest(createValidCoachDto({ clientRequestId: VALID_UUID_V4 })),
      rpcErrorDeps,
    );
    expect(errRes.status).toBe(500);
    expect(rpcErrorStore.deleteEntry).toHaveBeenCalledWith("google-sub-123", VALID_UUID_V4);
    expect(errRows.size).toBe(0);
  });

  it("stores only { advice, quota } without any input DTO fields on completion", async () => {
    const { store } = createMockRequestResultsStore();
    const { deps } = createDeps({ requestResults: store });

    const res = await handleAiCoachRequest(
      createJsonRequest(
        createValidCoachDto({
          clientRequestId: VALID_UUID_V4,
          question: "Sensitive injury question",
          userProfile: {
            freeUserInput: "Private medical note",
            workoutDaysPerWeek: 4,
          },
        }),
      ),
      deps,
    );

    expect(res.status).toBe(200);
    expect(store.markCompleted).toHaveBeenCalledTimes(1);
    const savedPayload = vi.mocked(store.markCompleted).mock.calls[0]?.[2] as Record<
      string,
      unknown
    >;
    expect(Object.keys(savedPayload).sort()).toEqual(["advice", "quota"]);
    const serialized = JSON.stringify(savedPayload);
    expect(serialized).not.toContain("Sensitive injury question");
    expect(serialized).not.toContain("Private medical note");
    expect(serialized).not.toContain("userProfile");
    expect(serialized).not.toContain("recentLogs");
  });

  it("transitions entry to failed and refunds quota when Gemini fails", async () => {
    const { store, rows } = createMockRequestResultsStore();
    const { deps } = createDeps({
      requestResults: store,
      generateWithFallback: vi.fn(async () => {
        throw new Error("Gemini timeout");
      }) as unknown as NonNullable<AiCoachHandlerDeps["generateWithFallback"]>,
    });

    const res = await handleAiCoachRequest(
      createJsonRequest(createValidCoachDto({ clientRequestId: VALID_UUID_V4 })),
      deps,
    );

    expect(res.status).toBe(502);
    expect(deps.refundQuota).toHaveBeenCalledTimes(1);
    expect(store.markFailed).toHaveBeenCalledWith(
      "google-sub-123",
      VALID_UUID_V4,
      "coaching-request-failed",
    );
    expect(rows.get(`google-sub-123:${VALID_UUID_V4}`)?.status).toBe("failed");
  });

  it("recovers completed result with delete-on-recovery, returns 202 while processing, 502 on failed, and 404 for unknown/other-user", async () => {
    const storedPayload = {
      advice: { coachMessage: "Recovered advice" },
      quota: { currentCount: 1, dailyLimit: 10, resetAt: "2026-11-16T00:00:00.000Z" },
    };
    const { store, rows } = createMockRequestResultsStore({
      [`google-sub-123:${VALID_UUID_V4}`]: {
        status: "completed",
        response_payload: storedPayload,
        error_code: null,
      },
      [`other-user:22222222-2222-4222-8222-222222222222`]: {
        status: "completed",
        response_payload: storedPayload,
        error_code: null,
      },
      [`google-sub-123:33333333-3333-4333-8333-333333333333`]: {
        status: "processing",
        response_payload: null,
        error_code: null,
      },
      [`google-sub-123:44444444-4444-4444-8444-444444444444`]: {
        status: "failed",
        response_payload: null,
        error_code: "coaching-request-failed",
      },
    });
    const { deps, generateSpy } = createDeps({ requestResults: store });

    // 1. Completed -> 200 and deleted
    const okRes = await handleAiCoachRequest(
      createJsonRequest({ action: "recover", clientRequestId: VALID_UUID_V4 }),
      deps,
    );
    expect(okRes.status).toBe(200);
    expect(await okRes.json()).toEqual({ status: "completed", ...storedPayload });
    expect(rows.has(`google-sub-123:${VALID_UUID_V4}`)).toBe(false);

    // 2. Second recover after delete -> 404
    const secondRes = await handleAiCoachRequest(
      createJsonRequest({ action: "recover", clientRequestId: VALID_UUID_V4 }),
      deps,
    );
    expect(secondRes.status).toBe(404);

    // 3. BOLA prevention: other user's ID -> generic 404
    const bolaRes = await handleAiCoachRequest(
      createJsonRequest({
        action: "recover",
        clientRequestId: "22222222-2222-4222-8222-222222222222",
      }),
      deps,
    );
    expect(bolaRes.status).toBe(404);
    expect(rows.has("other-user:22222222-2222-4222-8222-222222222222")).toBe(true);

    // 4. Processing -> 202 and preserved
    const procRes = await handleAiCoachRequest(
      createJsonRequest({
        action: "recover",
        clientRequestId: "33333333-3333-4333-8333-333333333333",
      }),
      deps,
    );
    expect(procRes.status).toBe(202);
    expect(await procRes.json()).toEqual({ status: "processing" });
    expect(rows.has("google-sub-123:33333333-3333-4333-8333-333333333333")).toBe(true);

    // 5. Failed -> 502 and deleted
    const failRes = await handleAiCoachRequest(
      createJsonRequest({
        action: "recover",
        clientRequestId: "44444444-4444-4444-8444-444444444444",
      }),
      deps,
    );
    expect(failRes.status).toBe(502);
    expect(await failRes.json()).toEqual({
      status: "failed",
      error: "coaching-request-failed",
    });
    expect(rows.has("google-sub-123:44444444-4444-4444-8444-444444444444")).toBe(false);

    expect(deps.consumeQuota).not.toHaveBeenCalled();
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it("uses single-shot POST lock on happy path and atomic DELETE returning for terminal recovery", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ client_request_id: VALID_UUID_V4 }]), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              status: "completed",
              response_payload: { advice: { coachMessage: "Hi" } },
              error_code: null,
            },
          ]),
          { status: 200 },
        ),
      );

    try {
      const store = createSupabaseRequestResultsStore("https://test.supabase.co", "svc-key");
      const active = await store.getActive("google-sub-123", VALID_UUID_V4);
      expect(active).toBeNull();
      const getUrl = String(fetchSpy.mock.calls[0]?.[0]);
      expect(getUrl).toContain("user_id=eq.google-sub-123");
      expect(getUrl).toContain(`client_request_id=eq.${VALID_UUID_V4}`);
      expect(getUrl).toContain("expires_at=gt.");

      const lock = await store.acquireProcessingLock("google-sub-123", VALID_UUID_V4);
      expect(lock).toBe("acquired");
      // Happy path acquires lock in a single POST call (no pre-lock DELETE/GET)
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[1]?.[1]?.method).toBe("POST");
      expect((fetchSpy.mock.calls[1]?.[1]?.headers as Record<string, string>)?.Prefer).toBe(
        "resolution=ignore-duplicates,return=representation",
      );

      const claimed = await store.claimTerminalResult("google-sub-123", VALID_UUID_V4);
      expect(claimed && claimed !== "error" ? claimed.status : null).toBe("completed");
      const deleteUrl = String(fetchSpy.mock.calls[2]?.[0]);
      expect(fetchSpy.mock.calls[2]?.[1]?.method).toBe("DELETE");
      expect(deleteUrl).toContain("status=in.(completed,failed)");
      expect(deleteUrl).toContain("expires_at=gt.");
      expect((fetchSpy.mock.calls[2]?.[1]?.headers as Record<string, string>)?.Prefer).toBe(
        "return=representation",
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("returns 503 recovery-check-failed on transient DB errors during recover instead of 404", async () => {
    const { store } = createMockRequestResultsStore();
    vi.mocked(store.claimTerminalResult).mockResolvedValueOnce("error");
    const { deps } = createDeps({ requestResults: store });

    const res = await handleAiCoachRequest(
      createJsonRequest({ action: "recover", clientRequestId: VALID_UUID_V4 }),
      deps,
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "recovery-check-failed" });
  });
});
