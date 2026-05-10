export type MuscleGroup =
  | "Chest"
  | "Back"
  | "Quads"
  | "Hamstrings"
  | "Shoulders"
  | "Biceps"
  | "Triceps"
  | "Abs"
  | "Calves"
  | "Glutes";

export const VALID_MUSCLE_GROUPS: ReadonlySet<MuscleGroup> = new Set<MuscleGroup>([
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

export function isMuscleGroup(value: unknown): value is MuscleGroup {
  return typeof value === "string" && VALID_MUSCLE_GROUPS.has(value as MuscleGroup);
}
