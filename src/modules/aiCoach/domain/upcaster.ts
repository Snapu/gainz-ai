import type { PlannedExercise } from "./types";

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
>(ex: T): T {
  if (!ex.targetReps) return ex;
  if (ex.targetDurationSeconds != null || ex.targetDistanceMeters != null) return ex;

  const lower = ex.targetReps.toLowerCase().trim();

  // Distance ("500m") - ensure we don't catch "30min" or "time"
  if (/m$/.test(lower) && !lower.includes("min") && !lower.includes("time")) {
    const parsed = parseFirstRep(ex.targetReps);
    if (parsed) {
      return { ...ex, targetDistanceMeters: parsed, targetReps: undefined };
    }
  }

  // Duration ("30s", "1 min")
  if (isDuration(ex.targetReps)) {
    const parsed = parseFirstRep(ex.targetReps);
    if (parsed !== undefined) {
      const unit = splitReps(ex.targetReps).unit.toLowerCase();
      let duration: number;
      if (unit.includes("hr")) duration = parsed * 3600;
      else if (unit.includes("min") || unit === "m") duration = parsed * 60;
      else duration = parsed; // seconds

      return { ...ex, targetDurationSeconds: duration, targetReps: undefined };
    }
  }

  return ex;
}
