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
        accessToken: "access-token",
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
      accessToken: "access-token",
      userProfile: {} as never,
      insights: {} as never,
      exerciseLogs: [],
      trainingSummaries: [],
      previousMessages: [],
    });

    expect(ask).toHaveBeenCalledTimes(1);
    expect(result).toEqual(err("coaching-request-failed"));
  });

  it("does not retry unauthorized or rate-limit-exceeded failures", async () => {
    const askUnauthorized = vi
      .fn<AiCoachService["ask"]>()
      .mockReturnValue(errAsync("unauthorized"));

    const unauthorizedResult = await requestAdviceWithSingleRetry(makeService(askUnauthorized), {
      accessToken: undefined,
      userProfile: {} as never,
      insights: {} as never,
      exerciseLogs: [],
      trainingSummaries: [],
      previousMessages: [],
    });

    expect(askUnauthorized).toHaveBeenCalledTimes(1);
    expect(unauthorizedResult).toEqual(err("unauthorized"));

    const askRateLimited = vi
      .fn<AiCoachService["ask"]>()
      .mockReturnValue(errAsync("rate-limit-exceeded"));

    const rateLimitedResult = await requestAdviceWithSingleRetry(makeService(askRateLimited), {
      accessToken: "access-token",
      userProfile: {} as never,
      insights: {} as never,
      exerciseLogs: [],
      trainingSummaries: [],
      previousMessages: [],
    });

    expect(askRateLimited).toHaveBeenCalledTimes(1);
    expect(rateLimitedResult).toEqual(err("rate-limit-exceeded"));
  });
});
