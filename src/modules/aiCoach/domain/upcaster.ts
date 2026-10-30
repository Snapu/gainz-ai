/**
 * TODO(TechDebt): Legacy Parsing Functions
 * The functions below (`isDuration`, `parseFirstRep`, `splitReps`) are only kept around
 * to support upcasting old plans that used `targetReps: "30s"`.
 * Once all active plans have been migrated to the new explicit `targetDurationSeconds`
 * and `targetDistanceMeters` schema, this entire file can be deleted.
 */

/**
 * Determines if a reps string represents a duration.
 */
function isDuration(reps: string): boolean {
  const lower = reps.toLowerCase();
  return (
    lower.includes("sec") ||
    lower.includes("min") ||
    lower.includes("hr") ||
    lower.includes("time") ||
    lower.includes("hold") ||
    /^[\d\s.,-]+s$/.test(lower)
  );
}

/**
 * Extracts the upper bound of a rep range from strings like "8-12" → 12, "10" → 10.
 */
function parseFirstRep(targetReps: string): number | undefined {
  const rangeMatch = targetReps.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch?.[2]) return parseInt(rangeMatch[2], 10);
  const singleMatch = targetReps.match(/(\d+)/);
  return singleMatch?.[1] ? parseInt(singleMatch[1], 10) : undefined;
}

/**
 * Splits a reps string like "30 secs" into `{ value: "30", unit: "secs" }`.
 */
function splitReps(reps: string): { value: string; unit: string } {
  const match = reps.match(/^([\d\s.,-]+)(.*)$/);
  if (match && match[1].trim() !== "") {
    return { value: match[1].trim(), unit: match[2].trim() };
  }
  return { value: reps, unit: "" };
}

function tryParseDistanceMeters(targetReps: string): number | undefined {
  const lower = targetReps.toLowerCase().trim();
  if (/m$/.test(lower) && !lower.includes("min") && !lower.includes("time")) {
    return parseFirstRep(targetReps);
  }
  return undefined;
}

function tryParseDurationSeconds(targetReps: string): number | undefined {
  if (!isDuration(targetReps)) return undefined;

  const parsed = parseFirstRep(targetReps);
  if (parsed === undefined) return undefined;

  const unit = splitReps(targetReps).unit.toLowerCase();
  if (unit.includes("hr")) return parsed * 3600;
  if (unit.includes("min") || unit === "m") return parsed * 60;
  return parsed;
}

/**
 * Upcaster: Converts legacy stringly-typed duration/distance in `targetReps`
 * into the new explicit numeric fields (`targetDurationSeconds`, `targetDistanceMeters`).
 * Does not mutate the original object.
 *
 * TODO(TechDebt): Remove this upcaster once all legacy plans in LocalStorage
 * have been migrated, and we are confident the AI will not hallucinate string-based durations.
 */
export function upcastLegacyExercise<
  T extends { targetReps?: string; targetDurationSeconds?: number; targetDistanceMeters?: number },
>(ex: T): T & { targetDurationSeconds?: number; targetDistanceMeters?: number } {
  if (!ex.targetReps) return ex;
  if (ex.targetDurationSeconds != null || ex.targetDistanceMeters != null) return ex;

  const distanceMeters = tryParseDistanceMeters(ex.targetReps);
  if (distanceMeters !== undefined) {
    return { ...ex, targetDistanceMeters: distanceMeters, targetReps: undefined };
  }

  const durationSeconds = tryParseDurationSeconds(ex.targetReps);
  if (durationSeconds !== undefined) {
    return { ...ex, targetDurationSeconds: durationSeconds, targetReps: undefined };
  }

  return ex;
}
