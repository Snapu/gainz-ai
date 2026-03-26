import * as Sentry from "@sentry/vue";
import type { MuscleGroup } from "./trainingScience";

const STORAGE_KEY = "exerciseMuscleMap";
const MAX_ENTRIES = 200;

/** All valid muscle groups for validation. */
const VALID_MUSCLE_GROUPS: ReadonlySet<string> = new Set<MuscleGroup>([
  "Chest",
  "Back",
  "Quads",
  "Hamstrings",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Abs",
  "Calves",
  "Glutes",
]);

interface StoredEntry {
  muscleGroup: MuscleGroup;
  updatedAt: number; // epoch ms, used for eviction
}

type StoredMap = Record<string, StoredEntry>;

/** Normalize exercise names for consistent lookup (lowercase + trim). */
function normalizeKey(name: string): string {
  return name.trim().toLowerCase();
}

function isValidMuscleGroup(value: string): value is MuscleGroup {
  return VALID_MUSCLE_GROUPS.has(value);
}

/** Load the learned map from localStorage. */
function loadMap(): StoredMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as StoredMap;
  } catch {
    return {};
  }
}

/** Save the map to localStorage. */
function saveMap(map: StoredMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage full or unavailable — degrade gracefully
  }
}

/** Evict oldest entries if map exceeds MAX_ENTRIES. */
function evictIfNeeded(map: StoredMap): StoredMap {
  const keys = Object.keys(map);
  if (keys.length <= MAX_ENTRIES) return map;

  // Sort by updatedAt ascending (oldest first)
  const sorted = keys.sort((a, b) => (map[a]?.updatedAt ?? 0) - (map[b]?.updatedAt ?? 0));

  // Remove oldest until we're at the limit
  const toRemove = sorted.slice(0, keys.length - MAX_ENTRIES);
  for (const key of toRemove) {
    delete map[key];
  }

  Sentry.addBreadcrumb({
    category: "muscle-map",
    message: `Evicted ${toRemove.length} oldest entries (cap: ${MAX_ENTRIES})`,
    level: "info",
  });

  return map;
}

/**
 * Learn exercise→muscleGroup mappings from an AI response.
 * Call this after each successful AI response.
 *
 * @param exercises - Array of { exerciseName, muscleGroup? } from the AI response
 */
export function learnFromAiResponse(
  exercises: Array<{ exerciseName: string; muscleGroup?: string }>,
): void {
  if (exercises.length === 0) return;

  const map = loadMap();
  const now = Date.now();
  let learnedCount = 0;
  let skippedCount = 0;

  for (const ex of exercises) {
    if (!ex.muscleGroup || !ex.exerciseName) continue;
    if (!isValidMuscleGroup(ex.muscleGroup)) {
      skippedCount++;
      Sentry.addBreadcrumb({
        category: "muscle-map",
        message: `Rejected invalid muscleGroup "${ex.muscleGroup}" for "${ex.exerciseName}"`,
        level: "warning",
      });
      continue;
    }

    const key = normalizeKey(ex.exerciseName);
    if (!key) continue;

    map[key] = { muscleGroup: ex.muscleGroup, updatedAt: now };
    learnedCount++;
  }

  if (learnedCount > 0) {
    saveMap(evictIfNeeded(map));
    Sentry.addBreadcrumb({
      category: "muscle-map",
      message: `Learned ${learnedCount} mappings, skipped ${skippedCount}, total: ${Object.keys(map).length}`,
      level: "info",
      data: {
        learnedCount,
        skippedCount,
        totalEntries: Object.keys(map).length,
      },
    });
  }
}

/**
 * Get the learned exercise→muscleGroup map, formatted for use as
 * the `overrideMap` parameter in `calculateTrainingInsights()`.
 *
 * Returns the map keyed by normalized (lowercase) exercise name.
 */
export function getLearnedMuscleMap(): Record<string, MuscleGroup> {
  const stored = loadMap();
  const result: Record<string, MuscleGroup> = {};

  for (const [key, entry] of Object.entries(stored)) {
    if (entry?.muscleGroup && isValidMuscleGroup(entry.muscleGroup)) {
      result[key] = entry.muscleGroup;
    }
  }

  return result;
}

/**
 * Get the number of entries in the learned map (for diagnostics).
 */
export function getLearnedMapSize(): number {
  return Object.keys(loadMap()).length;
}

/**
 * Clear the entire learned map (for testing or reset).
 */
export function clearLearnedMap(): void {
  localStorage.removeItem(STORAGE_KEY);
}
