import type { ExerciseLog } from "./exerciseLogs";
import { calculateWeeklyVolume } from "./fitnessMetrics";

// --- Types ---

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

export type VolumeLandmark = "below_MEV" | "at_MEV" | "at_MAV" | "above_MRV";

export interface MuscleGroupInsight {
  sets: number;
  landmark: VolumeLandmark;
  frequencyPerWeek: number;
  hoursSinceLastTrained: number | null;
}

export interface ExerciseE1RM {
  e1rm: number;
  trend: number[];
  plateau: boolean;
  bestRPE?: number;
}

export interface FatigueInsight {
  shouldDeload: boolean;
  reason?: string;
  weeklyTotalSets: number[];
}

export interface TrainingInsights {
  muscleGroups: Partial<Record<MuscleGroup, MuscleGroupInsight>>;
  e1rm: Record<string, ExerciseE1RM>;
  fatigue: FatigueInsight;
}

// --- Exercise → Muscle Group Mapping ---

/** Default mapping. Designed to be overridden with a dynamic map later. */
const DEFAULT_EXERCISE_MAP: Record<string, MuscleGroup> = {
  // Chest
  "Bench Press": "Chest",
  Bankdrücken: "Chest",
  "Incline Bench Press": "Chest",
  Schrägbankdrücken: "Chest",
  "Dumbbell Flyes": "Chest",
  "Incline Dumbbell Flyes": "Chest",
  "Cable Flyes": "Chest",
  "Chest Press": "Chest",
  "Push-Ups": "Chest",
  Liegestütze: "Chest",

  // Back
  "Pull-Ups": "Back",
  Klimmzüge: "Back",
  "Barbell Row": "Back",
  Langhantelrudern: "Back",
  "Dumbbell Row": "Back",
  Kurzhantelrudern: "Back",
  "Lat Pulldown": "Back",
  Latzug: "Back",
  "Cable Row": "Back",
  "Seated Row": "Back",
  Deadlift: "Back",
  Kreuzheben: "Back",

  // Shoulders
  "Overhead Press": "Shoulders",
  "Shoulder Press": "Shoulders",
  Schulterdrücken: "Shoulders",
  "Langhantel Schulterdrücken": "Shoulders",
  "Lateral Raises": "Shoulders",
  Seitheben: "Shoulders",
  "Seitheben (Kurzhantel)": "Shoulders",
  "Front Raises": "Shoulders",
  "Face Pulls": "Shoulders",
  "Reverse Flyes": "Shoulders",

  // Quads
  Squat: "Quads",
  Kniebeuge: "Quads",
  "Front Squat": "Quads",
  "Leg Press": "Quads",
  Beinpresse: "Quads",
  "Leg Extension": "Quads",
  Lunges: "Quads",
  Ausfallschritte: "Quads",
  "Bulgarian Split Squat": "Quads",

  // Hamstrings
  "Romanian Deadlift": "Hamstrings",
  "Rumänisches Kreuzheben": "Hamstrings",
  "Leg Curl": "Hamstrings",
  "Nordic Curl": "Hamstrings",
  "Good Mornings": "Hamstrings",

  // Biceps
  "Bicep Curl": "Biceps",
  Bizepscurls: "Biceps",
  "Hammer Curl": "Biceps",
  "Preacher Curl": "Biceps",

  // Triceps
  "Tricep Extension": "Triceps",
  "Tricep Pushdown": "Triceps",
  "Skull Crushers": "Triceps",
  Dips: "Triceps",
  "Dips an den Ringen": "Triceps",

  // Glutes
  "Hip Thrust": "Glutes",
  "Glute Bridge": "Glutes",
  "Cable Kickback": "Glutes",

  // Abs
  Crunches: "Abs",
  Planks: "Abs",
  "Hanging Leg Raise": "Abs",
  "Cable Crunch": "Abs",

  // Calves
  "Calf Raise": "Calves",
  Wadenheben: "Calves",
};

/**
 * Look up the muscle group for an exercise name.
 * Uses case-insensitive matching with an optional override map.
 */
export function getMuscleGroup(
  exerciseName: string,
  overrideMap?: Record<string, MuscleGroup>,
): MuscleGroup | null {
  // Check override first (exact match)
  if (overrideMap?.[exerciseName]) return overrideMap[exerciseName];

  // Check default (exact match)
  if (DEFAULT_EXERCISE_MAP[exerciseName]) return DEFAULT_EXERCISE_MAP[exerciseName];

  // Case-insensitive fallback
  const lower = exerciseName.toLowerCase();
  for (const [key, group] of Object.entries(overrideMap ?? {})) {
    if (key.toLowerCase() === lower) return group;
  }
  for (const [key, group] of Object.entries(DEFAULT_EXERCISE_MAP)) {
    if (key.toLowerCase() === lower) return group;
  }

  return null;
}

