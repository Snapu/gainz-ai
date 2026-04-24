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

export type VolumeLandmark = "below_MEV" | "at_MEV" | "at_MAV" | "approaching_MRV" | "above_MRV";

export type SystemicPhase = "Inactive" | "Maintain" | "Build" | "Deload";

export interface MuscleGroupInsight {
  sets: number;
  landmark: VolumeLandmark;
  frequencyPerWeek: number;
  hoursSinceLastTrained: number | null;
  recoveryReady: boolean;
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
  weeklyTonnage: number[]; // sum of weight × reps per set, per week
}

export interface TrainingInsights {
  muscleGroups: Partial<Record<MuscleGroup, MuscleGroupInsight>>;
  e1rm: Record<string, ExerciseE1RM>;
  fatigue: FatigueInsight;
  phase: SystemicPhase;
  acwr: number | null; // Acute:Chronic Workload Ratio (7-day load / avg weekly 28-day load)
  mesocycleWeek: number; // Weeks since last deload (or since first log if no deload detected)
}

// --- Exercise → Muscle Activation Mapping ---

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

/** Default activation mapping. Designed to be overridden with a dynamic map later. */
const DEFAULT_EXERCISE_ACTIVATION_MAP: Record<string, MuscleActivation> = {
  // Chest (compound presses credit Triceps + Shoulders as secondaries)
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

  // Back (compound pulls credit Biceps as secondary)
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
  // Deadlift is a full-body posterior chain movement
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

  // Quads (compound leg movements credit Glutes + Hamstrings)
  // Squats: Hamstrings coefficient reduced to 0.1 — Squats provide near-zero dynamic hamstring stimulus
  // (muscle doesn't lengthen under load; isometric only). Hip hinges retain full coefficients.
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
  // Check override first (exact match)
  if (overrideMap?.[exerciseName]) return overrideMap[exerciseName];

  // Check default (exact match)
  if (DEFAULT_EXERCISE_ACTIVATION_MAP[exerciseName])
    return DEFAULT_EXERCISE_ACTIVATION_MAP[exerciseName];

  // Case-insensitive fallback
  const lower = exerciseName.toLowerCase();
  for (const [key, activation] of Object.entries(overrideMap ?? {})) {
    if (key.toLowerCase() === lower) return activation;
  }
  for (const [key, activation] of Object.entries(DEFAULT_EXERCISE_ACTIVATION_MAP)) {
    if (key.toLowerCase() === lower) return activation;
  }

  return null;
}

/**
 * Look up the primary muscle group for an exercise name.
 * Convenience wrapper around getMuscleActivation — use that for full activation data.
 */
export function getMuscleGroup(
  exerciseName: string,
  overrideMap?: Record<string, MuscleActivation>,
): MuscleGroup | null {
  return getMuscleActivation(exerciseName, overrideMap)?.primaryMuscle ?? null;
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
  overrideMap?: Record<string, MuscleActivation>,
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
  Chest: { mev: 8, mavLow: 12, mavHigh: 18, mrv: 22 },
  Back: { mev: 8, mavLow: 14, mavHigh: 20, mrv: 25 },
  Quads: { mev: 6, mavLow: 12, mavHigh: 18, mrv: 20 },
  Hamstrings: { mev: 6, mavLow: 10, mavHigh: 16, mrv: 20 }, // MEV raised (compounds provide little dynamic stimulus)
  Shoulders: { mev: 6, mavLow: 12, mavHigh: 20, mrv: 24 }, // MAV Low raised (pressing already covers front delt MEV)
  Biceps: { mev: 4, mavLow: 8, mavHigh: 18, mrv: 24 }, // Pulling compounds inflate effective sets fast
  Triceps: { mev: 4, mavLow: 8, mavHigh: 16, mrv: 20 }, // Pressing compounds inflate; MRV capped by elbow stress
  Abs: { mev: 0, mavLow: 8, mavHigh: 16, mrv: 22 }, // Compounds = stability only, not hypertrophy
  Calves: { mev: 6, mavLow: 10, mavHigh: 18, mrv: 22 }, // Slow-twitch dominant, very fatigue-resistant
  Glutes: { mev: 6, mavLow: 8, mavHigh: 16, mrv: 20 }, // Gets large secondary volume from squats/hinges/lunges
};

function getVolumeLandmark(sets: number, group: MuscleGroup): VolumeLandmark {
  const thresholds = VOLUME_LANDMARKS[group];
  if (sets >= thresholds.mrv) return "above_MRV";
  if (sets >= thresholds.mavHigh) return "approaching_MRV";
  if (sets >= thresholds.mavLow) return "at_MAV";
  if (sets >= thresholds.mev) return "at_MEV";
  return "below_MEV";
}

// Minimum recovery window per muscle group before the next training stimulus
const RECOVERY_HOURS: Record<MuscleGroup, number> = {
  Chest: 48,
  Back: 72,
  Quads: 72,
  Hamstrings: 72,
  Shoulders: 48,
  Biceps: 48,
  Triceps: 48,
  Abs: 24,
  Calves: 24,
  Glutes: 48,
};

