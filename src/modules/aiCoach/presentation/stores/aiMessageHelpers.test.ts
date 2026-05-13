import { describe, expect, it, vi } from "vitest";
import {
  createAiAssistantMessage,
  createAiUserPlaceholder,
  removeMessageById,
  replaceMessageContentById,
  shouldUseCachedAssistantResponse,
  toPreviousAiMessages,
} from "./aiMessageHelpers";

describe("aiMessageHelpers", () => {
  it("detects when cached assistant response can be reused", () => {
    expect(
      shouldUseCachedAssistantResponse(
        {
          id: "1",
          role: "assistant",
          content: "ok",
          timestamp: new Date("2026-01-01T00:00:00.000Z"),
          sessionDate: "2026-01-01",
          logsCount: 3,
        },
        3,
        "2026-01-01",
      ),
    ).toBe(true);

    expect(
      shouldUseCachedAssistantResponse(
        {
          id: "1",
          role: "user",
          content: "ok",
          timestamp: new Date("2026-01-01T00:00:00.000Z"),
          sessionDate: "2026-01-01",
          logsCount: 3,
        },
        3,
        "2026-01-01",
      ),
    ).toBe(false);
  });

  it("serializes messages for previous-ai payload", () => {
    const previous = toPreviousAiMessages([
      {
        id: "m1",
        role: "assistant",
        content: "coach",
        timestamp: new Date("2026-01-01T00:00:00.000Z"),
        sessionDate: "2026-01-01",
        logsCount: 4,
      },
    ]);

    expect(previous).toEqual([
      {
        role: "assistant",
        content: "coach",
        timestamp: "2026-01-01T00:00:00.000Z",
        sessionDate: "2026-01-01",
        logsCount: 4,
      },
    ]);
  });

  it("creates user and assistant message objects", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));

    const user = createAiUserPlaceholder("2026-01-01", 2);
    const assistant = createAiAssistantMessage("2026-01-01", 2, "payload");

    expect(user.id).toBe("1767268800000-user");
    expect(user.content).toBe("AI request");
    expect(assistant.id).toBe("1767268800000-assistant");
    expect(assistant.content).toBe("payload");

    vi.useRealTimers();
  });

  it("replaces and removes messages immutably", () => {
    const source = [
      { id: "a", content: "x" },
      { id: "b", content: "y" },
    ];

    const replaced = replaceMessageContentById(source, "a", "updated");
    const removed = removeMessageById(replaced, "b");

    expect(source[0]?.content).toBe("x");
    expect(replaced[0]?.content).toBe("updated");
    expect(removed).toEqual([{ id: "a", content: "updated" }]);
  });
});
