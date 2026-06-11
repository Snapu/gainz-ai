import { err, ok, Result, type Result as ResultType } from "neverthrow";

interface MessageRecord {
  timestamp: Date | string;
}

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

type SessionsMap = Record<string, MessageRecord[]>;

function getSessionsMap(): ResultType<SessionsMap, "load-failed"> {
  const readStoredResult = Result.fromThrowable(
    () => localStorage.getItem(STORAGE_KEY),
    () => "load-failed" as const,
  )();

  if (readStoredResult.isErr()) return err("load-failed");
  if (!readStoredResult.value) return ok({});

  const parseStoredResult = Result.fromThrowable(
    (stored: string) => JSON.parse(stored) as SessionsMap,
    () => "load-failed" as const,
  )(readStoredResult.value);

  if (parseStoredResult.isErr()) return err("load-failed");

  return ok(parseStoredResult.value);
}

function saveSessionsMap(sessionsMap: SessionsMap): ResultType<void, "save-failed"> {
  return Result.fromThrowable(
    () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionsMap));
    },
    () => "save-failed" as const,
  )();
}

export function loadMessagesFromStorage<T extends MessageRecord>(
  sessionId: string,
): ResultType<T[], "load-failed"> {
  const mapResult = getSessionsMap();
  if (mapResult.isErr()) return err("load-failed");

  const sessionMessages = mapResult.value[sessionId];
  if (!sessionMessages || !Array.isArray(sessionMessages)) return ok([]);

  return ok(sessionMessages as T[]);
}

export function saveMessagesToStorage<T extends MessageRecord>(
  sessionId: string,
  messages: T[],
): ResultType<void, "save-failed"> {
  const mapResult = getSessionsMap();
  const sessionsMap = mapResult.isOk() ? mapResult.value : {};

  sessionsMap[sessionId] = messages;
  return saveSessionsMap(sessionsMap);
}

export function removeMessagesFromStorage(sessionId: string): void {
  const mapResult = getSessionsMap();
  if (mapResult.isOk()) {
    delete mapResult.value[sessionId];
    saveSessionsMap(mapResult.value);
  }
}

export function cleanOldCoachingSessions(): void {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_SESSION_AGE_DAYS);
  const cutoffIsoString = cutoffDate.toISOString().slice(0, 10);

  const mapResult = getSessionsMap();
  if (mapResult.isOk()) {
    const sessionsMap = mapResult.value;
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
  }

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
