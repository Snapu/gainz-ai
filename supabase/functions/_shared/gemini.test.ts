import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AttemptTokenUsage,
  buildGeminiRequestBody,
  generateWithFallback,
  NonRetryableModelError,
  RetryableModelError,
  streamWithFallback,
} from "./gemini";

function makeSseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

function makeChunkPayload(
  parts: Array<{ text?: string; thought?: boolean }>,
  finishReason?: string,
): string {
  return JSON.stringify({
    candidates: [
      {
        content: { parts },
        ...(finishReason ? { finishReason } : {}),
      },
    ],
  });
}

describe("streamWithFallback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("streams :streamGenerateContent?alt=sse, ignores thought parts, preserves inter-chunk whitespace, and parses final JSON", async () => {
    const encoder = new TextEncoder();
    const rawSse =
      `data: ${makeChunkPayload([{ text: "thinking...", thought: true }, { text: '{"coachMessage": "' }])}\r\n\r\n` +
      `data: ${makeChunkPayload([{ text: "Hello " }])}\n\n` +
      `data: ${makeChunkPayload([{ text: "athlete ü💪" }])}\n\n` +
      `data: ${makeChunkPayload([{ text: '"}' }], "STOP")}\n\n`;

    // Split arbitrarily inside UTF-8 bytes and CRLF boundaries
    const bytes = encoder.encode(rawSse);
    const splitPoints = [15, 62, 120, 175];
    const byteChunks: Uint8Array[] = [];
    let prev = 0;
    for (const pt of splitPoints) {
      byteChunks.push(bytes.slice(prev, pt));
      prev = pt;
    }
    byteChunks.push(bytes.slice(prev));

    const fetchMock = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (const c of byteChunks) controller.enqueue(c);
              controller.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const seen: string[] = [];
    const result = await streamWithFallback({
      geminiApiKey: "test-key",
      models: ["gemini-3.8-flash", "gemini-2.5-flash"],
      contents: [{ role: "user", parts: [{ text: "Hi" }] }],
      responseJsonSchema: { type: "object" },
      temperature: 0.4,
      timeoutMs: 10_000,
      onAccumulatedText: (text) => {
        seen.push(text);
        return text.includes("Hello ");
      },
      parseResponse: (json) => json as { coachMessage: string },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = (fetchMock.mock.calls[0] as unknown[])[0];
    expect(calledUrl).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse",
    );
    expect(seen).toEqual([
      '{"coachMessage": "',
      '{"coachMessage": "Hello ',
      '{"coachMessage": "Hello athlete ü💪',
      '{"coachMessage": "Hello athlete ü💪"}',
    ]);
    expect(result).toEqual({
      data: { coachMessage: "Hello athlete ü💪" },
      model: "gemini-3.8-flash",
    });
  });

  it("retries fallback model on pre-commit 429 or mid-stream error before preview commit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limit", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          makeSseStream([
            `data: ${makeChunkPayload([{ text: '{"coachMessage": "Recovered' }])}\n\n`,
            `data: ${makeChunkPayload([{ text: '"}' }], "STOP")}\n\n`,
          ]),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await streamWithFallback({
      geminiApiKey: "test-key",
      models: ["gemini-3.8-flash", "gemini-2.5-flash"],
      contents: [{ role: "user", parts: [{ text: "Hi" }] }],
      responseJsonSchema: { type: "object" },
      temperature: 0.4,
      timeoutMs: 10_000,
      parseResponse: (json) => json as { coachMessage: string },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.model).toBe("gemini-2.5-flash");
    expect(result.data.coachMessage).toBe("Recovered");
  });

  it("does NOT retry fallback model once caller commits to stream via onAccumulatedText returning true", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          makeSseStream([
            `data: ${makeChunkPayload([{ text: '{"coachMessage": "Partial preview' }])}\n\n`,
            // Truncated JSON without STOP or closing quote
          ]),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      streamWithFallback({
        geminiApiKey: "test-key",
        models: ["gemini-3.8-flash", "gemini-2.5-flash"],
        contents: [{ role: "user", parts: [{ text: "Hi" }] }],
        responseJsonSchema: { type: "object" },
        temperature: 0.4,
        timeoutMs: 10_000,
        onAccumulatedText: () => true,
        parseResponse: (json) => json,
      }),
    ).rejects.toThrow(RetryableModelError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry fallback on 400 NonRetryableModelError", async () => {
    const fetchMock = vi.fn(async () => new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      streamWithFallback({
        geminiApiKey: "test-key",
        models: ["gemini-3.8-flash", "gemini-2.5-flash"],
        contents: [{ role: "user", parts: [{ text: "Hi" }] }],
        responseJsonSchema: { type: "object" },
        temperature: 0.4,
        timeoutMs: 10_000,
        parseResponse: (json) => json,
      }),
    ).rejects.toThrow(NonRetryableModelError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects non-STOP finishReason such as MAX_TOKENS", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          makeSseStream([
            `data: ${makeChunkPayload([{ text: '{"coachMessage": "Cut off"}' }], "MAX_TOKENS")}\n\n`,
          ]),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      streamWithFallback({
        geminiApiKey: "test-key",
        models: ["gemini-3.8-flash"],
        contents: [{ role: "user", parts: [{ text: "Hi" }] }],
        responseJsonSchema: { type: "object" },
        temperature: 0.4,
        timeoutMs: 10_000,
        parseResponse: (json) => json,
      }),
    ).rejects.toThrow("finish-MAX_TOKENS");
  });

  it("enforces AbortController timeout and releases stream reader lock in finally", async () => {
    vi.useFakeTimers();
    let capturedBody: ReadableStream<Uint8Array> | null = null;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => {
            controller.error(new DOMException("Aborted", "AbortError"));
          });
        },
      });
      return new Response(capturedBody, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = expect(
      streamWithFallback({
        geminiApiKey: "test-key",
        models: ["gemini-3.8-flash"],
        contents: [{ role: "user", parts: [{ text: "Hi" }] }],
        responseJsonSchema: { type: "object" },
        temperature: 0.4,
        timeoutMs: 5_000,
        parseResponse: (json) => json,
      }),
    ).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(5_100);
    await pending;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(capturedBody).not.toBeNull();
    expect((capturedBody as ReadableStream<Uint8Array> | null)?.locked).toBe(false);
  });

  it("extends timeout budget to full deadlineMs once primary attempt commits", async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    let capturedSignal: AbortSignal | null | undefined;

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => {
            controller.error(new DOMException("Aborted", "AbortError"));
          });
          setTimeout(() => {
            if (init?.signal?.aborted) return;
            controller.enqueue(
              encoder.encode(
                `data: ${makeChunkPayload([{ text: '{"coachMessage": "Started' }])}\n\n`,
              ),
            );
          }, 1_000);
          // Beyond 55% of 55_000ms (30_250ms), well within full 55_000ms deadline
          setTimeout(() => {
            if (init?.signal?.aborted) return;
            controller.enqueue(
              encoder.encode(`data: ${makeChunkPayload([{ text: '"}' }], "STOP")}\n\n`),
            );
            controller.close();
          }, 40_000);
        },
      });
      return new Response(body, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const promise = streamWithFallback({
      geminiApiKey: "test-key",
      models: ["gemini-3.8-flash", "gemini-2.5-flash"],
      contents: [{ role: "user", parts: [{ text: "Hi" }] }],
      responseJsonSchema: { type: "object" },
      temperature: 0.4,
      timeoutMs: 55_000,
      onAccumulatedText: () => true,
      parseResponse: (json) => json,
    });

    await vi.advanceTimersByTimeAsync(40_100);
    const result = await promise;

    expect(result).toEqual({
      data: { coachMessage: "Started" },
      model: "gemini-3.8-flash",
    });
    expect(capturedSignal?.aborted).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still aborts a committed stream once the full deadlineMs elapses", async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    let capturedSignal: AbortSignal | null | undefined;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => {
            controller.error(new DOMException("Aborted", "AbortError"));
          });
          setTimeout(() => {
            if (init?.signal?.aborted) return;
            controller.enqueue(
              encoder.encode(`data: ${makeChunkPayload([{ text: '{"coachMessage": "Slow' }])}\n\n`),
            );
          }, 1_000);
        },
      });
      return new Response(body, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = expect(
      streamWithFallback({
        geminiApiKey: "test-key",
        models: ["gemini-3.8-flash", "gemini-2.5-flash"],
        contents: [{ role: "user", parts: [{ text: "Hi" }] }],
        responseJsonSchema: { type: "object" },
        temperature: 0.4,
        timeoutMs: 10_000,
        onAccumulatedText: () => true,
        parseResponse: (json) => json,
      }),
    ).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(6_000);
    expect(capturedSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(4_200);
    expect(capturedSignal?.aborted).toBe(true);
    await pending;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels upstream reader before releasing lock when parseGeminiSseChunk throws mid-stream", async () => {
    const encoder = new TextEncoder();
    const cancelSpy = vi.fn();
    let capturedBody: ReadableStream<Uint8Array> | null = null;

    const fetchMock = vi.fn(async () => {
      capturedBody = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${makeChunkPayload([{ text: '{"coachMessage": "Cut off"}' }], "MAX_TOKENS")}\n\n`,
            ),
          );
          // Leave stream open (like an unclosed SSE response) when mid-stream error triggers
        },
        cancel() {
          cancelSpy();
        },
      });
      return new Response(capturedBody, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      streamWithFallback({
        geminiApiKey: "test-key",
        models: ["gemini-3.8-flash"],
        contents: [{ role: "user", parts: [{ text: "Hi" }] }],
        responseJsonSchema: { type: "object" },
        temperature: 0.4,
        timeoutMs: 10_000,
        parseResponse: (json) => json,
      }),
    ).rejects.toThrow("finish-MAX_TOKENS");

    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect((capturedBody as ReadableStream<Uint8Array> | null)?.locked).toBe(false);
  });

  it("sends model-specific thinkingConfig (thinkingLevel on Gemini 3, thinkingBudget on Gemini 2.5)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limit", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          makeSseStream([
            `data: ${makeChunkPayload([{ text: '{"coachMessage": "Recovered"}' }], "STOP")}\n\n`,
          ]),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await streamWithFallback({
      geminiApiKey: "test-key",
      models: ["gemini-3.8-flash", "gemini-2.5-flash"],
      contents: [{ role: "user", parts: [{ text: "Hi" }] }],
      responseJsonSchema: { type: "object" },
      temperature: 0.4,
      topP: 0.9,
      timeoutMs: 10_000,
      thinkingConfig: { level: "minimal", includeThoughts: false },
      parseResponse: (json) => json,
    });

    const gemini3Body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      generationConfig: Record<string, unknown>;
    };
    const gemini25Body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      generationConfig: Record<string, unknown>;
    };

    // gemini-3.8-flash clamps unsupported "minimal" to "LOW", omits legacy sampling params, and never sends thinkingBudget
    expect(gemini3Body.generationConfig.thinkingConfig).toEqual({
      thinkingLevel: "LOW",
      includeThoughts: false,
    });
    expect(gemini3Body.generationConfig.temperature).toBeUndefined();
    expect(gemini3Body.generationConfig.topP).toBeUndefined();

    // gemini-2.5-flash uses integer thinkingBudget and keeps temperature/topP
    expect(gemini25Body.generationConfig.thinkingConfig).toEqual({
      thinkingBudget: 0,
      includeThoughts: false,
    });
    expect(gemini25Body.generationConfig.temperature).toBe(0.4);
    expect(gemini25Body.generationConfig.topP).toBe(0.9);
  });

  it("logs sanitized upstream error message on 4xx responses", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              status: "INVALID_ARGUMENT",
              message: "Invalid value at\n'generation_config.temperature'",
            },
          }),
          { status: 400 },
        ),
      ),
    );

    await expect(
      streamWithFallback({
        geminiApiKey: "test-key",
        models: ["gemini-3.5-flash-lite"],
        contents: [{ role: "user", parts: [{ text: "Hi" }] }],
        responseJsonSchema: { type: "object" },
        temperature: 0.7,
        timeoutMs: 10_000,
        parseResponse: (json) => json,
      }),
    ).rejects.toBeInstanceOf(NonRetryableModelError);

    expect(warnSpy).toHaveBeenCalledWith(
      "[gemini] model=gemini-3.5-flash-lite status=400 code=INVALID_ARGUMENT msg=Invalid value at 'generation_config.temperature'",
    );
  });

  it("extends timeout budget to deadlineMs on answer progress even when onAccumulatedText returns false, and still allows pre-commit fallback", async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    let firstAttemptSignal: AbortSignal | null | undefined;
    let attemptCount = 0;

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      attemptCount++;
      if (attemptCount === 1) {
        firstAttemptSignal = init?.signal;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            init?.signal?.addEventListener("abort", () => {
              controller.error(new DOMException("Aborted", "AbortError"));
            });
            setTimeout(() => {
              if (init?.signal?.aborted) return;
              controller.enqueue(
                encoder.encode(
                  `data: ${makeChunkPayload([{ text: '{"coachMessage": "Background' }])}\n\n`,
                ),
              );
            }, 1_000);
            // Fails past 55% (30.25s) cleanly after progress started -> triggers fallback before deadline
            setTimeout(() => {
              if (init?.signal?.aborted) return;
              controller.close();
            }, 35_000);
          },
        });
        return new Response(body, { status: 200 });
      }
      return new Response(
        makeSseStream([
          `data: ${makeChunkPayload([{ text: '{"coachMessage": "Fallback ok"}' }], "STOP")}\n\n`,
        ]),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const promise = streamWithFallback({
      geminiApiKey: "test-key",
      models: ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
      contents: [{ role: "user", parts: [{ text: "Hi" }] }],
      responseJsonSchema: { type: "object" },
      temperature: 0.4,
      timeoutMs: 55_000,
      // Simulates disconnected client where SSE emit returns false
      onAccumulatedText: () => false,
      parseResponse: (json) => json,
    });

    await vi.advanceTimersByTimeAsync(36_000);
    const result = await promise;

    expect(firstAttemptSignal?.aborted).toBe(false);
    expect(attemptCount).toBe(2);
    expect(result).toEqual({
      data: { coachMessage: "Fallback ok" },
      model: "gemini-3.5-flash-lite",
    });
  });

  it("does not extend primary attempt timeout when stream emits only whitespace chunks", async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    const encoder = new TextEncoder();

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        capturedSignal = init?.signal ?? undefined;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            init?.signal?.addEventListener("abort", () => {
              controller.error(new DOMException("Aborted", "AbortError"));
            });
            setTimeout(() => {
              if (init?.signal?.aborted) return;
              controller.enqueue(
                encoder.encode(`data: ${makeChunkPayload([{ text: "   \n\t " }])}\n\n`),
              );
            }, 1_000);
          },
        });
        return new Response(body, { status: 200 });
      })
      .mockResolvedValueOnce(
        new Response(
          makeSseStream([
            `data: ${makeChunkPayload([{ text: '{"coachMessage": "Fallback ok"}' }], "STOP")}\n\n`,
          ]),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const promise = streamWithFallback({
      geminiApiKey: "test-key",
      models: ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
      contents: [{ role: "user", parts: [{ text: "Hi" }] }],
      responseJsonSchema: { type: "object" },
      temperature: 0.4,
      timeoutMs: 10_000,
      parseResponse: (json) => json,
    });

    // Primary attempt phase is 55% of 10_000ms = 5_500ms.
    // Whitespace-only chunks must not extend to 10_000ms deadline, so primary aborts at 5.5s & falls back.
    await vi.advanceTimersByTimeAsync(6_000);
    expect(capturedSignal?.aborted).toBe(true);
    const result = await promise;
    expect(result).toEqual({
      data: { coachMessage: "Fallback ok" },
      model: "gemini-3.5-flash-lite",
    });
  });

  it("includes explicit maxOutputTokens in buildGeminiRequestBody when configured and omits when undefined", () => {
    const withCap = buildGeminiRequestBody(
      {
        contents: [{ role: "user", parts: [{ text: "Plan" }] }],
        responseJsonSchema: { type: "object" },
        temperature: 0.4,
        maxOutputTokens: 8192,
      },
      "gemini-3.8-flash",
    );
    expect((withCap.generationConfig as Record<string, unknown>).maxOutputTokens).toBe(8192);

    const withoutCap = buildGeminiRequestBody(
      {
        contents: [{ role: "user", parts: [{ text: "Plan" }] }],
        responseJsonSchema: { type: "object" },
        temperature: 0.4,
      },
      "gemini-3.8-flash",
    );
    expect("maxOutputTokens" in (withoutCap.generationConfig as Record<string, unknown>)).toBe(
      false,
    );
  });

  it("clamps fallback execution to at most 2 model attempts per logical request", async () => {
    const fetchMock = vi.fn(async () => new Response("rate limit", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateWithFallback({
        geminiApiKey: "test-key",
        models: ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"],
        contents: [{ role: "user", parts: [{ text: "Hi" }] }],
        responseJsonSchema: { type: "object" },
        temperature: 0.2,
        timeoutMs: 10_000,
        parseResponse: (json) => json,
      }),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("captures per-attempt usageMetadata before finishReason !== STOP and validation errors across primary & fallback", async () => {
    const attempts: AttemptTokenUsage[] = [];
    const primaryChunk = JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text: '{"coachMessage":"Cut' }] },
          finishReason: "MAX_TOKENS",
        },
      ],
      usageMetadata: {
        promptTokenCount: 1500,
        cachedContentTokenCount: 500,
        candidatesTokenCount: 8192,
        thoughtsTokenCount: 400,
      },
    });
    const fallbackChunk = JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text: '{"coachMessage":"Recovered"}' }] },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 1500,
        cachedContentTokenCount: 0,
        candidatesTokenCount: 320,
        thoughtsTokenCount: 0,
      },
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(makeSseStream([`data: ${primaryChunk}\n\n`]), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(makeSseStream([`data: ${fallbackChunk}\n\n`]), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await streamWithFallback({
      geminiApiKey: "test-key",
      models: ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
      contents: [{ role: "user", parts: [{ text: "Hi" }] }],
      responseJsonSchema: { type: "object" },
      temperature: 0.4,
      timeoutMs: 10_000,
      onAttemptUsage: (usage) => {
        attempts.push(usage);
      },
      parseResponse: (json) => json,
    });

    expect(result.model).toBe("gemini-3.5-flash-lite");
    expect(attempts).toEqual([
      {
        model: "gemini-3.8-flash",
        unmeasured: false,
        promptTokens: 1500,
        cachedTokens: 500,
        outputTokens: 8192,
        thinkingTokens: 400,
      },
      {
        model: "gemini-3.5-flash-lite",
        unmeasured: false,
        promptTokens: 1500,
        cachedTokens: 0,
        outputTokens: 320,
        thinkingTokens: 0,
      },
    ]);
  });

  it("captures generateWithFallback usageMetadata before Zod/parse validation error and across fallback", async () => {
    const attempts: AttemptTokenUsage[] = [];
    const badSchemaPayload = JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text: '{"wrongField": 123}' }] },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 900,
        cachedContentTokenCount: 200,
        candidatesTokenCount: 150,
        thoughtsTokenCount: 50,
      },
    });
    const goodPayload = JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text: '{"coachMessage":"Valid"}' }] },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 900,
        cachedContentTokenCount: 0,
        candidatesTokenCount: 80,
      },
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(badSchemaPayload, { status: 200 }))
      .mockResolvedValueOnce(new Response(goodPayload, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateWithFallback({
      geminiApiKey: "test-key",
      models: ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
      contents: [{ role: "user", parts: [{ text: "Hi" }] }],
      responseJsonSchema: { type: "object" },
      temperature: 0.4,
      timeoutMs: 10_000,
      onAttemptUsage: (usage) => {
        attempts.push(usage);
      },
      parseResponse: (json) => {
        const record = json as { coachMessage?: string };
        if (!record.coachMessage) throw new Error("missing coachMessage");
        return record;
      },
    });

    expect(result.model).toBe("gemini-3.5-flash-lite");
    expect(attempts).toEqual([
      {
        model: "gemini-3.8-flash",
        unmeasured: false,
        promptTokens: 900,
        cachedTokens: 200,
        outputTokens: 150,
        thinkingTokens: 50,
      },
      {
        model: "gemini-3.5-flash-lite",
        unmeasured: false,
        promptTokens: 900,
        cachedTokens: 0,
        outputTokens: 80,
        thinkingTokens: 0,
      },
    ]);
  });

  it("reports unmeasured conservative ceil(chars / 4) estimates when stream aborts before usageMetadata arrives", async () => {
    vi.useFakeTimers();
    const attempts: AttemptTokenUsage[] = [];
    const encoder = new TextEncoder();

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            init?.signal?.addEventListener("abort", () => {
              controller.error(new DOMException("Aborted", "AbortError"));
            });
            setTimeout(() => {
              if (init?.signal?.aborted) return;
              // Emit 9 chars without any usageMetadata chunk
              controller.enqueue(
                encoder.encode(`data: ${makeChunkPayload([{ text: '{"x":"ab"' }])}\n\n`),
              );
            }, 200);
            setTimeout(() => {
              if (init?.signal?.aborted) return;
              // Transport drops mid-stream before final usageMetadata chunk arrives
              controller.error(new TypeError("network stream aborted"));
            }, 400);
          },
        });
        return new Response(body, { status: 200 });
      })
      .mockResolvedValueOnce(
        new Response(
          makeSseStream([
            `data: ${JSON.stringify({
              candidates: [
                {
                  content: { parts: [{ text: '{"coachMessage":"Recovered"}' }] },
                  finishReason: "STOP",
                },
              ],
              usageMetadata: {
                promptTokenCount: 20,
                cachedContentTokenCount: 0,
                candidatesTokenCount: 15,
              },
            })}\n\n`,
          ]),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const promise = streamWithFallback({
      geminiApiKey: "test-key",
      models: ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
      contents: [{ role: "user", parts: [{ text: "1234567890" }] }],
      systemInstruction: "ABCD",
      responseJsonSchema: { type: "object" },
      temperature: 0.4,
      timeoutMs: 10_000,
      onAttemptUsage: (usage) => {
        attempts.push(usage);
      },
      parseResponse: (json) => json,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await promise;

    expect(attempts[0]).toEqual({
      model: "gemini-3.8-flash",
      unmeasured: true,
      promptTokens: Math.ceil((10 + 4) / 4),
      cachedTokens: 0,
      outputTokens: Math.ceil(9 / 4),
      thinkingTokens: 0,
    });
    expect(attempts[1]).toEqual({
      model: "gemini-3.5-flash-lite",
      unmeasured: false,
      promptTokens: 20,
      cachedTokens: 0,
      outputTokens: 15,
      thinkingTokens: 0,
    });
  });

  it("flags unmeasured=true and estimates output tokens when an intermediate SSE chunk has partial usageMetadata before abort", async () => {
    vi.useFakeTimers();
    const attempts: AttemptTokenUsage[] = [];
    const encoder = new TextEncoder();

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            init?.signal?.addEventListener("abort", () => {
              controller.error(new DOMException("Aborted", "AbortError"));
            });
            setTimeout(() => {
              if (init?.signal?.aborted) return;
              // Intermediate chunk reports prompt tokens + text, then stream drops before final usage chunk
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    candidates: [{ content: { parts: [{ text: '{"coachMessage":"12345678"' }] } }],
                    usageMetadata: { promptTokenCount: 2000, candidatesTokenCount: 0 },
                  })}\n\n`,
                ),
              );
            }, 100);
            setTimeout(() => {
              if (init?.signal?.aborted) return;
              controller.error(new TypeError("mid-stream disconnect"));
            }, 250);
          },
        });
        return new Response(body, { status: 200 });
      })
      .mockResolvedValueOnce(
        new Response(
          makeSseStream([
            `data: ${JSON.stringify({
              candidates: [
                {
                  content: { parts: [{ text: '{"coachMessage":"Recovered"}' }] },
                  finishReason: "STOP",
                },
              ],
              usageMetadata: {
                promptTokenCount: 50,
                cachedContentTokenCount: 10,
                candidatesTokenCount: 12,
                thoughtsTokenCount: 3,
              },
            })}\n\n`,
          ]),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const promise = streamWithFallback({
      geminiApiKey: "test-key",
      models: ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
      contents: [{ role: "user", parts: [{ text: "Hi" }] }],
      responseJsonSchema: { type: "object" },
      temperature: 0.4,
      timeoutMs: 10_000,
      onAttemptUsage: (usage) => {
        attempts.push(usage);
      },
      parseResponse: (json) => json,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await promise;

    expect(attempts[0]).toEqual({
      model: "gemini-3.8-flash",
      unmeasured: true,
      promptTokens: 2000,
      cachedTokens: 0,
      outputTokens: Math.ceil('{"coachMessage":"12345678"'.length / 4),
      thinkingTokens: 0,
    });
    expect(attempts[1]).toEqual({
      model: "gemini-3.5-flash-lite",
      unmeasured: false,
      promptTokens: 50,
      cachedTokens: 10,
      outputTokens: 12,
      thinkingTokens: 3,
    });
  });

  it("merges SSE usageMetadata monotonically, ignores empty {}, and counts text from unmeasured MAX_TOKENS chunks", async () => {
    const attempts: AttemptTokenUsage[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          makeSseStream([
            // Chunk terminates with MAX_TOKENS and no usageMetadata
            `data: ${makeChunkPayload([{ text: '{"partial":"abcdefgh"}' }], "MAX_TOKENS")}\n\n`,
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          makeSseStream([
            `data: ${JSON.stringify({
              candidates: [{ content: { parts: [{ text: '{"coach' }] } }],
              usageMetadata: { promptTokenCount: 400, cachedContentTokenCount: 150 },
            })}\n\n`,
            `data: ${JSON.stringify({
              candidates: [
                { content: { parts: [{ text: 'Message":"Ok"}' }] }, finishReason: "STOP" },
              ],
              // Subsequent chunk omits cachedContentTokenCount; earlier cached count must persist
              usageMetadata: {
                promptTokenCount: 400,
                candidatesTokenCount: 25,
                thoughtsTokenCount: 5,
              },
            })}\n\n`,
            // Empty trailing usageMetadata must not overwrite accumulated stats
            `data: ${JSON.stringify({ candidates: [], usageMetadata: {} })}\n\n`,
          ]),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await streamWithFallback({
      geminiApiKey: "test-key",
      models: ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
      contents: [{ role: "user", parts: [{ text: "ABCDEFGH" }] }],
      responseJsonSchema: { type: "object" },
      temperature: 0.4,
      timeoutMs: 10_000,
      onAttemptUsage: (usage) => {
        attempts.push(usage);
      },
      parseResponse: (json) => json,
    });

    expect(attempts[0]).toEqual({
      model: "gemini-3.8-flash",
      unmeasured: true,
      promptTokens: 2,
      cachedTokens: 0,
      outputTokens: Math.ceil('{"partial":"abcdefgh"}'.length / 4),
      thinkingTokens: 0,
    });
    expect(attempts[1]).toEqual({
      model: "gemini-3.5-flash-lite",
      unmeasured: false,
      promptTokens: 400,
      cachedTokens: 150,
      outputTokens: 25,
      thinkingTokens: 5,
    });
  });

  it("reports unmeasured fallback estimation in generateWithFallback when HTTP 200 lacks usageMetadata or aborts mid-body", async () => {
    const attempts: AttemptTokenUsage[] = [];
    const malformedBody = '{"candidates":[{"content":{"parts":[{"text":"partial';
    const noUsagePayload = JSON.stringify({
      candidates: [
        {
          content: { parts: [{ text: '{"coachMessage":"NoMeta"}' }] },
          finishReason: "STOP",
        },
      ],
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(malformedBody, { status: 200 }))
      .mockResolvedValueOnce(new Response(noUsagePayload, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateWithFallback({
      geminiApiKey: "test-key",
      models: ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
      contents: [{ role: "user", parts: [{ text: "123456789012" }] }],
      responseJsonSchema: { type: "object" },
      temperature: 0.2,
      timeoutMs: 10_000,
      onAttemptUsage: (usage) => {
        attempts.push(usage);
      },
      parseResponse: (json) => json as { coachMessage: string },
    });

    expect(result.model).toBe("gemini-3.5-flash-lite");
    expect(attempts[0]).toEqual({
      model: "gemini-3.8-flash",
      unmeasured: true,
      promptTokens: Math.ceil(12 / 4),
      cachedTokens: 0,
      outputTokens: Math.ceil(malformedBody.length / 4),
      thinkingTokens: 0,
    });
    expect(attempts[1]).toEqual({
      model: "gemini-3.5-flash-lite",
      unmeasured: true,
      promptTokens: Math.ceil(12 / 4),
      cachedTokens: 0,
      outputTokens: Math.ceil('{"coachMessage":"NoMeta"}'.length / 4),
      thinkingTokens: 0,
    });
  });
});
