import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureMessageMock, captureExceptionMock } = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@sentry/vue", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: captureMessageMock,
  captureException: captureExceptionMock,
}));

import { classifyExercises } from "./classifyExercises";

describe("classifyExercises", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns empty classifications without calling the backend for empty input", async () => {
    const result = await classifyExercises([], "test-access-token");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ classifications: [] });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the ai-coach Edge Function and parses the response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        text: JSON.stringify({
          classifications: [
            {
              exerciseName: "Bench Press",
              primaryMuscle: "Chest",
              confidence: 0.99,
            },
          ],
        }),
      }),
    });

    const result = await classifyExercises(["Bench Press"], "test-access-token");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/functions/v1/ai-coach");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-access-token");
    expect(JSON.parse(init.body as string)).toMatchObject({
      action: "classify",
      exerciseNames: ["Bench Press"],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.classifications[0]?.primaryMuscle).toBe("Chest");
    }
  });

  it("maps HTTP 429 from the Edge Function to rate-limit-exceeded", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
    });

    const result = await classifyExercises(["Bench Press"], "test-access-token");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("rate-limit-exceeded");
    }
  });

  it("returns coaching-request-failed and captures exception for malformed JSON", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ text: "not-json" }),
    });

    const result = await classifyExercises(["Bench Press"], "test-access-token");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("coaching-request-failed");
    }
    expect(captureExceptionMock).toHaveBeenCalled();
  });

  it("returns unauthorized without calling the backend when accessToken is undefined", async () => {
    const result = await classifyExercises(["Bench Press"], undefined);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("unauthorized");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
