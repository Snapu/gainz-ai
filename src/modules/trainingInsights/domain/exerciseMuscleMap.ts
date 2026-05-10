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
  "Bench Press": act("Chest", ["Triceps", 0.5], ["Shoulders", 0.3]),
  Bankdrücken: act("Chest", ["Triceps", 0.5], ["Shoulders", 0.3]),
  "Incline Bench Press": act("Chest", ["Triceps", 0.5], ["Shoulders", 0.4]),
  Schrägbankdrücken: act("Chest", ["Triceps", 0.5], ["Shoulders", 0.4]),
  "Dumbbell Flyes": act("Chest"),
  "Incline Dumbbell Flyes": act("Chest"),
  "Cable Flyes": act("Chest"),
  "Chest Press": act("Chest", ["Triceps", 0.4], ["Shoulders", 0.3]),
  "Push-Ups": act("Chest", ["Triceps", 0.5], ["Shoulders", 0.3]),
  Liegestütze: act("Chest", ["Triceps", 0.5], ["Shoulders", 0.3]),

  // Back
  "Pull-Ups": act("Back", ["Biceps", 0.5]),
  Klimmzüge: act("Back", ["Biceps", 0.5]),
  "Barbell Row": act("Back", ["Biceps", 0.4]),
  Langhantelrudern: act("Back", ["Biceps", 0.4]),
  "Dumbbell Row": act("Back", ["Biceps", 0.4]),
  Kurzhantelrudern: act("Back", ["Biceps", 0.4]),
  "Lat Pulldown": act("Back", ["Biceps", 0.5]),
  Latzug: act("Back", ["Biceps", 0.5]),
  "Cable Row": act("Back", ["Biceps", 0.4]),
  "Seated Row": act("Back", ["Biceps", 0.4]),
  Deadlift: act("Back", ["Hamstrings", 0.7], ["Glutes", 0.6], ["Quads", 0.3]),
  Kreuzheben: act("Back", ["Hamstrings", 0.7], ["Glutes", 0.6], ["Quads", 0.3]),

  // Shoulders
  "Overhead Press": act("Shoulders", ["Triceps", 0.5]),
  "Shoulder Press": act("Shoulders", ["Triceps", 0.5]),
  Schulterdrücken: act("Shoulders", ["Triceps", 0.5]),
  "Langhantel Schulterdrücken": act("Shoulders", ["Triceps", 0.5]),
  "Lateral Raises": act("Shoulders"),
  Seitheben: act("Shoulders"),
  "Seitheben (Kurzhantel)": act("Shoulders"),
  "Front Raises": act("Shoulders"),
  "Face Pulls": act("Shoulders"),
  "Reverse Flyes": act("Shoulders"),

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
  "Romanian Deadlift": act("Hamstrings", ["Glutes", 0.7], ["Back", 0.4]),
  "Rumänisches Kreuzheben": act("Hamstrings", ["Glutes", 0.7], ["Back", 0.4]),
  "Leg Curl": act("Hamstrings"),
  "Nordic Curl": act("Hamstrings"),
  "Good Mornings": act("Hamstrings", ["Back", 0.5]),

  // Biceps
  "Bicep Curl": act("Biceps"),
  Bizepscurls: act("Biceps"),
  "Hammer Curl": act("Biceps"),
  "Preacher Curl": act("Biceps"),

  // Triceps
  "Tricep Extension": act("Triceps"),
  "Tricep Pushdown": act("Triceps"),
  "Skull Crushers": act("Triceps"),
  Dips: act("Triceps", ["Chest", 0.5], ["Shoulders", 0.2]),
  "Dips an den Ringen": act("Triceps", ["Chest", 0.5], ["Shoulders", 0.2]),

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
