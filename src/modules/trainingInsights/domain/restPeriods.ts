/**
 * Evidence-based rest period prescriptions.
 *
 * References:
 * - Schoenfeld BJ et al. (2016). Longer Interset Rest Periods Enhance Muscle Strength and Hypertrophy in Resistance-Trained Men.
 * - ACSM Guidelines for Exercise Testing and Prescription.
 */

/**
 * Clamps the provided rest duration (in seconds) to evidence-based bounds
 * based on the target rep range. If no current rest is provided, returns
 * the minimum effective rest for the rep range.
 *
 * Rep ranges:
 * - 1-5 reps (strength): 180-300s
 * - 6-15 reps (hypertrophy): 120-180s
 * - 16-20 reps (endurance): 45-90s
 * - >20 reps (circuit/metabolic): 15-45s
 */
export function clampRestSeconds(
  targetReps: string | number | undefined,
  currentRestSeconds?: number | null,
): number {
  if (targetReps === undefined || targetReps === null) {
    return currentRestSeconds ?? 120;
  }

  const repsStr = String(targetReps);
  // Match digits to find the maximum rep count in ranges like "8-12"
  const maxRep = Math.max(...(repsStr.match(/\d+/g) || []).map(Number), 0);

  if (maxRep <= 0) {
    return currentRestSeconds ?? 120;
  }

  let minRest = 45;
  let maxRest = 300;

  if (maxRep <= 5) {
    minRest = 180;
    maxRest = 300;
  } else if (maxRep <= 15) {
    minRest = 120;
    maxRest = 180;
  } else if (maxRep <= 20) {
    minRest = 45;
    maxRest = 90;
  } else {
    minRest = 15;
    maxRest = 45;
  }

  if (typeof currentRestSeconds === "number") {
    if (currentRestSeconds < minRest) return minRest;
    if (currentRestSeconds > maxRest) return maxRest;
    return currentRestSeconds;
  }

  return minRest;
}
