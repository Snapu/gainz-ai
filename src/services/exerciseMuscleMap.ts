import * as Sentry from "@sentry/vue";
import type { MuscleActivation, MuscleGroup, SecondaryMuscleActivation } from "./trainingScience";
import { getMuscleActivation, normalizeExerciseName } from "./trainingScience";

const STORAGE_KEY = "exerciseMuscleMap";
const ALIAS_STORAGE_KEY = "exerciseMuscleAliases";

/** Maximum number of learned exercise→muscle entries kept in localStorage. */
const MAX_MAP_ENTRIES = 200;
/** Maximum number of alias entries kept in localStorage. */
const MAX_ALIAS_ENTRIES = 500;

/** Minimum AI confidence to accept a muscle-group classification into the learned map. */
const MIN_CLASSIFICATION_CONFIDENCE = 0.8;
/** Minimum AI confidence to accept an exercise alias (higher bar — aliases redirect all lookups). */
const MIN_ALIAS_CONFIDENCE = 0.9;
/** Fractional set credit applied to a secondary muscle when the AI omits the contribution field. */
const DEFAULT_SECONDARY_CONTRIBUTION = 0.5;

/** All valid muscle groups for validation. */
export const VALID_MUSCLE_GROUPS: ReadonlySet<string> = new Set<MuscleGroup>([
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

/**
 * Alias map: maps normalized alias keys to normalized canonical keys.
 * e.g. { "bankdrücken": "bench press" }
 * Applied during getLearnedMuscleMap() expansion so all callers benefit transparently.
 */
type AliasMap = Record<string, string>;

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

/** Load the alias map from localStorage. */
function loadAliasMap(): AliasMap {
  try {
    const raw = localStorage.getItem(ALIAS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as AliasMap;
  } catch {
    return {};
  }
}

/** Save the alias map to localStorage. */
function saveAliasMap(aliases: AliasMap): void {
  try {
    localStorage.setItem(ALIAS_STORAGE_KEY, JSON.stringify(aliases));
  } catch {
    // Storage full or unavailable — degrade gracefully
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

/** Evict oldest entries from the alias map if it exceeds MAX_ALIAS_ENTRIES. */
function evictAliasIfNeeded(aliases: AliasMap): AliasMap {
  const keys = Object.keys(aliases);
  if (keys.length <= MAX_ALIAS_ENTRIES) return aliases;

  // String-keyed objects maintain insertion order per the ES2015+ spec, so slicing
  // the front of the key list removes the oldest-inserted entries first.
  const excessCount = keys.length - MAX_ALIAS_ENTRIES;
  const toRemove = keys.slice(0, excessCount);
  for (const key of toRemove) {
    delete aliases[key];
  }

  Sentry.addBreadcrumb({
    category: "muscle-map",
    message: `Evicted ${toRemove.length} oldest alias entries (cap: ${MAX_ALIAS_ENTRIES})`,
    level: "info",
  });

  return aliases;
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
      const contribution =
        typeof sec.contribution === "number"
          ? Math.min(1, Math.max(0, sec.contribution))
          : DEFAULT_SECONDARY_CONTRIBUTION;
      secondaryMuscles.push({ muscleGroup: sec.muscleGroup, contribution });
    }

    const key = normalizeExerciseName(ex.exerciseName);
    if (!key) continue;

    // Never overwrite entries that exist in the default activation map.
    // The default map contains hand-verified, high-quality mappings — AI-learned entries
    // should only fill gaps for exercises the default map doesn't know about.
    if (getMuscleActivation(ex.exerciseName)) {
      skippedCount++;
      continue;
    }

    map[key] = { primaryMuscle: rawPrimary, secondaryMuscles, updatedAt: now };
    learnedCount++;
  }

  if (learnedCount > 0) {
    saveMap(evictMapIfNeeded(map));
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
 * Aliases are transparently expanded so callers don't need to know about them.
 */
export function getLearnedMuscleMap(): Record<string, MuscleActivation> {
  const stored = loadMap();
  const aliases = loadAliasMap();
  const result: Record<string, MuscleActivation> = {};

  for (const [key, entry] of Object.entries(stored)) {
    if (entry?.primaryMuscle && isValidMuscleGroup(entry.primaryMuscle)) {
      result[key] = {
        primaryMuscle: entry.primaryMuscle,
        secondaryMuscles: entry.secondaryMuscles ?? [],
      };
    }
  }

  // Expand aliases: for each alias, copy the canonical activation to the alias key.
  // This allows lookup by any known alias without the caller needing to resolve it.
  for (const [aliasKey, canonicalKey] of Object.entries(aliases)) {
    if (result[aliasKey]) continue; // already has its own entry
    const canonical = result[canonicalKey] ?? getMuscleActivation(canonicalKey);
    if (canonical) result[aliasKey] = canonical;
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
  localStorage.removeItem(ALIAS_STORAGE_KEY);
}

/**
 * Apply the results of an AI exercise cleanup run.
 *
 * - Classifications add new entries to the learned map (confidence ≥ 0.8).
 * - Aliases register equivalences between exercise names (confidence ≥ 0.9).
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
  aliases: Array<{
    exerciseName: string;
    canonicalName: string;
    confidence: number;
  }>,
): void {
  const map = loadMap();
  const aliasMap = loadAliasMap();
  const now = Date.now();
  let classifiedCount = 0;
  let aliasCount = 0;

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

  for (const item of aliases) {
    if (item.confidence < MIN_ALIAS_CONFIDENCE) continue;
    if (!item.exerciseName || !item.canonicalName) continue;

    const aliasKey = normalizeExerciseName(item.exerciseName);
    if (!aliasKey) continue;

    // Collapse alias chains: if the requested canonical is itself already an alias,
    // follow it to its final target so we never create multi-hop chains (A→B→C
    // becomes A→C directly, which resolves reliably with a single lookup).
    let resolvedCanonical = normalizeExerciseName(item.canonicalName);
    if (!resolvedCanonical) continue;

    // Pre-populate visited with aliasKey so a chain that loops back to the alias
    // itself (e.g. "foo" → "bar" → "foo") is detected as a cycle.
    const visited = new Set<string>([aliasKey]);
    while (!visited.has(resolvedCanonical) && aliasMap[resolvedCanonical]) {
      visited.add(resolvedCanonical);
      resolvedCanonical = aliasMap[resolvedCanonical];
    }

    // Skip self-aliases after chain collapse (can happen when the chain is cyclic).
    if (aliasKey === resolvedCanonical) continue;

    // Only persist if the resolved canonical actually maps to a known activation.
    // Dead aliases (pointing at an exercise with no activation) waste storage and
    // will never improve any lookup result.
    const hasActivation =
      !!getMuscleActivation(resolvedCanonical) || !!map[resolvedCanonical];
    if (!hasActivation) continue;

    aliasMap[aliasKey] = resolvedCanonical;
    aliasCount++;
  }

  if (classifiedCount > 0) saveMap(evictMapIfNeeded(map));
  if (aliasCount > 0) saveAliasMap(evictAliasIfNeeded(aliasMap));

  if (classifiedCount > 0 || aliasCount > 0) {
    Sentry.addBreadcrumb({
      category: "muscle-map",
      message: `AI cleanup: ${classifiedCount} classified, ${aliasCount} aliases added`,
      level: "info",
      data: { classifiedCount, aliasCount },
    });
  }
}
