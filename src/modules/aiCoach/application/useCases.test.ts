import { err, errAsync, ok, okAsync } from "neverthrow";
import { describe, expect, it, vi } from "vitest";
import type { CoachingAdvice } from "../domain/types";
import { type AiCoachService, requestAdviceWithSingleRetry } from "./useCases";

function makeService(askImpl: AiCoachService["ask"]): AiCoachService {
  return {
    ask: askImpl,
    classifyExercises: vi.fn(() => okAsync({ classifications: [] })),
    getTodayLogsCount: vi.fn(() => 0),
  };
}

describe("aiCoach application use-cases", () => {
  it("retries once when the model returned unusable output", async () => {
    vi.useFakeTimers();

    const ask = vi
      .fn<AiCoachService["ask"]>()
      .mockReturnValueOnce(errAsync("generate-content-stream-failed"))
      .mockReturnValueOnce(
        okAsync({ advice: { coachMessage: "Hello" } as CoachingAdvice, requestPayload: "payload" }),
      );

    const runPromise = requestAdviceWithSingleRetry(
      makeService(ask),
      {
        apiKey: "api-key",
        userProfile: {} as never,
        insights: {} as never,
        exerciseLogs: [],
        trainingSummaries: [],
        previousMessages: [],
        events: [],
        question: undefined,
      },
      10,
    );

    await vi.advanceTimersByTimeAsync(10);
    const result = await runPromise;

    expect(ask).toHaveBeenCalledTimes(2);
    expect(result).toEqual(ok({ advice: { coachMessage: "Hello" }, requestPayload: "payload" }));

    vi.useRealTimers();
  });

  it("does not retry request failures that already used the model fallback", async () => {
    const ask = vi.fn<AiCoachService["ask"]>().mockReturnValue(errAsync("coaching-request-failed"));

    const result = await requestAdviceWithSingleRetry(makeService(ask), {
      apiKey: "api-key",
      userProfile: {} as never,
      insights: {} as never,
      exerciseLogs: [],
      trainingSummaries: [],
      previousMessages: [],
    });

    expect(ask).toHaveBeenCalledTimes(1);
    expect(result).toEqual(err("coaching-request-failed"));
  });

  it("does not retry missing-api-key failures", async () => {
    const ask = vi.fn<AiCoachService["ask"]>().mockReturnValue(errAsync("missing-api-key"));

    const result = await requestAdviceWithSingleRetry(makeService(ask), {
      apiKey: undefined,
      userProfile: {} as never,
      insights: {} as never,
      exerciseLogs: [],
      trainingSummaries: [],
      previousMessages: [],
    });

    expect(ask).toHaveBeenCalledTimes(1);
    expect(result).toEqual(err("missing-api-key"));
  });
});
