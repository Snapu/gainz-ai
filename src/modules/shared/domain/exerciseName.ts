/**
 * Shared exercise-name normalization helpers used across modules.
 */
export function cleanExerciseName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Stable canonical key for case-insensitive exercise grouping/comparison.
 */
export function exerciseNameKey(name: string): string {
  return cleanExerciseName(name).toLowerCase();
}
