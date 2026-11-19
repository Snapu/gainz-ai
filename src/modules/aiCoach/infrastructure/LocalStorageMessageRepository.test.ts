import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isoDateString } from "@/modules/sharedKernel/domain";
import type { CoachingMessage } from "../domain";
import {
  createPlanSessionId,
  extractDateFromSessionId,
  LocalStorageMessageRepository,
} from "./LocalStorageMessageRepository";

describe("LocalStorageMessageRepository", () => {
  let repository: LocalStorageMessageRepository;

  beforeEach(() => {
    localStorage.clear();
    repository = new LocalStorageMessageRepository();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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
      const result = repository.loadMessages("session-1");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it("saves and loads messages", () => {
      const messages = [
        { id: "1", timestamp: "2026-01-01T00:00:00Z", role: "user", content: "test" },
      ] as CoachingMessage[];
      const saveRes = repository.saveMessages("session-1", messages);
      expect(saveRes.isOk()).toBe(true);

      const loadRes = repository.loadMessages("session-1");
      expect(loadRes.isOk()).toBe(true);
      if (loadRes.isOk()) {
        expect(loadRes.value).toEqual(messages);
      }
    });

    it("removes messages by session id", () => {
      const messages = [
        { id: "1", timestamp: "2026-01-01T00:00:00Z", role: "user", content: "test" },
      ] as CoachingMessage[];
      repository.saveMessages("session-1", messages);
      repository.removeMessages("session-1");

      const loadRes = repository.loadMessages("session-1");
      if (loadRes.isOk()) {
        expect(loadRes.value).toEqual([]);
      }
    });
  });

  describe("cleanOldCoachingSessions", () => {
    it("removes sessions older than MAX_SESSION_AGE_DAYS", () => {
      const now = new Date();

      const validDate = new Date(now);
      validDate.setDate(now.getDate() - 10);

      const oldDate = new Date(now);
      oldDate.setDate(now.getDate() - 30);

      const validSession = isoDateString(validDate);
      const oldSession = isoDateString(oldDate);
      const oldPlanSession = `plan-${oldSession}`;

      repository.saveMessages(validSession, [
        { id: "1", timestamp: "1", role: "user", content: "ok" },
      ] as CoachingMessage[]);
      repository.saveMessages(oldSession, [
        { id: "2", timestamp: "2", role: "user", content: "too old" },
      ] as CoachingMessage[]);
      repository.saveMessages(oldPlanSession, [
        { id: "3", timestamp: "3", role: "user", content: "too old plan" },
      ] as CoachingMessage[]);

      repository.cleanOldSessions();

      expect(repository.loadMessages(validSession)._unsafeUnwrap()).toHaveLength(1);
      expect(repository.loadMessages(oldSession)._unsafeUnwrap()).toHaveLength(0);
      expect(repository.loadMessages(oldPlanSession)._unsafeUnwrap()).toHaveLength(0);
    });

    it("applies the 28-day cutoff using local calendar dates in UTC-5", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-16T01:00:00Z"));
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(300);

      const message = { id: "1", timestamp: "1", role: "user", content: "msg" } as CoachingMessage;
      repository.saveMessages("2026-05-18", [message]);
      repository.saveMessages("plan-2026-05-18", [message]);
      repository.saveMessages("2026-05-17", [message]);
      repository.saveMessages("plan-2026-05-17", [message]);

      repository.cleanOldSessions();

      expect(repository.loadMessages("2026-05-18")._unsafeUnwrap()).toHaveLength(1);
      expect(repository.loadMessages("plan-2026-05-18")._unsafeUnwrap()).toHaveLength(1);
      expect(repository.loadMessages("2026-05-17")._unsafeUnwrap()).toHaveLength(0);
      expect(repository.loadMessages("plan-2026-05-17")._unsafeUnwrap()).toHaveLength(0);
    });

    it("applies the 28-day cutoff using local calendar dates in UTC+2", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-15T22:30:00Z"));
      vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-120);

      const message = { id: "1", timestamp: "1", role: "user", content: "msg" } as CoachingMessage;
      repository.saveMessages("2026-05-19", [message]);
      repository.saveMessages("plan-2026-05-19", [message]);
      repository.saveMessages("2026-05-18", [message]);
      repository.saveMessages("plan-2026-05-18", [message]);

      repository.cleanOldSessions();

      expect(repository.loadMessages("2026-05-19")._unsafeUnwrap()).toHaveLength(1);
      expect(repository.loadMessages("plan-2026-05-19")._unsafeUnwrap()).toHaveLength(1);
      expect(repository.loadMessages("2026-05-18")._unsafeUnwrap()).toHaveLength(0);
      expect(repository.loadMessages("plan-2026-05-18")._unsafeUnwrap()).toHaveLength(0);
    });

    it("removes legacy storage keys", () => {
      localStorage.setItem("ai-messages-123", "[]");
      repository.cleanOldSessions();
      expect(localStorage.getItem("ai-messages-123")).toBeNull();
    });

    it("clears persisted sessions and pending recovery request in clearAllSessions", () => {
      repository.saveMessages("session-1", [
        { id: "1", timestamp: "2026-01-01T00:00:00Z", role: "user", content: "test" },
      ] as CoachingMessage[]);
      localStorage.setItem(
        "ai-coach:pending-request",
        JSON.stringify({ clientRequestId: "req-1" }),
      );

      repository.clearAllSessions();

      expect(repository.loadMessages("session-1")._unsafeUnwrap()).toEqual([]);
      expect(localStorage.getItem("ai-coach:pending-request")).toBeNull();
    });
  });
});
