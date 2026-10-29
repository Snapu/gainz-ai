import { ok, Result, type Result as ResultType } from "neverthrow";
import type { CoachingMessage } from "../domain";

const STORAGE_KEY = "ai-sessions-v1";
const LEGACY_STORAGE_KEY_PREFIX = "ai-messages-";
// Match plan cycle length so messages survive the full 2-week mesocycle.
// Plan-scoped session IDs (plan-YYYY-MM-DD) need this to stay alive for 28 days.
const MAX_SESSION_AGE_DAYS = 28;

export function createPlanSessionId(dateIsoString: string): string {
  return `plan-${dateIsoString}`;
}

export function extractDateFromSessionId(sessionId: string): string {
  return sessionId.startsWith("plan-") ? sessionId.slice(5) : sessionId;
}

type SessionsMap = Record<string, CoachingMessage[]>;

function getSessionsMap(): ResultType<SessionsMap, "load-failed"> {
  return Result.fromThrowable(
    () => localStorage.getItem(STORAGE_KEY),
    () => "load-failed" as const,
  )().andThen((stored) => {
    if (!stored) return ok({});
    return Result.fromThrowable(
      (data: string) => JSON.parse(data) as SessionsMap,
      () => "load-failed" as const,
    )(stored);
  });
}

function saveSessionsMap(sessionsMap: SessionsMap): ResultType<void, "save-failed"> {
  return Result.fromThrowable(
    () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionsMap));
    },
    () => "save-failed" as const,
  )();
}

export class LocalStorageMessageRepository {
  public loadMessages(sessionId: string): ResultType<CoachingMessage[], "load-failed"> {
    return getSessionsMap().map((sessionsMap) => {
      const sessionMessages = sessionsMap[sessionId];
      if (!sessionMessages || !Array.isArray(sessionMessages)) return [];
      return sessionMessages;
    });
  }

  public saveMessages(
    sessionId: string,
    messages: CoachingMessage[],
  ): ResultType<void, "save-failed"> {
    const sessionsMap: SessionsMap = getSessionsMap().unwrapOr({});
    sessionsMap[sessionId] = messages;
    return saveSessionsMap(sessionsMap);
  }

  public removeMessages(sessionId: string): void {
    getSessionsMap().andTee((sessionsMap) => {
      delete sessionsMap[sessionId];
      saveSessionsMap(sessionsMap);
    });
  }

  public cleanOldSessions(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_SESSION_AGE_DAYS);
    const cutoffIsoString = cutoffDate.toISOString().slice(0, 10);

    getSessionsMap().andTee((sessionsMap) => {
      let hasChanges = false;
      for (const sessionId of Object.keys(sessionsMap)) {
        // Extract the date portion from both "2026-06-04" and "plan-2026-06-04" formats
        const dateStr = extractDateFromSessionId(sessionId);
        if (dateStr < cutoffIsoString) {
          delete sessionsMap[sessionId];
          hasChanges = true;
        }
      }

      if (hasChanges) {
        saveSessionsMap(sessionsMap);
      }
    });

    // Remove legacy keys
    const legacyKeysToRemove: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith(LEGACY_STORAGE_KEY_PREFIX)) {
        legacyKeysToRemove.push(key);
      }
    }

    for (const key of legacyKeysToRemove) {
      localStorage.removeItem(key);
    }
  }
}
