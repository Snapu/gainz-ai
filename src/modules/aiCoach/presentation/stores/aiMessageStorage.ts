import { err, ok, Result, type Result as ResultType } from "neverthrow";
import { localeDateString } from "@/modules/sharedKernel/presentation";

interface AiMessageRecord {
  timestamp: Date | string;
}

export type AiMessageStorageError = "load-failed" | "save-failed";

const STORAGE_KEY_PREFIX = "ai-messages-";
const MAX_SESSION_AGE_DAYS = 7;

function getStorageKey(sessionDate: string): string {
  return `${STORAGE_KEY_PREFIX}${sessionDate}`;
}

export function loadAiMessagesFromStorage<T extends AiMessageRecord>(
  sessionDate: string,
): ResultType<T[], "load-failed"> {
  const readStoredResult = Result.fromThrowable(
    () => localStorage.getItem(getStorageKey(sessionDate)),
    () => "load-failed" as const,
  )();

  if (readStoredResult.isErr()) {
    return err("load-failed");
  }

  if (!readStoredResult.value) {
    return ok([]);
  }

  const parseStoredResult = Result.fromThrowable(
    (stored: string) => JSON.parse(stored) as T[],
    () => "load-failed" as const,
  )(readStoredResult.value);

  if (parseStoredResult.isErr()) {
    return err("load-failed");
  }

  return ok(
    parseStoredResult.value.map((message) => ({
      ...message,
      timestamp: new Date(message.timestamp),
    })),
  );
}

export function saveAiMessagesToStorage<T>(
  sessionDate: string,
  messages: T[],
): ResultType<void, "save-failed"> {
  return Result.fromThrowable(
    () => {
      localStorage.setItem(getStorageKey(sessionDate), JSON.stringify(messages));
    },
    () => "save-failed" as const,
  )();
}

export function removeAiMessagesFromStorage(sessionDate: string): void {
  localStorage.removeItem(getStorageKey(sessionDate));
}

export function cleanOldAiSessions(): void {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_SESSION_AGE_DAYS);

  const keysToRemove: string[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith(STORAGE_KEY_PREFIX)) continue;

    const currentSessionDate = key.replace(STORAGE_KEY_PREFIX, "");
    if (currentSessionDate < localeDateString(cutoffDate)) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}
