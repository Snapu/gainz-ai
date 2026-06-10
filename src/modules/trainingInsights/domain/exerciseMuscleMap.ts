import type { MuscleGroup } from "@/modules/sharedKernel/domain";
import { exerciseNameKey } from "@/modules/sharedKernel/domain";

// Re-export for backward compatibility
export type { MuscleGroup };

/** A secondary muscle contribution: the muscle group and a fractional credit (0–1). */
export interface SecondaryMuscleActivation {
  muscleGroup: MuscleGroup;
  /** Fraction of a set credited to this muscle (0.0–1.0). E.g. 0.5 means half a set. */
  contribution: number;
}

/** Full activation profile for an exercise: one primary muscle (full credit) + optional secondaries. */
export interface MuscleActivation {
  primaryMuscle: MuscleGroup;
  secondaryMuscles: SecondaryMuscleActivation[];
}

/**
 * Normalize an exercise name to a stable canonical key.
 * Used everywhere names are compared, grouped, or stored.
 */
export function normalizeExerciseName(name: string): string {
  return exerciseNameKey(name);
}

/** The functional category of an exercise, determining progressive overload rates. */
export type ExerciseCategory = "lower-compound" | "upper-compound" | "isolation";

/**
 * Classify an exercise based on its muscle activation profile.
 *
 * Compounds involve multi-joint movements (secondary muscles). Isolations involve single joints.
 * Lower-body compounds permit faster absolute weight progression due to larger muscle mass involved.
 *
 * Reference: ACSM (2009). Progression Models in Resistance Training for Healthy Adults.
 */
export function classifyExercise(
  exerciseName: string,
  overrideMap?: Record<string, MuscleActivation>,
): ExerciseCategory {
  const activation = getMuscleActivation(exerciseName, overrideMap);
  if (!activation) return "isolation"; // Conservative fallback

  const isCompound = activation.secondaryMuscles.length > 0;
  if (!isCompound) return "isolation";

  const hasLowerInvolvement =
    ["Quads", "Hamstrings", "Glutes"].includes(activation.primaryMuscle) ||
    activation.secondaryMuscles.some(
      (s) => ["Quads", "Hamstrings", "Glutes"].includes(s.muscleGroup) && s.contribution >= 0.5,
    );

  return hasLowerInvolvement ? "lower-compound" : "upper-compound";
}

/**
 * Returns the recommended progressive overload increment (in kg) for a given category.
 */
export function getProgressionIncrement(category: ExerciseCategory): number {
  switch (category) {
    case "lower-compound":
      return 5;
    case "upper-compound":
      return 2.5;
    case "isolation":
      return 1.25;
  }
}

/** Helper to build a MuscleActivation entry concisely. */
function act(primary: MuscleGroup, ...secondaries: [MuscleGroup, number][]): MuscleActivation {
  return {
    primaryMuscle: primary,
    secondaryMuscles: secondaries.map(([muscleGroup, contribution]) => ({
      muscleGroup,
      contribution,
    })),
  };
}

