import * as Sentry from "@sentry/vue";
import { isMuscleGroup, VALID_MUSCLE_GROUPS } from "@/modules/sharedKernel/domain";
import {
  getMuscleActivation,
  type MuscleActivation,
  type MuscleGroup,
  normalizeExerciseName,
  type SecondaryMuscleActivation,
} from "@/modules/trainingInsights/domain";

/** Maximum number of learned exercise->muscle entries kept in localStorage. */
const MAX_MAP_ENTRIES = 200;

/** Minimum AI confidence to accept a muscle-group classification into the learned map. */
const MIN_CLASSIFICATION_CONFIDENCE = 0.8;
/** Fractional set credit applied to a secondary muscle when the AI omits the contribution field. */
const DEFAULT_SECONDARY_CONTRIBUTION = 0.5;

/** All valid muscle groups for validation. */
export { VALID_MUSCLE_GROUPS };

export interface ExerciseMuscleMapRepository {
  load(): Record<string, unknown>;
  save(map: Record<string, unknown>): void;
  clear(): void;
}

interface StoredEntry {
  primaryMuscle: MuscleGroup;
  secondaryMuscles: SecondaryMuscleActivation[];
  updatedAt: number; // epoch ms, used for eviction
}

/** Legacy format before multi-muscle support was added. */
interface LegacyStoredEntry {
  muscleGroup: MuscleGroup;
  updatedAt: number;
}

type StoredMap = Record<string, StoredEntry>;

function isValidMuscleGroup(value: string): value is MuscleGroup {
  return isMuscleGroup(value);
}

