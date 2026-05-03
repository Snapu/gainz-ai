import type { ExerciseLog } from "./exerciseLogs";
import { calculateWeeklyVolume } from "./fitnessMetrics";
import {
  getDeloadTimeRemainingMs,
  getMesocycleWeekFromLifecycle,
  type DeloadLifecycle,
  type DeloadTriggerSnapshot,
} from "./deloadLifecycle";

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
  triggeredBy?: string[]; // which trigger IDs fired (empty if none); populated by calculateFatigueInsight
  decliningExercises?: number; // count of exercises with declining e1RM; populated by calculateFatigueInsight
}

/** A date range representing a detected deload week (exclusive start, inclusive end). */
export interface DeloadWeekRange {
  start: Date;
  end: Date;
}

export interface TrainingInsights {
  muscleGroups: Partial<Record<MuscleGroup, MuscleGroupInsight>>;
  e1rm: Record<string, ExerciseE1RM>;
  fatigue: FatigueInsight;
  phase: SystemicPhase;
  acwr: number | null; // Acute:Chronic Workload Ratio (7-day load / avg weekly 28-day load)
  mesocycleWeek: number; // Weeks since last deload (or since first log if no deload detected)
  deloadStatus: "active" | "inactive";
  deloadStartedAt: string | null;
  deloadEndsAt: string | null;
  deloadTimeRemainingMs: number;
  e1rmPaused: boolean;
  plateauPaused: boolean;
  postStopConservativeSessionsRemaining: number;
  deloadTriggerSnapshot: DeloadTriggerSnapshot | null; // frozen snapshot from when deload was triggered
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

/**
 * Normalize an exercise name to a stable canonical key.
 * Used everywhere names are compared, grouped, or stored.
 */
export function normalizeExerciseName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Returns all exercise names known in the default activation map. */
export function getDefaultExerciseNames(): string[] {
  return Object.keys(DEFAULT_EXERCISE_ACTIVATION_MAP);
}

/** Default activation mapping. Designed to be overridden with a dynamic map later. */
export const DEFAULT_EXERCISE_ACTIVATION_MAP: Record<string, MuscleActivation> = {
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
  const normalized = normalizeExerciseName(exerciseName);

  // Check override map: first by exact key (callers may pass original-casing keys),
  // then by normalized key (learned map stores normalized keys).
  if (overrideMap) {
    if (overrideMap[exerciseName]) return overrideMap[exerciseName];
    if (overrideMap[normalized]) return overrideMap[normalized];
    // Case-insensitive fallback for override map
    for (const [key, activation] of Object.entries(overrideMap)) {
      if (normalizeExerciseName(key) === normalized) return activation;
    }
  }

  // Check default map by exact key first (preserves original casing from the map)
  if (DEFAULT_EXERCISE_ACTIVATION_MAP[exerciseName])
    return DEFAULT_EXERCISE_ACTIVATION_MAP[exerciseName];

  // Check default map by normalized key (case-insensitive fallback)
  for (const [key, activation] of Object.entries(DEFAULT_EXERCISE_ACTIVATION_MAP)) {
    if (normalizeExerciseName(key) === normalized) return activation;
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
  // Clamp effectiveReps to 36 max: Brzycki denominator (37 - reps) must stay positive.
  // Without this, reps=30 + RPE adjustment (e.g. rpe=3 → +7) → effectiveReps=37 → division by zero.
  const effectiveReps = Math.min(reps + (10 - (rpe ?? 10)), 36);
  if (effectiveReps === 1) return weight;

  // Ensemble: Epley (accurate at low reps) + Brzycki (accurate at high reps)
  // Linearly blend from Epley (t=0) to Brzycki (t=1) as reps increase toward 20.
  const epley = weight * (1 + effectiveReps / 30);
  const brzycki = weight * (36 / (37 - effectiveReps));
  const t = Math.min(effectiveReps / 20, 1);
  const blended = epley * (1 - t) + brzycki * t;

  return Math.round(blended * 10) / 10;
}

/**
 * Calculate e1RM trend for each exercise over distinct sessions (by date).
 * Returns the last 4 session e1RM values + plateau detection.
 *
 * When `excludeRanges` is provided, sessions falling inside any deload week
 * are excluded so that intentionally light deload weights don't contaminate
 * the trend or trigger false plateau/decline signals.
 */
export function calculateE1RMInsights(
  logs: ExerciseLog[],
  excludeRanges?: DeloadWeekRange[],
): Record<string, ExerciseE1RM> {
  // Filter out logs that fall within deload week ranges
  const filteredLogs =
    excludeRanges && excludeRanges.length > 0
      ? logs.filter(
          (log) =>
            !excludeRanges.some((range) => log.loggedAt > range.start && log.loggedAt <= range.end),
        )
      : logs;

  // Group logs by canonical (normalized) key, tracking first-seen display name per key.
  // This ensures "Bench Press" and "bench press" combine into one trend line.
  const byExercise = new Map<string, Map<string, ExerciseLog[]>>();
  const displayNames = new Map<string, string>(); // canonical key → first-seen original name

  for (const log of filteredLogs) {
    if (log.weight == null || log.reps == null) continue;
    if (log.reps > 30) continue;

    const canonical = normalizeExerciseName(log.exerciseName);
    if (!displayNames.has(canonical)) displayNames.set(canonical, log.exerciseName);

    const dateKey = log.loggedAt.toDateString();
    let exerciseMap = byExercise.get(canonical);
    if (!exerciseMap) {
      exerciseMap = new Map();
      byExercise.set(canonical, exerciseMap);
    }
    const sessionLogs = exerciseMap.get(dateKey) ?? [];
    sessionLogs.push(log);
    exerciseMap.set(dateKey, sessionLogs);
  }

  const result: Record<string, ExerciseE1RM> = {};

  for (const [canonical, sessions] of byExercise) {
    // Use the first-seen original display name as the result key so the AI and UI
    // see a human-readable name, not a lowercase canonical key.
    const exerciseName = displayNames.get(canonical) ?? canonical;

    // Sort sessions chronologically and take last 4
    const sortedSessions = [...sessions.entries()]
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .slice(-4);

    // Best e1RM per session. Only consider sets with ≤20 reps: the formula becomes
    // unreliable above 20 reps (Brzycki denominator approaches zero near rep 30), but
    // using ≤12 was too strict — it produced e1rm=0 for all fat-loss / endurance athletes
    // who train entirely in the 13–20 rep range, breaking weight prescription for them.
    const trend = sortedSessions.map(([, sessionLogs]) => {
      let best = 0;
      for (const log of sessionLogs) {
        if (log.weight != null && log.reps != null && log.reps <= 20) {
          const e1rm = calculateE1RM(log.weight, log.reps, log.rpe);
          if (e1rm > best) best = e1rm;
        }
      }
      return best;
    });

    const currentE1RM = trend[trend.length - 1] ?? 0;

    // Track RPE of the set that produced the best e1RM in the latest session.
    // Tells the AI whether the e1RM estimate is conservative (low RPE) or maximal (RPE 10).
    const latestSessionLogs = sortedSessions[sortedSessions.length - 1]?.[1] ?? [];
    let bestRPE: number | undefined;
    let bestForRPECheck = 0;
    for (const log of latestSessionLogs) {
      if (log.weight != null && log.reps != null && log.reps <= 20) {
        const e1rm = calculateE1RM(log.weight, log.reps, log.rpe);
        if (e1rm > bestForRPECheck) {
          bestForRPECheck = e1rm;
          bestRPE = log.rpe ?? undefined;
        }
      }
    }

    // Plateau: last 3+ non-zero e1RM values within ±3% of each other.
    // Filter zeros to prevent sessions where all sets were outside the rep window
    // (e.g. a session with only >20 rep sets) from polluting the trend.
    // Using ±3% (not ±2%): the Epley/Brzycki ensemble produces 2–4% formula noise
    // when the same athlete logs different rep counts across sessions (e.g. 8 vs 12).
    // At ±2% the threshold was inside formula noise — genuine progress was masked as plateau.
    let plateau = false;
    const nonZeroTrend = trend.filter((v) => v > 0);
    if (nonZeroTrend.length >= 3) {
      const last3 = nonZeroTrend.slice(-3);
      const avg = last3.reduce((a, b) => a + b, 0) / last3.length;
      plateau = last3.every((v) => Math.abs(v - avg) / avg <= 0.03);
    }

    result[exerciseName] = { e1rm: currentE1RM, trend, plateau, bestRPE };
  }

  return result;
}

// --- Volume Landmarks ---

export const VOLUME_LANDMARKS: Record<
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
  Abs: { mev: 2, mavLow: 8, mavHigh: 16, mrv: 22 }, // MEV=2: compounds give stability but negligible direct hypertrophy
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
export const RECOVERY_HOURS: Record<MuscleGroup, number> = {
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

// --- Deload Week Detection ---

/** Minimum sets/week in the prior baseline to qualify as deload detection.
 *  Below this threshold the athlete wasn't actively training — don't treat the gap as a deload. */
const MIN_ACTIVE_SETS_FOR_DELOAD = 4;

/**
 * Detect deload weeks from volume data (set count only — no e1RM dependency).
 *
 * A deload week is one where total sets ≤ 50% of the preceding 3-week average,
 * AND the athlete was actively training before (priorAvg ≥ MIN_ACTIVE_SETS_FOR_DELOAD).
 * Returns date ranges for each detected deload week.
 */
export function detectDeloadWeekRanges(
  logs: ExerciseLog[],
  targetDate: Date,
  maxWeeks = 24,
): DeloadWeekRange[] {
  const msPerWeek = 7 * 86_400_000;

  // Bucket logs into weekly set counts: index 0 = maxWeeks ago, index maxWeeks-1 = current week
  const weeklySets: number[] = [];
  const weekBounds: { start: Date; end: Date }[] = [];
  for (let w = maxWeeks - 1; w >= 0; w--) {
    const weekEnd = new Date(targetDate.getTime() - w * msPerWeek);
    const weekStart = new Date(weekEnd.getTime() - msPerWeek);
    const count = logs.filter(
      (l) => l.loggedAt > weekStart && l.loggedAt <= weekEnd && l.reps != null,
    ).length;
    weeklySets.push(count);
    weekBounds.push({ start: weekStart, end: weekEnd });
  }

  const ranges: DeloadWeekRange[] = [];

  // Need at least 3 prior weeks for a baseline, so start scanning from index 3
  for (let i = 3; i < maxWeeks; i++) {
    const priorAvg =
      ((weeklySets[i - 1] ?? 0) + (weeklySets[i - 2] ?? 0) + (weeklySets[i - 3] ?? 0)) / 3;
    const thisWeekSets = weeklySets[i] ?? 0;
    if (priorAvg >= MIN_ACTIVE_SETS_FOR_DELOAD && thisWeekSets <= priorAvg * 0.5) {
      ranges.push(weekBounds[i]!);
    }
  }

  return ranges;
}

/** Check whether a given date falls inside any of the detected deload week ranges. */
function isInDeloadWeek(date: Date, ranges: DeloadWeekRange[]): boolean {
  return ranges.some((r) => date > r.start && date <= r.end);
}

// --- Fatigue & Deload Detection ---

/**
 * Calculate weekly total sets over the last 4 weeks and detect if deload is needed.
 *
 * When `isCurrentWeekDeload` is true, the e1RM decline check is skipped because
 * the athlete is intentionally training lighter — lower e1RM values are expected,
 * not a sign of accumulated fatigue.
 */
export function calculateFatigueInsight(
  logs: ExerciseLog[],
  e1rmData: Record<string, ExerciseE1RM>,
  targetDate: Date = new Date(),
  bodyweightKg?: number,
  isCurrentWeekDeload = false,
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
    // RPE-adjusted tonnage: sets at lower RPE carry proportionally less systemic fatigue.
    // Default to RPE 10 (full effort) when not recorded.
    weeklyTonnage.push(
      weekLogs.reduce((sum, l) => {
        const rpeMultiplier = (l.rpe ?? 10) / 10;
        return sum + (l.weight ?? bodyweightKg ?? 70) * (l.reps ?? 0) * rpeMultiplier;
      }, 0),
    );
  }

  // Check 1: Volume increasing for 4+ consecutive weeks
  const volumeIncreasing =
    weeklyTotalSets.length >= 4 &&
    weeklyTotalSets.every((sets, i) => i === 0 || sets > (weeklyTotalSets[i - 1] ?? 0));

  // Check 2: Multiple exercises showing e1RM decline over 2+ consecutive sessions.
  // Comparing to a 2-session average (not just the previous session) avoids false positives
  // from a single bad day (poor sleep, dehydration, mid-taper).
  // SKIP during an active deload week: lower weights are intentional, not a fatigue signal.
  let decliningExercises = 0;
  if (!isCurrentWeekDeload) {
    for (const data of Object.values(e1rmData)) {
      if (data.trend.length >= 3) {
        const current = data.trend[data.trend.length - 1] ?? 0;
        const prior2Avg =
          ((data.trend[data.trend.length - 2] ?? 0) + (data.trend[data.trend.length - 3] ?? 0)) / 2;
        if (prior2Avg > 0 && current < prior2Avg * 0.95) decliningExercises++;
      }
    }
  }
  const performanceDecline = decliningExercises >= 2;

  let shouldDeload = false;
  let reason: string | undefined;

  // Relative threshold: trigger deload if current week exceeds prior 3-week average by 25%+.
  // Floor of 12 sets/week (~2 exercises × 6 sets): prevents false positives for beginners
  // whose normal progression looks like a "spike" relative to their small starting volume.
  const priorAvg =
    weeklyTotalSets.length >= 4
      ? (weeklyTotalSets[0]! + weeklyTotalSets[1]! + weeklyTotalSets[2]!) / 3
      : 0;
  const VOLUME_SPIKE_MIN_BASELINE = 12;
  const volumeSpike =
    priorAvg >= VOLUME_SPIKE_MIN_BASELINE && weeklyTotalSets[3]! > priorAvg * 1.25;

  if (volumeSpike) {
    shouldDeload = true;
    reason = volumeIncreasing
      ? "Volume has increased for 4 consecutive weeks. Schedule a deload to allow recovery."
      : "Weekly set volume spiked this week — 25%+ above the prior 3-week average. Risk of overreaching.";
  } else if (performanceDecline) {
    shouldDeload = true;
    reason = `Performance declining in ${decliningExercises} exercises simultaneously. Fatigue is accumulating.`;
  } else {
    // Check 3: Standalone tonnage spike — set count stable but load jumped 50%+ in a single week.
    // Catches athletes who keep set count constant but drastically increase weight per set.
    // No set-count floor: this check targets intensity spikes independent of volume.
    // The beginner protection floor (VOLUME_SPIKE_MIN_BASELINE) only applies to Check 1.
    const priorTonnageAvg =
      weeklyTonnage.length >= 4
        ? (weeklyTonnage[0]! + weeklyTonnage[1]! + weeklyTonnage[2]!) / 3
        : 0;
    if (priorTonnageAvg > 0 && weeklyTonnage[3]! > priorTonnageAvg * 1.5) {
      shouldDeload = true;
      reason = `Training load (tonnage) spiked this week — 50%+ above the prior 3-week average. Risk of overreaching.`;
    }
  }

  const triggeredBy: string[] = [];
  if (volumeSpike) triggeredBy.push("volumeSpike");
  if (volumeIncreasing) triggeredBy.push("volumeIncreasing");
  if (performanceDecline) triggeredBy.push("performanceDecline");
  // tonnage spike only fires when neither volumeSpike nor performanceDecline fired
  if (shouldDeload && !volumeSpike && !performanceDecline) triggeredBy.push("tonnageSpike");

  return { shouldDeload, reason, weeklyTotalSets, weeklyTonnage, triggeredBy, decliningExercises };
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

  // Returning athlete: prior week was dead, this week just resumed.
  // Classifying as "Build" would push volume hard for someone whose connective tissue
  // hasn't been trained in weeks and whose ACWR is already elevated.
  if (previous === 0 && last > 0) return "Maintain";

  // Active progression
  if (trend.length >= 2 && last > previous && last >= 10) return "Build";

  // Baseline maintenance
  return "Maintain";
}

// --- Main Entry Point ---

/**
 * Compute the Acute:Chronic Workload Ratio.
 * Acute load  = total tonnage (weight × reps) in the last 7 days.
 * Chronic load = average weekly tonnage over the last 28 days.
 *
 * Returns null when the chronic baseline is insufficient:
 *   - No logs at all, OR
 *   - All logs fall within the acute window (< 7 days old) — returning athlete
 *     with a gap would otherwise produce a wildly inflated ratio.
 * Safe zone: 0.8–1.3. Above 1.5 = high injury risk.
 */
function computeACWR(logs: ExerciseLog[], targetDate: Date, bodyweightKg?: number): number | null {
  const msPerDay = 86_400_000;
  const now = targetDate.getTime();

  const acuteLoad = logs
    .filter((l) => now - l.loggedAt.getTime() <= 7 * msPerDay)
    .reduce((s, l) => {
      const rpeMultiplier = (l.rpe ?? 10) / 10;
      // Use bodyweightKg (or 70kg fallback) as a proxy for exercises logged without weight (e.g. Pull-Ups, Push-Ups).
      // Without this, bodyweight athletes always produce acuteLoad=0 → ACWR=null → wrong advice.
      return s + (l.weight ?? bodyweightKg ?? 70) * (l.reps ?? 0) * rpeMultiplier;
    }, 0);

  // Chronic baseline = load from days 8–28 (older than the acute window)
  // If there is no pre-acute history, the ratio is meaningless — return null
  const preAcuteLoad = logs
    .filter((l) => {
      const age = now - l.loggedAt.getTime();
      return age > 7 * msPerDay && age <= 28 * msPerDay;
    })
    .reduce((s, l) => {
      const rpeMultiplier = (l.rpe ?? 10) / 10;
      return s + (l.weight ?? bodyweightKg ?? 70) * (l.reps ?? 0) * rpeMultiplier;
    }, 0);

  if (preAcuteLoad === 0) return null;

  // Full 28-day chronic load (including acute week), divided by the number of weeks
  // that actually have data. Dividing by a fixed 4 inflates the ratio for athletes in
  // weeks 2–4 of training (only 1–3 weeks of history → artificially low chronic average).
  const allWindowLogs = logs.filter((l) => now - l.loggedAt.getTime() <= 28 * msPerDay);
  const chronicLoad = allWindowLogs.reduce((s, l) => {
    const rpeMultiplier = (l.rpe ?? 10) / 10;
    return s + (l.weight ?? bodyweightKg ?? 70) * (l.reps ?? 0) * rpeMultiplier;
  }, 0);

  // Count active weeks = how many complete 7-day buckets are covered by training history.
  // Use oldest-log age rounded up to nearest week (max 4).
  // This correctly handles partial history (e.g. week-2 athlete has 2 active weeks, not 4)
  // and avoids boundary-date edge cases in per-bucket scanning.
  // Use reduce instead of spread to avoid stack overflow for large log arrays.
  const oldestLogAge = allWindowLogs.reduce(
    (max, l) => Math.max(max, now - l.loggedAt.getTime()),
    0,
  );
  const activeWeeks = Math.min(Math.ceil(oldestLogAge / (7 * msPerDay)), 4);

  const chronicWeekly = chronicLoad / Math.max(activeWeeks, 1);

  return Math.round((acuteLoad / chronicWeekly) * 100) / 100;
}

/**
 * Compute which week of the current mesocycle the athlete is in.
 *
 * Uses pre-computed deload week ranges to find the most recent deload,
 * then returns weeks elapsed since that deload (week after deload = week 1).
 * Falls back to counting from the first active week if no deload is found.
 */
function computeMesocycleWeek(
  logs: ExerciseLog[],
  targetDate: Date,
  deloadRanges: DeloadWeekRange[],
): number {
  const msPerWeek = 7 * 86_400_000;
  const maxWeeks = 24;

  // Find the most recent deload range that isn't the current week
  const currentWeekStart = new Date(targetDate.getTime() - msPerWeek);
  const pastDeloads = deloadRanges.filter((r) => r.end <= targetDate && r.start < currentWeekStart);

  if (pastDeloads.length > 0) {
    // Most recent deload (ranges are chronologically ordered from detectDeloadWeekRanges)
    const lastDeload = pastDeloads[pastDeloads.length - 1]!;
    const weeksAgo = Math.round((targetDate.getTime() - lastDeload.end.getTime()) / msPerWeek);
    return weeksAgo;
  }

  // No deload found: count from first active week (that week = week 1)
  const weeklySets: number[] = [];
  for (let w = maxWeeks - 1; w >= 0; w--) {
    const weekEnd = new Date(targetDate.getTime() - w * msPerWeek);
    const weekStart = new Date(weekEnd.getTime() - msPerWeek);
    const count = logs.filter(
      (l) => l.loggedAt > weekStart && l.loggedAt <= weekEnd && l.reps != null,
    ).length;
    weeklySets.push(count);
  }
  const firstActiveIndex = weeklySets.findIndex((s) => s > 0);
  if (firstActiveIndex === -1) return 1;
  return maxWeeks - 1 - (firstActiveIndex - 1);
}

/**
 * Calculate all training science insights from exercise logs.
 * The overrideMap parameter allows injecting a dynamic exercise→muscle mapping
 * (e.g. from localStorage or spreadsheet) to extend the hard-coded defaults.
 *
 * Orchestration order:
 * 1. Detect deload weeks from volume data (no e1RM dependency — avoids circular dependency)
 * 2. Compute e1RM trends excluding deload sessions (clean trends)
 * 3. Compute fatigue with deload awareness (skip e1RM decline during active deload)
 * 4. Derive phase, ACWR, and mesocycle week
 */
export function calculateTrainingInsights(
  logs: ExerciseLog[],
  targetDate: Date = new Date(),
  overrideMap?: Record<string, MuscleActivation>,
  bodyweightKg?: number,
  lifecycle?: DeloadLifecycle,
): TrainingInsights {
  // Step 1: Detect deload weeks from volume (set count) — no e1RM dependency
  const deloadRanges = detectDeloadWeekRanges(logs, targetDate);
  const currentWeekIsDeload = isInDeloadWeek(targetDate, deloadRanges);

  // Step 2: e1RM trends with deload sessions filtered out
  const e1rm = calculateE1RMInsights(logs, deloadRanges);

  // Step 3: Muscle group volume (uses all logs — deload doesn't affect set counting)
  const muscleGroups = calculateMuscleGroupInsights(logs, targetDate, overrideMap);

  // Step 4: Fatigue detection — skip e1RM decline check during active deload
  const fatigue = calculateFatigueInsight(
    logs,
    e1rm,
    targetDate,
    bodyweightKg,
    currentWeekIsDeload,
  );

  const isLifecycleDeload = lifecycle?.status === "active";
  const fatigueWithLifecycle: FatigueInsight = isLifecycleDeload
    ? {
        ...fatigue,
        shouldDeload: true,
        reason: lifecycle.triggerReason ?? fatigue.reason,
      }
    : fatigue;

  const phase = computeSystemicPhase(fatigueWithLifecycle);
  const acwr = computeACWR(logs, targetDate, bodyweightKg);
  const mesocycleWeek = lifecycle
    ? getMesocycleWeekFromLifecycle(lifecycle, targetDate)
    : fatigueWithLifecycle.shouldDeload
      ? 0
      : computeMesocycleWeek(logs, targetDate, deloadRanges);

  return {
    muscleGroups,
    e1rm,
    fatigue: fatigueWithLifecycle,
    phase,
    acwr,
    mesocycleWeek,
    deloadStatus: isLifecycleDeload ? "active" : "inactive",
    deloadStartedAt: lifecycle?.startedAtIso ?? null,
    deloadEndsAt: lifecycle?.endsAtIso ?? null,
    deloadTimeRemainingMs: getDeloadTimeRemainingMs(lifecycle, targetDate),
    e1rmPaused: isLifecycleDeload,
    plateauPaused: isLifecycleDeload,
    postStopConservativeSessionsRemaining: lifecycle?.postStopConservativeSessionsRemaining ?? 0,
    deloadTriggerSnapshot: lifecycle?.triggerSnapshot ?? null,
  };
}

export interface FatigueTriggerEvidence {
  volumeIncreasing: boolean;
  volumeSpike: boolean;
  decliningExercises: number;
  performanceDecline: boolean;
  deloadTriggersPaused: boolean;
  tonnageSpike: boolean;
  inactiveTrigger: boolean;
  returningAthlete: boolean;
  buildTrigger: boolean;
  // Set when deloadTriggersPaused — snapshot values from when the deload was triggered
  snapshotVolumeDeltaPct: number | null;
  snapshotTonnageDeltaPct: number | null;
}

/**
 * Derive explicit trigger evidence from already-computed insights.
 * Keeps UI trigger rendering consistent with service-layer fatigue rules.
 */
export function calculateFatigueTriggerEvidence(
  insights: TrainingInsights,
): FatigueTriggerEvidence {
  const deloadTriggersPaused = insights.e1rmPaused;
  const snapshot = insights.deloadTriggerSnapshot;

  // --- During active deload: use frozen snapshot to show WHAT triggered the deload ---
  // This preserves the original purpose of trigger details: show why the deload started,
  // not misleading zeroed live values.
  if (deloadTriggersPaused && snapshot?.triggeredBy) {
    const tb = snapshot.triggeredBy;

    // Recompute display delta values from the snapshot arrays (pre-deload peak)
    const snapshotVolumeDeltaPct = (() => {
      const s = snapshot.weeklyTotalSets;
      if (s.length < 4) return null;
      const prior = ((s[0] ?? 0) + (s[1] ?? 0) + (s[2] ?? 0)) / 3;
      if (prior <= 0) return null;
      return Math.round(((s[3] ?? 0) - prior) / prior * 100);
    })();

    const snapshotTonnageDeltaPct = (() => {
      const t = snapshot.weeklyTonnage;
      if (t.length < 4) return null;
      const prior = ((t[0] ?? 0) + (t[1] ?? 0) + (t[2] ?? 0)) / 3;
      if (prior <= 0) return null;
      return Math.round(((t[3] ?? 0) - prior) / prior * 100);
    })();

    // Phase triggers (inactive, returning, build) are assessed from live data even during deload
    const weeklySets = insights.fatigue.weeklyTotalSets;
    const thisWeekSets = weeklySets[3] ?? 0;
    const prevWeekSets = weeklySets[2] ?? 0;

    return {
      volumeSpike: tb.includes("volumeSpike"),
      volumeIncreasing: tb.includes("volumeIncreasing"),
      decliningExercises: snapshot.decliningExercisesAtStart ?? 0,
      performanceDecline: tb.includes("performanceDecline"),
      tonnageSpike: tb.includes("tonnageSpike"),
      deloadTriggersPaused: true,
      snapshotVolumeDeltaPct,
      snapshotTonnageDeltaPct,
      inactiveTrigger: false,
      returningAthlete: prevWeekSets === 0 && thisWeekSets > 0,
      buildTrigger: thisWeekSets > prevWeekSets && thisWeekSets >= 10,
    };
  }

  // --- Not in deload (or in deload but no snapshot): live assessment ---
  const weeklySets = insights.fatigue.weeklyTotalSets;
  const weeklyTonnage = insights.fatigue.weeklyTonnage;

  const thisWeekSets = weeklySets[3] ?? 0;
  const prevWeekSets = weeklySets[2] ?? 0;
  const priorSetsAvg =
    weeklySets.length >= 4
      ? ((weeklySets[0] ?? 0) + (weeklySets[1] ?? 0) + (weeklySets[2] ?? 0)) / 3
      : 0;

  const thisWeekTonnage = weeklyTonnage[3] ?? 0;
  const priorTonnageAvg =
    weeklyTonnage.length >= 4
      ? ((weeklyTonnage[0] ?? 0) + (weeklyTonnage[1] ?? 0) + (weeklyTonnage[2] ?? 0)) / 3
      : 0;

  const volumeIncreasing =
    !deloadTriggersPaused &&
    weeklySets.length >= 4 &&
    weeklySets.every((sets, i) => i === 0 || sets > (weeklySets[i - 1] ?? 0));

  const volumeSpike = !deloadTriggersPaused && priorSetsAvg >= 12 && thisWeekSets > priorSetsAvg * 1.25;

  let decliningExercises = 0;
  if (!deloadTriggersPaused) {
    for (const data of Object.values(insights.e1rm)) {
      if (data.trend.length >= 3) {
        const current = data.trend[data.trend.length - 1] ?? 0;
        const prior2Avg =
          ((data.trend[data.trend.length - 2] ?? 0) +
            (data.trend[data.trend.length - 3] ?? 0)) /
          2;
        if (prior2Avg > 0 && current < prior2Avg * 0.95) decliningExercises++;
      }
    }
  }

  const performanceDecline = !deloadTriggersPaused && decliningExercises >= 2;
  const tonnageSpike = !deloadTriggersPaused && priorTonnageAvg > 0 && thisWeekTonnage > priorTonnageAvg * 1.5;

  const inactiveTrigger = !deloadTriggersPaused && thisWeekSets + prevWeekSets < 24;
  const returningAthlete = prevWeekSets === 0 && thisWeekSets > 0;
  const buildTrigger = thisWeekSets > prevWeekSets && thisWeekSets >= 10;

  return {
    volumeIncreasing,
    volumeSpike,
    decliningExercises,
    performanceDecline,
    deloadTriggersPaused,
    tonnageSpike,
    inactiveTrigger,
    returningAthlete,
    buildTrigger,
    snapshotVolumeDeltaPct: null,
    snapshotTonnageDeltaPct: null,
  };
}


export interface TrainingInsightsSummary {
  headline: string;
  explanation: string;
  nextAction: string;
  transparency: string;
  activeTriggerLabels: string[];
  triggerCount: number;
}

export function summarizeTrainingInsights(
  insights: TrainingInsights,
): TrainingInsightsSummary {
  const evidence = calculateFatigueTriggerEvidence(insights);
  const activeTriggerLabels = [
    evidence.volumeSpike ? "Volume spike" : null,
    evidence.volumeIncreasing ? "4-week ramp" : null,
    evidence.performanceDecline ? "Strength decline" : null,
    evidence.tonnageSpike ? "Tonnage spike" : null,
  ].filter((label): label is string => label !== null);

  if (insights.deloadStatus === "active") {
    return {
      headline: "Deload week active",
      explanation:
        insights.fatigue.reason ??
        "Recovery week is active due to high recent stress.",
      nextAction:
        "Keep load low, move well, then ramp up after deload.",
      transparency:
        activeTriggerLabels.length > 0
          ? `Snapshot at deload start: ${activeTriggerLabels.join(", ")}.`
          : "Snapshot from deload start.",
      activeTriggerLabels,
      triggerCount: activeTriggerLabels.length,
    };
  }

  if (insights.phase === "Build") {
    return {
      headline: "Build phase",
      explanation:
        activeTriggerLabels.length > 0
          ? `Workload is building and ${activeTriggerLabels.length} fatigue signal${activeTriggerLabels.length === 1 ? " is" : "s are"} already elevated.`
          : "Build is active and recovery still looks good.",
      nextAction:
        activeTriggerLabels.length >= 2
          ? "Progress carefully. Add less volume and prioritize recovery."
          : "Use small jumps in load or reps.",
      transparency: "Using live training data.",
      activeTriggerLabels,
      triggerCount: activeTriggerLabels.length,
    };
  }

  if (insights.phase === "Maintain") {
    return {
      headline: "Maintain phase",
      explanation: "Stress is stable. Maintain performance.",
      nextAction: "Keep volume steady. Add work only if recovery stays strong.",
      transparency: "Using live training data.",
      activeTriggerLabels,
      triggerCount: activeTriggerLabels.length,
    };
  }

  return {
    headline: "Inactive phase",
    explanation: "Training dose is currently too low.",
    nextAction: "Rebuild consistency first: add sessions or sets.",
    transparency: "Using live training data.",
    activeTriggerLabels,
    triggerCount: activeTriggerLabels.length,
  };
}
