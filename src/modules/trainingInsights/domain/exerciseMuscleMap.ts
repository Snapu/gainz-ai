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
  "Dumbbell Bench Press": act("Chest", ["Triceps", 0.5], ["Front Delts", 0.3]),
  "Kurzhantel Bankdrücken": act("Chest", ["Triceps", 0.5], ["Front Delts", 0.3]),
  "Incline Bench Press": act("Chest", ["Triceps", 0.5], ["Front Delts", 0.4]),
  Schrägbankdrücken: act("Chest", ["Triceps", 0.5], ["Front Delts", 0.4]),
  "Incline Dumbbell Press": act("Chest", ["Triceps", 0.5], ["Front Delts", 0.4]),
  "Schrägbankdrücken (Kurzhantel)": act("Chest", ["Triceps", 0.5], ["Front Delts", 0.4]),
  "Dumbbell Flyes": act("Chest"),
  "Incline Dumbbell Flyes": act("Chest"),
  "Cable Flyes": act("Chest"),
  "Kabelzug Flys": act("Chest"),
  Butterfly: act("Chest"),
  "Chest Press": act("Chest", ["Triceps", 0.4], ["Front Delts", 0.3]),
  "Push-Ups": act("Chest", ["Triceps", 0.5], ["Front Delts", 0.3]),
  Liegestütze: act("Chest", ["Triceps", 0.5], ["Front Delts", 0.3]),

  // Back
  "Pull-Ups": act("Lats", ["Biceps", 0.5], ["Upper Back", 0.3]),
  Klimmzüge: act("Lats", ["Biceps", 0.5], ["Upper Back", 0.3]),
  "Chin-Ups": act("Lats", ["Biceps", 0.7], ["Upper Back", 0.3]),
  "Barbell Row": act("Upper Back", ["Biceps", 0.4], ["Lats", 0.4]),
  Langhantelrudern: act("Upper Back", ["Biceps", 0.4], ["Lats", 0.4]),
  "Dumbbell Row": act("Upper Back", ["Biceps", 0.4], ["Lats", 0.4]),
  Kurzhantelrudern: act("Upper Back", ["Biceps", 0.4], ["Lats", 0.4]),
  "T-Bar Row": act("Upper Back", ["Biceps", 0.4], ["Lats", 0.4]),
  "T-Bar Rudern": act("Upper Back", ["Biceps", 0.4], ["Lats", 0.4]),
  "Lat Pulldown": act("Lats", ["Biceps", 0.5], ["Upper Back", 0.3]),
  Latzug: act("Lats", ["Biceps", 0.5], ["Upper Back", 0.3]),
  Latziehen: act("Lats", ["Biceps", 0.5], ["Upper Back", 0.3]),
  "Cable Row": act("Upper Back", ["Biceps", 0.4], ["Lats", 0.4]),
  "Rudern am Kabelzug": act("Upper Back", ["Biceps", 0.4], ["Lats", 0.4]),
  "Seated Row": act("Upper Back", ["Biceps", 0.4], ["Lats", 0.4]),
  Deadlift: act("Glutes", ["Hamstrings", 0.8], ["Upper Back", 0.6], ["Lats", 0.4], ["Quads", 0.3]),
  Kreuzheben: act(
    "Glutes",
    ["Hamstrings", 0.8],
    ["Upper Back", 0.6],
    ["Lats", 0.4],
    ["Quads", 0.3],
  ),
  "Sumo Deadlift": act("Glutes", ["Quads", 0.6], ["Hamstrings", 0.6], ["Upper Back", 0.5]),

  // Shoulders
  "Overhead Press": act("Front Delts", ["Triceps", 0.5]),
  "Shoulder Press": act("Front Delts", ["Triceps", 0.5]),
  "Dumbbell Shoulder Press": act("Front Delts", ["Triceps", 0.5]),
  "Schulterdrücken (Kurzhantel)": act("Front Delts", ["Triceps", 0.5]),
  "Arnold Press": act("Front Delts", ["Side Delts", 0.4], ["Triceps", 0.4]),
  Schulterdrücken: act("Front Delts", ["Triceps", 0.5]),
  "Langhantel Schulterdrücken": act("Front Delts", ["Triceps", 0.5]),
  "Lateral Raises": act("Side Delts"),
  Seitheben: act("Side Delts"),
  "Seitheben (Kurzhantel)": act("Side Delts"),
  "Cable Lateral Raise": act("Side Delts"),
  "Upright Row": act("Side Delts", ["Upper Back", 0.4], ["Biceps", 0.3]),
  "Aufrechtes Rudern": act("Side Delts", ["Upper Back", 0.4], ["Biceps", 0.3]),
  "Front Raises": act("Front Delts"),
  "Face Pulls": act("Upper Back"),
  "Reverse Flyes": act("Upper Back"),
  "Rear Delt Fly": act("Upper Back"),
  "Butterfly Reverse": act("Upper Back"),
  Shrugs: act("Upper Back"),
  Schulterheben: act("Upper Back"),

  // Quads
  Squat: act("Quads", ["Glutes", 0.6], ["Hamstrings", 0.1]),
  Kniebeuge: act("Quads", ["Glutes", 0.6], ["Hamstrings", 0.1]),
  "Front Squat": act("Quads", ["Glutes", 0.4]),
  "Hack Squat": act("Quads", ["Glutes", 0.4]),
  "Goblet Squat": act("Quads", ["Glutes", 0.5]),
  "Leg Press": act("Quads", ["Glutes", 0.4], ["Hamstrings", 0.1]),
  Beinpresse: act("Quads", ["Glutes", 0.4], ["Hamstrings", 0.1]),
  "Leg Extension": act("Quads"),
  Beinstrecker: act("Quads"),
  Lunges: act("Quads", ["Glutes", 0.6], ["Hamstrings", 0.2]),
  Ausfallschritte: act("Quads", ["Glutes", 0.6], ["Hamstrings", 0.2]),
  "Bulgarian Split Squat": act("Quads", ["Glutes", 0.7], ["Hamstrings", 0.2]),

  // Hamstrings
  "Romanian Deadlift": act("Hamstrings", ["Glutes", 0.7], ["Upper Back", 0.4]),
  "Rumänisches Kreuzheben": act("Hamstrings", ["Glutes", 0.7], ["Upper Back", 0.4]),
  RDL: act("Hamstrings", ["Glutes", 0.7], ["Upper Back", 0.4]),
  "Leg Curl": act("Hamstrings"),
  "Seated Leg Curl": act("Hamstrings"),
  "Lying Leg Curl": act("Hamstrings"),
  Beinbeuger: act("Hamstrings"),
  "Nordic Curl": act("Hamstrings"),
  "Good Mornings": act("Hamstrings", ["Upper Back", 0.5]),

  // Biceps
  "Bicep Curl": act("Biceps"),
  Bizepscurls: act("Biceps"),
  "Hammer Curl": act("Biceps"),
  "Preacher Curl": act("Biceps"),
  "Scott Curls": act("Biceps"),
  "SZ-Curls": act("Biceps"),
  "Concentration Curl": act("Biceps"),
  Konzentrationscurls: act("Biceps"),

  // Triceps
  "Tricep Extension": act("Triceps"),
  "Tricep Pushdown": act("Triceps"),
  "Cable Pushdown": act("Triceps"),
  "Kabelzug Trizeps": act("Triceps"),
  Trizepsdrücken: act("Triceps"),
  "French Press": act("Triceps"),
  "Skull Crushers": act("Triceps"),
  "Close Grip Bench Press": act("Triceps", ["Chest", 0.6], ["Front Delts", 0.2]),
  "Enges Bankdrücken": act("Triceps", ["Chest", 0.6], ["Front Delts", 0.2]),
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
  "Leg Raises": act("Abs"),
  Beinheben: act("Abs"),
  "Cable Crunch": act("Abs"),
  "Ab Wheel": act("Abs"),
  "Russian Twist": act("Abs"),

  // Calves
  "Calf Raise": act("Calves"),
  "Seated Calf Raise": act("Calves"),
  "Standing Calf Raise": act("Calves"),
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
