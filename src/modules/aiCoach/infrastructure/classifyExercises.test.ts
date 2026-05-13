import { describe, expect, it, vi } from "vitest";

const { generateContentMock, captureMessageMock, captureExceptionMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
  captureMessageMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

const googleGenAiMock = vi.hoisted(() => ({
  GoogleGenAI: vi.fn(function GoogleGenAI() {
    return {
      models: {
        generateContent: generateContentMock,
      },
    };
  }),
  Type: {
    OBJECT: "OBJECT",
    ARRAY: "ARRAY",
    STRING: "STRING",
    NUMBER: "NUMBER",
  },
}));

vi.mock("@google/genai", () => googleGenAiMock);
vi.mock("@sentry/vue", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: captureMessageMock,
  captureException: captureExceptionMock,
}));

import { classifyExercises } from "./classifyExercises";

describe("classifyExercises", () => {
  it("returns empty classifications without calling the model for empty input", async () => {
    const result = await classifyExercises([], "test-api-key");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ classifications: [] });
    }
    expect(googleGenAiMock.GoogleGenAI).not.toHaveBeenCalled();
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it("uses the primary model and parses the response", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        classifications: [
          {
            exerciseName: "Bench Press",
            primaryMuscle: "Chest",
            confidence: 0.99,
          },
        ],
      }),
    });

    const result = await classifyExercises(["Bench Press"], "test-api-key");

    expect(googleGenAiMock.GoogleGenAI).toHaveBeenCalledWith({ apiKey: "test-api-key" });
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-2.5-flash",
        config: expect.objectContaining({ temperature: 0.1 }),
      }),
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.classifications[0]?.primaryMuscle).toBe("Chest");
    }
  });

  it("falls back to the secondary model when the primary model is unavailable", async () => {
    generateContentMock.mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce({
      text: JSON.stringify({ classifications: [] }),
    });

    const result = await classifyExercises(["Bench Press"], "test-api-key");

    const models = generateContentMock.mock.calls.slice(-2).map((call) => call[0]?.model);
    expect(models).toEqual(["gemini-2.5-flash", "gemini-3.1-flash-lite-preview"]);
    expect(captureMessageMock).toHaveBeenCalled();
    expect(result.isOk()).toBe(true);
  });

  it("returns missing-api-key without calling the model", async () => {
    googleGenAiMock.GoogleGenAI.mockClear();
    generateContentMock.mockClear();

    const result = await classifyExercises(["Bench Press"], undefined);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("missing-api-key");
    }
    expect(googleGenAiMock.GoogleGenAI).not.toHaveBeenCalled();
    expect(generateContentMock).not.toHaveBeenCalled();
  });
});
