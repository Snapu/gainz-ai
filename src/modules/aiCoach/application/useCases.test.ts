import { err, errAsync, ok, okAsync } from "neverthrow";
import { describe, expect, it, vi } from "vitest";
import type { CoachingAdvice } from "../domain/types";
import { type AiCoachService, requestAdviceWithSingleRetry } from "./useCases";

function makeService(askImpl: AiCoachService["ask"]): AiCoachService {
  return {
    ask: askImpl,
    recover: vi.fn(() => errAsync("not-found" as const)),
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

  it("rotates clientRequestId on retry after generate-content-stream-failed", async () => {
    vi.useFakeTimers();

    const ask = vi
      .fn<AiCoachService["ask"]>()
      .mockReturnValueOnce(errAsync("generate-content-stream-failed"))
      .mockReturnValueOnce(
        okAsync({ advice: { coachMessage: "Recovered schema" } as CoachingAdvice }),
      );
    const onRetry = vi.fn();

    const promise = requestAdviceWithSingleRetry(
      makeService(ask),
      {
        accessToken: "access-token",
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        userProfile: {} as never,
        insights: {} as never,
        exerciseLogs: [],
        trainingSummaries: [],
        previousMessages: [],
      },
      2000,
      onRetry,
    );

    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;
    vi.useRealTimers();

    expect(result.isOk()).toBe(true);
    expect(ask).toHaveBeenCalledTimes(2);
    const firstId = ask.mock.calls[0]?.[0].clientRequestId;
    const retryId = ask.mock.calls[1]?.[0].clientRequestId;
    expect(retryId).toBeTruthy();
    expect(retryId).not.toBe(firstId);
    expect(onRetry).toHaveBeenCalledWith(retryId);
  });
});
