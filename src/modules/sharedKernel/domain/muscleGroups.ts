export type MuscleGroup =
  | "Chest"
  | "Lats"
  | "Upper Back"
  | "Front Delts"
  | "Side Delts"
  | "Quads"
  | "Hamstrings"
  | "Glutes"
  | "Biceps"
  | "Triceps"
  | "Abs"
  | "Calves";

export const VALID_MUSCLE_GROUPS: ReadonlySet<MuscleGroup> = new Set<MuscleGroup>([
  "Chest",
  "Lats",
  "Upper Back",
  "Front Delts",
  "Side Delts",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Biceps",
  "Triceps",
  "Abs",
  "Calves",
]);

export function isMuscleGroup(value: unknown): value is MuscleGroup {
  return typeof value === "string" && VALID_MUSCLE_GROUPS.has(value as MuscleGroup);
}