/** Default activation mapping for all known exercises. */
const DEFAULT_EXERCISE_ACTIVATION_MAP: Record<string, MuscleActivation> = {
  // Chest
  "Bench Press": act("Chest", ["Triceps", 0.5], ["Front Delts", 0.3]),
  Bankdrücken: act("Chest", ["Triceps", 0.5], ["Front Delts", 0.3]),
  "Incline Bench Press": act("Chest", ["Triceps", 0.5], ["Front Delts", 0.4]),
  Schrägbankdrücken: act("Chest", ["Triceps", 0.5], ["Front Delts", 0.4]),
  "Dumbbell Flyes": act("Chest"),
  "Incline Dumbbell Flyes": act("Chest"),
  "Cable Flyes": act("Chest"),
  "Chest Press": act("Chest", ["Triceps", 0.4], ["Front Delts", 0.3]),
  "Push-Ups": act("Chest", ["Triceps", 0.5], ["Front Delts", 0.3]),
  Liegestütze: act("Chest", ["Triceps", 0.5], ["Front Delts", 0.3]),

  // Back
  "Pull-Ups": act("Lats", ["Biceps", 0.5], ["Upper Back", 0.3]),
  Klimmzüge: act("Lats", ["Biceps", 0.5], ["Upper Back", 0.3]),
  "Barbell Row": act("Upper Back", ["Biceps", 0.4], ["Lats", 0.4]),
  Langhantelrudern: act("Upper Back", ["Biceps", 0.4], ["Lats", 0.4]),
  "Dumbbell Row": act("Upper Back", ["Biceps", 0.4], ["Lats", 0.4]),
  Kurzhantelrudern: act("Upper Back", ["Biceps", 0.4], ["Lats", 0.4]),
  "Lat Pulldown": act("Lats", ["Biceps", 0.5], ["Upper Back", 0.3]),
  Latzug: act("Lats", ["Biceps", 0.5], ["Upper Back", 0.3]),
  "Cable Row": act("Upper Back", ["Biceps", 0.4], ["Lats", 0.4]),
  "Seated Row": act("Upper Back", ["Biceps", 0.4], ["Lats", 0.4]),
  Deadlift: act("Glutes", ["Hamstrings", 0.8], ["Upper Back", 0.6], ["Lats", 0.4], ["Quads", 0.3]),
  Kreuzheben: act(
    "Glutes",
    ["Hamstrings", 0.8],
    ["Upper Back", 0.6],
    ["Lats", 0.4],
    ["Quads", 0.3],
  ),

  // Shoulders
  "Overhead Press": act("Front Delts", ["Triceps", 0.5]),
  "Shoulder Press": act("Front Delts", ["Triceps", 0.5]),
  Schulterdrücken: act("Front Delts", ["Triceps", 0.5]),
  "Langhantel Schulterdrücken": act("Front Delts", ["Triceps", 0.5]),
  "Lateral Raises": act("Side Delts"),
  Seitheben: act("Side Delts"),
  "Seitheben (Kurzhantel)": act("Side Delts"),
  "Front Raises": act("Front Delts"),
  "Face Pulls": act("Upper Back"),
  "Reverse Flyes": act("Upper Back"),

  // Quads
  Squat: act("Quads", ["Glutes", 0.6], ["Hamstrings", 0.1]),
  Kniebeuge: act("Quads", ["Glutes", 0.6], ["Hamstrings", 0.1]),
  "Front Squat": act("Quads", ["Glutes", 0.4]),
  "Leg Press": act("Quads", ["Glutes", 0.4], ["Hamstrings", 0.1]),
  Beinpresse: act("Quads", ["Glutes", 0.4], ["Hamstrings", 0.1]),
  "Leg Extension": act("Quads"),
  Lunges: act("Quads", ["Glutes", 0.6], ["Hamstrings", 0.2]),
  Ausfallschritte: act("Quads", ["Glutes", 0.6], ["Hamstrings", 0.2]),
  "Bulgarian Split Squat": act("Quads", ["Glutes", 0.7], ["Hamstrings", 0.2]),

  // Hamstrings
  "Romanian Deadlift": act("Hamstrings", ["Glutes", 0.7], ["Upper Back", 0.4]),
  "Rumänisches Kreuzheben": act("Hamstrings", ["Glutes", 0.7], ["Upper Back", 0.4]),
  "Leg Curl": act("Hamstrings"),
  "Nordic Curl": act("Hamstrings"),
  "Good Mornings": act("Hamstrings", ["Upper Back", 0.5]),

  // Biceps
  "Bicep Curl": act("Biceps"),
  Bizepscurls: act("Biceps"),
  "Hammer Curl": act("Biceps"),
  "Preacher Curl": act("Biceps"),

  // Triceps
  "Tricep Extension": act("Triceps"),
  "Tricep Pushdown": act("Triceps"),
  "Skull Crushers": act("Triceps"),
  Dips: act("Triceps", ["Chest", 0.5], ["Front Delts", 0.2]),
  "Dips an den Ringen": act("Triceps", ["Chest", 0.5], ["Front Delts", 0.2]),

  // Glutes
  "Hip Thrust": act("Glutes", ["Hamstrings", 0.5]),
  "Glute Bridge": act("Glutes", ["Hamstrings", 0.4]),
  "Cable Kickback": act("Glutes"),

  // Abs
  Crunches: act("Abs"),
  Planks: act("Abs"),
  "Hanging Leg Raise": act("Abs"),
  "Cable Crunch": act("Abs"),

  // Calves
  "Calf Raise": act("Calves"),
  Wadenheben: act("Calves"),
};

/**
 * Look up the full muscle activation profile for an exercise name.
 * Uses case-insensitive matching with an optional override map.
 */
export function getMuscleActivation(
  exerciseName: string,
  overrideMap?: Record<string, MuscleActivation>,
): MuscleActivation | null {
  const normalized = normalizeExerciseName(exerciseName);

  // Check override map first
  if (overrideMap) {
    if (overrideMap[exerciseName]) return overrideMap[exerciseName];
    for (const [key, activation] of Object.entries(overrideMap)) {
      if (normalizeExerciseName(key) === normalized) return activation;
    }
  }

  // Check default map by exact key
  if (DEFAULT_EXERCISE_ACTIVATION_MAP[exerciseName])
    return DEFAULT_EXERCISE_ACTIVATION_MAP[exerciseName];

  // Check default map by normalized key
  for (const [key, activation] of Object.entries(DEFAULT_EXERCISE_ACTIVATION_MAP)) {
    if (normalizeExerciseName(key) === normalized) return activation;
  }

  return null;
}
