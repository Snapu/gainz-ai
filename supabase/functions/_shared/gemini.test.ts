import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NonRetryableModelError, RetryableModelError, streamWithFallback } from "./gemini";

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
      timeoutMs: 10_000,
      thinkingConfig: { level: "minimal", includeThoughts: false },
      parseResponse: (json) => json,
    });

    const gemini3Body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      generationConfig: { thinkingConfig: Record<string, unknown> };
    };
    const gemini25Body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      generationConfig: { thinkingConfig: Record<string, unknown> };
    };

    // gemini-3.8-flash clamps unsupported "minimal" to "LOW" and never sends thinkingBudget
    expect(gemini3Body.generationConfig.thinkingConfig).toEqual({
      thinkingLevel: "LOW",
      includeThoughts: false,
    });
    // gemini-2.5-flash uses integer thinkingBudget and never sends thinkingLevel
    expect(gemini25Body.generationConfig.thinkingConfig).toEqual({
      thinkingBudget: 0,
      includeThoughts: false,
    });
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
});
