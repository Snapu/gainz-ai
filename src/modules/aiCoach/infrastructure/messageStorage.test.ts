import { beforeEach, describe, expect, it } from "vitest";
import {
  cleanOldCoachingSessions,
  createPlanSessionId,
  extractDateFromSessionId,
  loadMessagesFromStorage,
  removeMessagesFromStorage,
  saveMessagesToStorage,
} from "./messageStorage";

describe("messageStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("ID extractors", () => {
    it("extractDateFromSessionId correctly extracts date", () => {
      expect(extractDateFromSessionId("plan-2026-01-01")).toBe("2026-01-01");
      expect(extractDateFromSessionId("2026-01-01")).toBe("2026-01-01");
    });

    it("createPlanSessionId correctly prefixes date", () => {
      expect(createPlanSessionId("2026-01-01")).toBe("plan-2026-01-01");
    });
  });

  describe("load/save", () => {
    it("returns empty array if no session exists", () => {
      const result = loadMessagesFromStorage("session-1");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it("saves and loads messages", () => {
      const messages = [{ timestamp: "2026-01-01T00:00:00Z", content: "test" }];
      const saveRes = saveMessagesToStorage("session-1", messages);
      expect(saveRes.isOk()).toBe(true);

      const loadRes = loadMessagesFromStorage<{ timestamp: string; content: string }>("session-1");
      expect(loadRes.isOk()).toBe(true);
      if (loadRes.isOk()) {
        expect(loadRes.value).toEqual(messages);
      }
    });

    it("removes messages by session id", () => {
      const messages = [{ timestamp: "2026-01-01T00:00:00Z" }];
      saveMessagesToStorage("session-1", messages);
      removeMessagesFromStorage("session-1");

      const loadRes = loadMessagesFromStorage("session-1");
      if (loadRes.isOk()) {
        expect(loadRes.value).toEqual([]);
      }
    });
  });

  describe("cleanOldCoachingSessions", () => {
    it("removes sessions older than 28 days", () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30);
      const oldIso = oldDate.toISOString().slice(0, 10);

      const newDate = new Date();
      const newIso = newDate.toISOString().slice(0, 10);

      saveMessagesToStorage(`plan-${oldIso}`, [{ timestamp: "old" }]);
      saveMessagesToStorage(`plan-${newIso}`, [{ timestamp: "new" }]);
      saveMessagesToStorage(`${oldIso}`, [{ timestamp: "old-2" }]);

      cleanOldCoachingSessions();

      expect(loadMessagesFromStorage(`plan-${oldIso}`)._unsafeUnwrap()).toEqual([]);
      expect(loadMessagesFromStorage(`${oldIso}`)._unsafeUnwrap()).toEqual([]);
      expect(loadMessagesFromStorage(`plan-${newIso}`)._unsafeUnwrap().length).toBe(1);
    });

    it("removes legacy keys", () => {
      localStorage.setItem("ai-messages-test", "something");
      cleanOldCoachingSessions();
      expect(localStorage.getItem("ai-messages-test")).toBeNull();
    });
  });
});