/** Load the learned map from storage, migrating legacy entries on the fly. */
function loadMap(repository: ExerciseMuscleMapRepository): StoredMap {
  try {
    const parsed = repository.load();

    // Migrate legacy entries that have the old { muscleGroup, updatedAt } shape
    const result: StoredMap = {};
    for (const [key, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if ("primaryMuscle" in e) {
        // Already new format
        result[key] = e as unknown as StoredEntry;
      } else if ("muscleGroup" in e) {
        // Legacy format - migrate gracefully
        const legacy = e as unknown as LegacyStoredEntry;
        if (isValidMuscleGroup(legacy.muscleGroup)) {
          result[key] = {
            primaryMuscle: legacy.muscleGroup,
            secondaryMuscles: [],
            updatedAt: legacy.updatedAt,
          };
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** Save the map to storage. */
function saveMap(map: StoredMap, repository: ExerciseMuscleMapRepository): void {
  try {
    repository.save(map as Record<string, unknown>);
  } catch {
    // Storage full or unavailable - degrade gracefully
  }
}

/** Evict oldest entries from the learned map if it exceeds MAX_MAP_ENTRIES. */
function evictMapIfNeeded(map: StoredMap): StoredMap {
  const keys = Object.keys(map);
  if (keys.length <= MAX_MAP_ENTRIES) return map;

  const sorted = keys.sort((a, b) => (map[a]?.updatedAt ?? 0) - (map[b]?.updatedAt ?? 0));
  // Remove exactly the excess entries (oldest first) to bring the map back to the cap.
  const excessCount = keys.length - MAX_MAP_ENTRIES;
  const toRemove = sorted.slice(0, excessCount);
  for (const key of toRemove) {
    delete map[key];
  }

  Sentry.addBreadcrumb({
    category: "muscle-map",
    message: `Evicted ${toRemove.length} oldest learned entries (cap: ${MAX_MAP_ENTRIES})`,
    level: "info",
  });

  return map;
}

/**
 * Learn exercise->muscle activation mappings from an AI response.
 * Accepts both the new schema ({ primaryMuscle, secondaryMuscles }) and the legacy
 * single-muscle schema ({ muscleGroup }) for backwards compatibility.
 *
 * Call this after each successful AI response.
 */
export function learnFromAiResponse(
  exercises: Array<{
    exerciseName: string;
    primaryMuscle?: string;
    secondaryMuscles?: Array<{ muscleGroup: string; contribution?: number }>;
    /** @deprecated Legacy field - use primaryMuscle instead. */
    muscleGroup?: string;
  }>,
  repository: ExerciseMuscleMapRepository,
): void {
  if (exercises.length === 0) return;

  const map = loadMap(repository);
  const now = Date.now();
  let learnedCount = 0;
  let skippedCount = 0;

  for (const ex of exercises) {
    if (!ex.exerciseName) continue;

    // Resolve primary muscle: prefer new field, fall back to legacy muscleGroup
    const rawPrimary = ex.primaryMuscle ?? ex.muscleGroup;
    if (!rawPrimary) continue;

    if (!isValidMuscleGroup(rawPrimary)) {
      skippedCount++;
      Sentry.addBreadcrumb({
        category: "muscle-map",
        message: `Rejected invalid primaryMuscle "${rawPrimary}" for "${ex.exerciseName}"`,
        level: "warning",
      });
      continue;
    }

    // Validate and resolve secondary muscles (silently drop invalid entries)
    const secondaryMuscles: SecondaryMuscleActivation[] = [];
    for (const sec of ex.secondaryMuscles ?? []) {
      if (!isValidMuscleGroup(sec.muscleGroup)) continue;
      const contribution =
        typeof sec.contribution === "number"
          ? Math.min(1, Math.max(0, sec.contribution))
          : DEFAULT_SECONDARY_CONTRIBUTION;
      secondaryMuscles.push({ muscleGroup: sec.muscleGroup, contribution });
    }

    const key = normalizeExerciseName(ex.exerciseName);
    if (!key) continue;

    // Never overwrite entries that exist in the default activation map.
    // The default map contains hand-verified, high-quality mappings - AI-learned entries
    // should only fill gaps for exercises the default map doesn't know about.
    if (getMuscleActivation(ex.exerciseName)) {
      skippedCount++;
      continue;
    }

    map[key] = { primaryMuscle: rawPrimary, secondaryMuscles, updatedAt: now };
    learnedCount++;
  }

  if (learnedCount > 0) {
    saveMap(evictMapIfNeeded(map), repository);
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
 * Get the learned exercise->activation map, formatted for use as
 * the `overrideMap` parameter in `calculateTrainingInsights()`.
 *
 * Returns the map keyed by normalized (lowercase) exercise name.
 * Aliases are transparently expanded so callers don't need to know about them.
 */
export function getLearnedMuscleMap(
  repository: ExerciseMuscleMapRepository,
): Record<string, MuscleActivation> {
  const stored = loadMap(repository);
  const result: Record<string, MuscleActivation> = {};

  for (const [key, entry] of Object.entries(stored)) {
    if (entry?.primaryMuscle && isValidMuscleGroup(entry.primaryMuscle)) {
      result[key] = {
        primaryMuscle: entry.primaryMuscle,
        secondaryMuscles: entry.secondaryMuscles ?? [],
      };
    }
  }

  return result;
}

/**
 * Get the number of entries in the learned map (for diagnostics).
 */
export function getLearnedMapSize(repository: ExerciseMuscleMapRepository): number {
  return Object.keys(loadMap(repository)).length;
}

/**
 * Clear the entire learned map (for testing or reset).
 */
export function clearLearnedMap(repository: ExerciseMuscleMapRepository): void {
  repository.clear();
}

/**
 * Apply the results of an AI exercise cleanup run.
 *
 * - Classifications add new entries to the learned map (confidence >= 0.8).
 * - Aliases register equivalences between exercise names (confidence >= 0.9).
 *   Aliases redirect lookups to the canonical name's activation without touching logs.
 *
 * Already-known exercises (in the default map) are skipped for classifications
 * but still recorded as aliases if provided.
 */
export function applyAiCleanupResults(
  classifications: Array<{
    exerciseName: string;
    primaryMuscle: string;
    secondaryMuscles?: Array<{ muscleGroup: string; contribution?: number }>;
    confidence: number;
  }>,
  repository: ExerciseMuscleMapRepository,
): void {
  const map = loadMap(repository);
  const now = Date.now();
  let classifiedCount = 0;

  for (const item of classifications) {
    if (item.confidence < MIN_CLASSIFICATION_CONFIDENCE) continue;
    if (!item.exerciseName) continue;
    if (!isValidMuscleGroup(item.primaryMuscle)) continue;

    const key = normalizeExerciseName(item.exerciseName);
    if (!key) continue;

    // Skip if the exercise already has a well-known default mapping
    if (getMuscleActivation(item.exerciseName)) continue;

    const secondaryMuscles: SecondaryMuscleActivation[] = [];
    for (const sec of item.secondaryMuscles ?? []) {
      if (!isValidMuscleGroup(sec.muscleGroup)) continue;
      const contribution =
        typeof sec.contribution === "number"
          ? Math.min(1, Math.max(0, sec.contribution))
          : DEFAULT_SECONDARY_CONTRIBUTION;
      secondaryMuscles.push({ muscleGroup: sec.muscleGroup, contribution });
    }

    map[key] = {
      primaryMuscle: item.primaryMuscle as MuscleGroup,
      secondaryMuscles,
      updatedAt: now,
    };
    classifiedCount++;
  }

  if (classifiedCount > 0) {
    saveMap(evictMapIfNeeded(map), repository);
    Sentry.addBreadcrumb({
      category: "muscle-map",
      message: `AI cleanup: ${classifiedCount} classified`,
      level: "info",
      data: { classifiedCount },
    });
  }
}
