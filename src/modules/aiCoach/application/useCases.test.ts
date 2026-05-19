import { err, errAsync, ok, okAsync } from "neverthrow";
import { describe, expect, it, vi } from "vitest";
import { type AiCoachService, askCoachWithSingleRetry, responseStartsDeload } from "./useCases";

function makeService(askImpl: AiCoachService["ask"]): AiCoachService {
  return {
    ask: askImpl,
    classifyExercises: vi.fn(() => okAsync({ classifications: [] })),
    getTodayLogsCount: vi.fn(() => 0),
  };
}

describe("aiCoach application use-cases", () => {
  it("retries once for non-missing-api-key failures", async () => {
    vi.useFakeTimers();

    const ask = vi
      .fn<AiCoachService["ask"]>()
      .mockReturnValueOnce(errAsync("ai-request-failed"))
      .mockReturnValueOnce(okAsync({ responseText: "{}", requestPayload: "payload" }));

    const runPromise = askCoachWithSingleRetry(
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
    expect(result).toEqual(ok({ responseText: "{}", requestPayload: "payload" }));

    vi.useRealTimers();
  });

  it("does not retry missing-api-key failures", async () => {
    const ask = vi.fn<AiCoachService["ask"]>().mockReturnValue(errAsync("missing-api-key"));

    const result = await askCoachWithSingleRetry(makeService(ask), {
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

  it("parses startDeload safely from response JSON", () => {
    expect(responseStartsDeload('{"startDeload":true}')).toBe(true);
    expect(responseStartsDeload('{"startDeload":false}')).toBe(false);
    expect(responseStartsDeload("not-json")).toBe(false);
  });
});
