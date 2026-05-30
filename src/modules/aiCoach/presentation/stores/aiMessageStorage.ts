import { err, ok, Result, type Result as ResultType } from "neverthrow";

interface AiMessageRecord {
  timestamp: Date | string;
}

export type AiMessageStorageError = "load-failed" | "save-failed";

const STORAGE_KEY = "ai-sessions-v1";
const LEGACY_STORAGE_KEY_PREFIX = "ai-messages-";
const MAX_SESSION_AGE_DAYS = 7;

type SessionsMap = Record<string, AiMessageRecord[]>;

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

export function loadAiMessagesFromStorage<T extends AiMessageRecord>(
  sessionId: string,
): ResultType<T[], "load-failed"> {
  const mapResult = getSessionsMap();
  if (mapResult.isErr()) return err("load-failed");

  const sessionMessages = mapResult.value[sessionId];
  if (!sessionMessages || !Array.isArray(sessionMessages)) return ok([]);

  return ok(
    sessionMessages.map((message) => ({
      ...(message as unknown as T),
      timestamp: new Date(message.timestamp),
    })),
  );
}

export function saveAiMessagesToStorage<T extends AiMessageRecord>(
  sessionId: string,
  messages: T[],
): ResultType<void, "save-failed"> {
  const mapResult = getSessionsMap();
  const sessionsMap = mapResult.isOk() ? mapResult.value : {};

  sessionsMap[sessionId] = messages;
  return saveSessionsMap(sessionsMap);
}

export function removeAiMessagesFromStorage(sessionId: string): void {
  const mapResult = getSessionsMap();
  if (mapResult.isOk()) {
    delete mapResult.value[sessionId];
    saveSessionsMap(mapResult.value);
  }
}

export function cleanOldAiSessions(): void {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_SESSION_AGE_DAYS);
  const cutoffIsoString = cutoffDate.toISOString().slice(0, 10);

  const mapResult = getSessionsMap();
  if (mapResult.isOk()) {
    const sessionsMap = mapResult.value;
    let hasChanges = false;

    for (const sessionId of Object.keys(sessionsMap)) {
      if (sessionId < cutoffIsoString) {
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
