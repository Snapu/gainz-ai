import type { ExerciseMuscleMapRepository } from "@/modules/sharedKernel/application";

const STORAGE_KEY = "exerciseMuscleMap";

export function loadStoredMuscleMapInfra(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function saveStoredMuscleMapInfra(map: Record<string, unknown>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage full or unavailable - degrade gracefully
  }
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
