import { ok, Result } from "neverthrow";
import type { ExerciseMuscleMapRepository } from "@/modules/sharedKernel/application";

const STORAGE_KEY = "exerciseMuscleMap";

const readStoredMap = Result.fromThrowable(
  () => localStorage.getItem(STORAGE_KEY),
  () => "storage-read-failed" as const,
);

const parseStoredMap = Result.fromThrowable(JSON.parse, () => "storage-parse-failed" as const);

const persistStoredMap = Result.fromThrowable(
  (map: Record<string, unknown>) => localStorage.setItem(STORAGE_KEY, JSON.stringify(map)),
  () => "storage-save-failed" as const,
);

export function loadStoredMuscleMapInfra(): Record<string, unknown> {
  return readStoredMap()
    .andThen((raw) => {
      if (!raw) return ok<unknown, "storage-parse-failed">({});
      return parseStoredMap(raw);
    })
    .map((parsed) => {
      if (!parsed || typeof parsed !== "object") return {};
      return parsed as Record<string, unknown>;
    })
    .unwrapOr({});
}

export function saveStoredMuscleMapInfra(map: Record<string, unknown>): void {
  void persistStoredMap(map);
}

export function clearStoredMuscleMapInfra(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function createExerciseMuscleMapRepository(): ExerciseMuscleMapRepository {
  return {
    load: loadStoredMuscleMapInfra,
    save: saveStoredMuscleMapInfra,
    clear: clearStoredMuscleMapInfra,
  };
}
