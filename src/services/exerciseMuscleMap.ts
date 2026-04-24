import * as Sentry from "@sentry/vue";
import type { MuscleActivation, MuscleGroup, SecondaryMuscleActivation } from "./trainingScience";

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

/** Normalize exercise names for consistent lookup (lowercase + trim). */
function normalizeKey(name: string): string {
  return name.trim().toLowerCase();
}

function isValidMuscleGroup(value: string): value is MuscleGroup {
  return VALID_MUSCLE_GROUPS.has(value);
}

/** Load the learned map from localStorage, migrating legacy entries on the fly. */
function loadMap(): StoredMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};

    // Migrate legacy entries that have the old { muscleGroup, updatedAt } shape
    const result: StoredMap = {};
    for (const [key, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if ("primaryMuscle" in e) {
        // Already new format
        result[key] = e as unknown as StoredEntry;
      } else if ("muscleGroup" in e) {
        // Legacy format — migrate gracefully
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
 * Learn exercise→muscle activation mappings from an AI response.
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
    /** @deprecated Legacy field — use primaryMuscle instead. */
    muscleGroup?: string;
  }>,
): void {
  if (exercises.length === 0) return;

  const map = loadMap();
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
      const contribution = typeof sec.contribution === "number"
        ? Math.min(1, Math.max(0, sec.contribution))
        : 0.5; // default contribution when AI omits it
      secondaryMuscles.push({ muscleGroup: sec.muscleGroup, contribution });
    }

    const key = normalizeKey(ex.exerciseName);
    if (!key) continue;

    map[key] = { primaryMuscle: rawPrimary, secondaryMuscles, updatedAt: now };
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
 * Get the learned exercise→activation map, formatted for use as
 * the `overrideMap` parameter in `calculateTrainingInsights()`.
 *
 * Returns the map keyed by normalized (lowercase) exercise name.
 */
export function getLearnedMuscleMap(): Record<string, MuscleActivation> {
  const stored = loadMap();
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
export function getLearnedMapSize(): number {
  return Object.keys(loadMap()).length;
}

/**
 * Clear the entire learned map (for testing or reset).
 */
export function clearLearnedMap(): void {
  localStorage.removeItem(STORAGE_KEY);
}