/**
 * Calculate per-muscle-group volume landmarks, frequency, and recovery status.
 * Primary muscles receive full set credit (1.0); secondary muscles receive fractional credit.
 */
export function calculateMuscleGroupInsights(
  logs: ExerciseLog[],
  targetDate: Date = new Date(),
  overrideMap?: Record<string, MuscleActivation>,
): Partial<Record<MuscleGroup, MuscleGroupInsight>> {
  const weeklyVolume = calculateWeeklyVolume(logs, targetDate);

  // Aggregate sets by muscle group — primary gets full credit, secondaries get fractional credit
  const groupSets = new Map<MuscleGroup, number>();
  for (const vol of weeklyVolume) {
    const activation = getMuscleActivation(vol.exerciseName, overrideMap);
    if (!activation) continue;

    const currentPrimary = groupSets.get(activation.primaryMuscle) ?? 0;
    groupSets.set(activation.primaryMuscle, currentPrimary + vol.sets);

    for (const secondary of activation.secondaryMuscles) {
      const current = groupSets.get(secondary.muscleGroup) ?? 0;
      groupSets.set(secondary.muscleGroup, current + vol.sets * secondary.contribution);
    }
  }

  // Calculate frequency: unique training days per muscle group in last 14 days
  // A day counts for a muscle group if the exercise targets it as primary OR secondary
  const fourteenDaysAgo = new Date(targetDate);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const recentLogs = logs.filter((l) => l.loggedAt > fourteenDaysAgo && l.loggedAt <= targetDate);

  const groupDays = new Map<MuscleGroup, Set<string>>();
  for (const log of recentLogs) {
    const activation = getMuscleActivation(log.exerciseName, overrideMap);
    if (!activation) continue;
    const dayStr = log.loggedAt.toDateString();

    const primaryDays = groupDays.get(activation.primaryMuscle) ?? new Set();
    primaryDays.add(dayStr);
    groupDays.set(activation.primaryMuscle, primaryDays);

    for (const secondary of activation.secondaryMuscles) {
      const secDays = groupDays.get(secondary.muscleGroup) ?? new Set();
      secDays.add(dayStr);
      groupDays.set(secondary.muscleGroup, secDays);
    }
  }

  // Hours since last trained per group — includes secondary muscle contributions
  const groupLastTrained = new Map<MuscleGroup, Date>();
  for (const log of logs) {
    const activation = getMuscleActivation(log.exerciseName, overrideMap);
    if (!activation) continue;

    const updateIfNewer = (group: MuscleGroup) => {
      const existing = groupLastTrained.get(group);
      if (!existing || log.loggedAt > existing) {
        groupLastTrained.set(group, log.loggedAt);
      }
    };

    updateIfNewer(activation.primaryMuscle);
    for (const secondary of activation.secondaryMuscles) {
      updateIfNewer(secondary.muscleGroup);
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

    const minRecovery = RECOVERY_HOURS[group];
    const recoveryReady = hoursSince === null ? true : hoursSince >= minRecovery;

    result[group] = {
      sets: Math.round(sets * 10) / 10, // round to 1 decimal for fractional secondary sets
      landmark: getVolumeLandmark(sets, group),
      frequencyPerWeek: Math.round((days / 2) * 10) / 10, // sessions per week over 14 days
      hoursSinceLastTrained: hoursSince,
      recoveryReady,
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
  // Weekly total sets and tonnage for last 4 weeks
  const weeklyTotalSets: number[] = [];
  const weeklyTonnage: number[] = [];
  for (let w = 3; w >= 0; w--) {
    const weekEnd = new Date(targetDate);
    weekEnd.setDate(weekEnd.getDate() - w * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 7);

    const weekLogs = logs.filter(
      (l) => l.loggedAt > weekStart && l.loggedAt <= weekEnd && l.reps != null,
    );
    weeklyTotalSets.push(weekLogs.length);
    weeklyTonnage.push(weekLogs.reduce((sum, l) => sum + (l.weight ?? 0) * (l.reps ?? 0), 0));
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

  // Relative threshold: trigger deload if current week exceeds prior 3-week average by 25%+
  // (adapts to the athlete's baseline; replaces hardcoded >40 absolute threshold)
  const priorAvg =
    weeklyTotalSets.length >= 4
      ? (weeklyTotalSets[0]! + weeklyTotalSets[1]! + weeklyTotalSets[2]!) / 3
      : 0;
  const volumeSpike = priorAvg > 0 && weeklyTotalSets[3]! > priorAvg * 1.25;

  if (volumeIncreasing && volumeSpike) {
    shouldDeload = true;
    reason = "Volume has increased for 4 consecutive weeks. Schedule a deload to allow recovery.";
  } else if (performanceDecline) {
    shouldDeload = true;
    reason = `Performance declining in ${decliningExercises} exercises simultaneously. Fatigue is accumulating.`;
  }

  return { shouldDeload, reason, weeklyTotalSets, weeklyTonnage };
}

// --- Systemic Phase Detection ---

/**
 * Determine the athlete's current training phase from fatigue telemetry.
 *
 * Phase mapping:
 * - Deload:   Fatigue signals have triggered a mandatory recovery period.
 * - Build:    Volume is actively increasing week-over-week above MEV.
 * - Maintain: Volume is sufficient to preserve current adaptations.
 * - Inactive: Volume is below the minimum effective threshold.
 */
export function computeSystemicPhase(fatigue: FatigueInsight): SystemicPhase {
  if (fatigue.shouldDeload) return "Deload";

  const trend = fatigue.weeklyTotalSets;
  const last = trend[trend.length - 1] ?? 0;
  const previous = trend[trend.length - 2] ?? 0;

  // Below Minimum Volume (MV) for the whole body
  // Trailing 14-day global volume sum. MEV for a full body is roughly 12 sets/week.
  // If sum is < 24 sets over 14 days, systemic tension is fundamentally lost.
  if (last + previous < 24) return "Inactive";

  // Active progression
  if (trend.length >= 2 && last > previous && last >= 10) return "Build";

  // Baseline maintenance
  return "Maintain";
}

// --- Main Entry Point ---

/**
 * Calculate all training science insights from exercise logs.
 * The overrideMap parameter allows injecting a dynamic exercise→muscle mapping
 * (e.g. from localStorage or spreadsheet) to extend the hard-coded defaults.
 */
/**
 * Compute the Acute:Chronic Workload Ratio.
 * Acute load  = total tonnage (weight × reps) in the last 7 days.
 * Chronic load = average weekly tonnage over the last 28 days.
 * Returns null when there is no chronic load baseline (new user).
 * Safe zone: 0.8–1.3. Above 1.5 = high injury risk.
 */
function computeACWR(logs: ExerciseLog[], targetDate: Date): number | null {
  const msPerDay = 86_400_000;
  const now = targetDate.getTime();

  const acuteLoad = logs
    .filter((l) => now - l.loggedAt.getTime() <= 7 * msPerDay)
    .reduce((s, l) => s + (l.weight ?? 0) * (l.reps ?? 0), 0);

  const chronicLoad = logs
    .filter((l) => now - l.loggedAt.getTime() <= 28 * msPerDay)
    .reduce((s, l) => s + (l.weight ?? 0) * (l.reps ?? 0), 0);

  const chronicWeekly = chronicLoad / 4;
  if (chronicWeekly === 0) return null;

  return Math.round((acuteLoad / chronicWeekly) * 100) / 100;
}

/**
 * Compute which week of the current mesocycle the athlete is in.
 *
 * Scans back up to 24 weeks and identifies the most recent "deload week" —
 * defined as a week where total sets were ≤ 50% of the preceding 3-week average.
 * Returns weeks elapsed since that deload (week after deload = week 1).
 * Falls back to counting from the first active week if no deload is found.
 */
function computeMesocycleWeek(logs: ExerciseLog[], targetDate: Date): number {
  const msPerWeek = 7 * 86_400_000;
  const maxWeeks = 24;

  // Bucket logs into weekly set counts: index 0 = 24 weeks ago, index 23 = current week
  const weeklySets: number[] = [];
  for (let w = maxWeeks - 1; w >= 0; w--) {
    const weekEnd = new Date(targetDate.getTime() - w * msPerWeek);
    const weekStart = new Date(weekEnd.getTime() - msPerWeek);
    const count = logs.filter(
      (l) => l.loggedAt > weekStart && l.loggedAt <= weekEnd && l.reps != null,
    ).length;
    weeklySets.push(count);
  }

  // Search for the most recent deload week (skip current week, need 3 prior weeks for baseline)
  for (let i = maxWeeks - 2; i >= 3; i--) {
    const priorAvg =
      ((weeklySets[i - 1] ?? 0) + (weeklySets[i - 2] ?? 0) + (weeklySets[i - 3] ?? 0)) / 3;
    if (priorAvg > 0 && (weeklySets[i] ?? 0) <= priorAvg * 0.5) {
      // mesocycleWeek = current index (maxWeeks-1) minus deload index
      return maxWeeks - 1 - i;
    }
  }

  // No deload found: count from first active week (that week = week 1)
  const firstActiveIndex = weeklySets.findIndex((s) => s > 0);
  if (firstActiveIndex === -1) return 1;
  return maxWeeks - 1 - (firstActiveIndex - 1);
}

export function calculateTrainingInsights(
  logs: ExerciseLog[],
  targetDate: Date = new Date(),
  overrideMap?: Record<string, MuscleActivation>,
): TrainingInsights {
  const e1rm = calculateE1RMInsights(logs, overrideMap);
  const muscleGroups = calculateMuscleGroupInsights(logs, targetDate, overrideMap);
  const fatigue = calculateFatigueInsight(logs, e1rm, targetDate);
  const phase = computeSystemicPhase(fatigue);
  const acwr = computeACWR(logs, targetDate);
  const mesocycleWeek = computeMesocycleWeek(logs, targetDate);

  return { muscleGroups, e1rm, fatigue, phase, acwr, mesocycleWeek };
}