// --- e1RM Calculation ---

/** Epley formula: weight × (1 + reps / 30), adjusted for RPE. */
export function calculateE1RM(weight: number, reps: number, rpe?: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps > 30) return 0; // formula unreliable above 30 reps

  // RPE adjustment: if RPE 8, it's effectively 2 more reps left in the tank.
  const effectiveReps = reps + (10 - (rpe ?? 10));
  if (effectiveReps === 1) return weight;

  return Math.round(weight * (1 + effectiveReps / 30) * 10) / 10;
}

/**
 * Calculate e1RM trend for each exercise over distinct sessions (by date).
 * Returns the last 4 session e1RM values + plateau detection.
 */
export function calculateE1RMInsights(
  logs: ExerciseLog[],
  overrideMap?: Record<string, MuscleGroup>,
): Record<string, ExerciseE1RM> {
  // Group logs by exercise, then by session date
  const byExercise = new Map<string, Map<string, ExerciseLog[]>>();

  for (const log of logs) {
    if (log.weight == null || log.reps == null) continue;
    if (log.reps > 30) continue;

    const dateKey = log.loggedAt.toDateString();
    let exerciseMap = byExercise.get(log.exerciseName);
    if (!exerciseMap) {
      exerciseMap = new Map();
      byExercise.set(log.exerciseName, exerciseMap);
    }
    const sessionLogs = exerciseMap.get(dateKey) ?? [];
    sessionLogs.push(log);
    exerciseMap.set(dateKey, sessionLogs);
  }

  const result: Record<string, ExerciseE1RM> = {};

  for (const [exerciseName, sessions] of byExercise) {
    // Only include exercises we can map to a muscle group (skip unknowns for now)
    const group = getMuscleGroup(exerciseName, overrideMap);
    if (!group) continue;

    // Sort sessions chronologically and take last 4
    const sortedSessions = [...sessions.entries()]
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .slice(-4);

    // Best e1RM per session
    const trend = sortedSessions.map(([, sessionLogs]) => {
      let best = 0;
      for (const log of sessionLogs) {
        if (log.weight != null && log.reps != null) {
          const e1rm = calculateE1RM(log.weight, log.reps, log.rpe);
          if (e1rm > best) best = e1rm;
        }
      }
      return best;
    });

    const currentE1RM = trend[trend.length - 1] ?? 0;

    // Plateau: last 3+ e1RM values within ±2% of each other
    let plateau = false;
    if (trend.length >= 3) {
      const last3 = trend.slice(-3);
      const avg = last3.reduce((a, b) => a + b, 0) / last3.length;
      plateau = last3.every((v) => Math.abs(v - avg) / avg <= 0.02);
    }

    result[exerciseName] = { e1rm: currentE1RM, trend, plateau };
  }

  return result;
}

// --- Volume Landmarks ---

const VOLUME_LANDMARKS: Record<
  MuscleGroup,
  { mev: number; mavLow: number; mavHigh: number; mrv: number }
> = {
  Chest: { mev: 8, mavLow: 10, mavHigh: 18, mrv: 22 },
  Back: { mev: 8, mavLow: 10, mavHigh: 20, mrv: 25 },
  Quads: { mev: 6, mavLow: 8, mavHigh: 18, mrv: 20 },
  Hamstrings: { mev: 4, mavLow: 6, mavHigh: 14, mrv: 16 },
  Shoulders: { mev: 6, mavLow: 8, mavHigh: 18, mrv: 22 },
  Biceps: { mev: 4, mavLow: 6, mavHigh: 14, mrv: 20 },
  Triceps: { mev: 4, mavLow: 6, mavHigh: 14, mrv: 18 },
  Abs: { mev: 0, mavLow: 4, mavHigh: 16, mrv: 20 },
  Calves: { mev: 6, mavLow: 8, mavHigh: 14, mrv: 16 },
  Glutes: { mev: 0, mavLow: 4, mavHigh: 12, mrv: 16 },
};

function getVolumeLandmark(sets: number, group: MuscleGroup): VolumeLandmark {
  const thresholds = VOLUME_LANDMARKS[group];
  if (sets >= thresholds.mrv) return "above_MRV";
  if (sets >= thresholds.mavLow) return "at_MAV";
  if (sets >= thresholds.mev) return "at_MEV";
  return "below_MEV";
}

/**
 * Calculate per-muscle-group volume landmarks, frequency, and recovery status.
 */
