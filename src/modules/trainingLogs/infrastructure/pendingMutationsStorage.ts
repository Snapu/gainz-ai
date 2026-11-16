import { ok, Result } from "neverthrow";
import { type PendingLogMutation, PendingLogMutationSchema } from "../domain/pendingLogMutation";

export const PENDING_LOGS_STORAGE_KEY = "gainz:pendingExerciseLogs";

type StorageLoadError = "load-failed" | "parse-failed";
type StorageSaveError = "storage-write-failed";

const readRawPendingLogs = Result.fromThrowable(
  () =>
    typeof localStorage === "undefined" ? null : localStorage.getItem(PENDING_LOGS_STORAGE_KEY),
  (): StorageLoadError => "load-failed",
);

const parseJson = Result.fromThrowable(JSON.parse, (): StorageLoadError => "parse-failed");

export function loadPendingLogMutations(): PendingLogMutation[] {
  return readRawPendingLogs()
    .andThen((raw) => (raw ? parseJson(raw) : ok<unknown, StorageLoadError>([])))
    .map((parsed): PendingLogMutation[] => {
      if (!Array.isArray(parsed)) return [];
      const valid: PendingLogMutation[] = [];
      for (const item of parsed) {
        const result = PendingLogMutationSchema.safeParse(item);
        if (result.success) {
          valid.push(result.data);
        } else {
          console.warn("Skipping invalid pending exercise log mutation:", result.error);
        }
      }
      return valid;
    })
    .orTee((error) => {
      console.error("Failed to load pending exercise log mutations:", error);
    })
    .unwrapOr([]);
}

export function savePendingLogMutations(
  mutations: readonly PendingLogMutation[],
): Result<void, StorageSaveError> {
  if (typeof localStorage === "undefined") return ok(undefined);
  return Result.fromThrowable(
    () => {
      if (mutations.length === 0) {
        localStorage.removeItem(PENDING_LOGS_STORAGE_KEY);
      } else {
        localStorage.setItem(PENDING_LOGS_STORAGE_KEY, JSON.stringify(mutations));
      }
    },
    (): StorageSaveError => "storage-write-failed",
  )();
}