export function calculateMuscleGroupInsights(
  logs: ExerciseLog[],
  targetDate: Date = new Date(),
  overrideMap?: Record<string, MuscleGroup>,
): Partial<Record<MuscleGroup, MuscleGroupInsight>> {
  const weeklyVolume = calculateWeeklyVolume(logs, targetDate);

  // Aggregate sets by muscle group
  const groupSets = new Map<MuscleGroup, number>();
  for (const vol of weeklyVolume) {
    const group = getMuscleGroup(vol.exerciseName, overrideMap);
    if (!group) continue;
    groupSets.set(group, (groupSets.get(group) ?? 0) + vol.sets);
  }

  // Calculate frequency (unique days per muscle group in last 14 days)
  const fourteenDaysAgo = new Date(targetDate);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const recentLogs = logs.filter((l) => l.loggedAt > fourteenDaysAgo && l.loggedAt <= targetDate);

  const groupDays = new Map<MuscleGroup, Set<string>>();
  for (const log of recentLogs) {
    const group = getMuscleGroup(log.exerciseName, overrideMap);
    if (!group) continue;
    const daySet = groupDays.get(group) ?? new Set();
    daySet.add(log.loggedAt.toDateString());
    groupDays.set(group, daySet);
  }

  // Hours since last trained per group
  const groupLastTrained = new Map<MuscleGroup, Date>();
  for (const log of logs) {
    const group = getMuscleGroup(log.exerciseName, overrideMap);
    if (!group) continue;
    const existing = groupLastTrained.get(group);
    if (!existing || log.loggedAt > existing) {
      groupLastTrained.set(group, log.loggedAt);
    }
  }

  const result: Partial<Record<MuscleGroup, MuscleGroupInsight>> = {};

  // Build insights for all groups that have any data
  const allGroups = new Set<MuscleGroup>([...groupSets.keys(), ...groupDays.keys()]);
  for (const group of allGroups) {
    const sets = groupSets.get(group) ?? 0;
    const days = groupDays.get(group)?.size ?? 0;
    const lastTrained = groupLastTrained.get(group);
    const hoursSince = lastTrained
      ? Math.round((targetDate.getTime() - lastTrained.getTime()) / 3600000)
      : null;

    result[group] = {
      sets,
      landmark: getVolumeLandmark(sets, group),
      frequencyPerWeek: Math.round((days / 2) * 10) / 10, // sessions per week over 14 days
      hoursSinceLastTrained: hoursSince,
    };
  }

  return result;
}

// --- Fatigue & Deload Detection ---

/**
 * Calculate weekly total sets over the last 4 weeks and detect if deload is needed.
 */
export function calculateFatigueInsight(
  logs: ExerciseLog[],
  e1rmData: Record<string, ExerciseE1RM>,
  targetDate: Date = new Date(),
): FatigueInsight {
  // Weekly total sets for last 4 weeks
  const weeklyTotalSets: number[] = [];
  for (let w = 3; w >= 0; w--) {
    const weekEnd = new Date(targetDate);
    weekEnd.setDate(weekEnd.getDate() - w * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 7);

    const weekLogs = logs.filter(
      (l) => l.loggedAt > weekStart && l.loggedAt <= weekEnd && l.reps != null,
    );
    weeklyTotalSets.push(weekLogs.length);
  }

  // Check 1: Volume increasing for 4+ consecutive weeks
  const volumeIncreasing =
    weeklyTotalSets.length >= 4 &&
    weeklyTotalSets.every((sets, i) => i === 0 || sets > (weeklyTotalSets[i - 1] ?? 0));

  // Check 2: Multiple exercises showing e1RM decline (top e1RM < trend average)
  let decliningExercises = 0;
  for (const data of Object.values(e1rmData)) {
    if (data.trend.length >= 2) {
      const current = data.trend[data.trend.length - 1] ?? 0;
      const prev = data.trend[data.trend.length - 2] ?? 0;
      if (prev > 0 && current < prev * 0.95) decliningExercises++;
    }
  }
  const performanceDecline = decliningExercises >= 2;

  let shouldDeload = false;
  let reason: string | undefined;

  if (volumeIncreasing && weeklyTotalSets[3]! > 15) {
    shouldDeload = true;
    reason = "Volume has increased for 4 consecutive weeks. Schedule a deload to allow recovery.";
  } else if (performanceDecline) {
    shouldDeload = true;
    reason = `Performance declining in ${decliningExercises} exercises simultaneously. Fatigue is accumulating.`;
  }

  return { shouldDeload, reason, weeklyTotalSets };
}

// --- Main Entry Point ---

/**
 * Calculate all training science insights from exercise logs.
 * The overrideMap parameter allows injecting a dynamic exercise→muscle mapping
 * (e.g. from localStorage or spreadsheet) to extend the hard-coded defaults.
 */
export function calculateTrainingInsights(
  logs: ExerciseLog[],
  targetDate: Date = new Date(),
  overrideMap?: Record<string, MuscleGroup>,
): TrainingInsights {
  const e1rm = calculateE1RMInsights(logs, overrideMap);
  const muscleGroups = calculateMuscleGroupInsights(logs, targetDate, overrideMap);
  const fatigue = calculateFatigueInsight(logs, e1rm, targetDate);

  return { muscleGroups, e1rm, fatigue };
}
