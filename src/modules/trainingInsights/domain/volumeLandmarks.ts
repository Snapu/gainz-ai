import { VALID_MUSCLE_GROUPS } from "@/modules/sharedKernel/domain";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import { getMuscleActivation, type MuscleActivation, type MuscleGroup } from "./exerciseMuscleMap";

/** Volume landmarks relative to MEV/MAV/MRV */
export type VolumeLandmark = "below_MEV" | "at_MEV" | "at_MAV" | "approaching_MRV" | "above_MRV";

export interface VolumeLandmarks {
  mev: number;
  mavLow: number;
  mavHigh: number;
  mrv: number;
}

interface WeeklyVolume {
  muscleGroup: MuscleGroup;
  /** EWMA-smoothed effective sets — used for landmark classification. Stable against boundary jitter. */
  sets: number;
  /** EWMA-smoothed direct sets — used for landmark classification. */
  directSets: number;
  /** Raw direct sets accumulated in the current ISO week (Mon 00:00 → targetDate). For display only. */
  isoWeekDirectSets: number;
  /** Raw effective sets accumulated in the current ISO week (Mon 00:00 → targetDate). For display only. */
  isoWeekSets: number;
  frequencyPerWeek: number;
  hoursSinceLastTrained: number | null;
  recoveryHours: number;
}

export interface MuscleGroupInsight {
  /**
   * EWMA-smoothed effective sets over a 7-day trailing window.
   * Used for landmark classification — stable against daily boundary jitter.
   */
  sets: number;
  /**
   * EWMA-smoothed direct sets over a 7-day trailing window.
   * Used for landmark classification.
   */
  directSets: number;
  /**
   * Raw effective sets accumulated since the start of the current ISO week (Monday 00:00).
   * Use this for display so the athlete sees "sets this week" matching their mental model.
   */
  isoWeekSets: number;
  /**
   * Raw direct sets accumulated since the start of the current ISO week.
   * Use this for display.
   */
  isoWeekDirectSets: number;
  landmark: VolumeLandmark;
  frequencyPerWeek: number;
  hoursSinceLastTrained: number | null;
  recoveryHours: number;
  recoveryReady: boolean;
}

/**
 * Weekly hypertrophy volume landmarks by muscle group.
 *
 * Research basis:
 * - Practical volume landmarks (MEV/MAV/MRV) framework from Israetel et al.
 *   ("Volume Landmarks for Muscle Growth", RP, 2017-2019 practical synthesis).
 * - Meta-analyses consistently show a dose-response relationship between weekly
 *   set volume and hypertrophy up to relatively high set counts before plateauing
 *   (Schoenfeld et al., 2017; Baz-Valle et al., 2022).
 *
 * Implementation note:
 * - These thresholds are calibrated to this app's "effective sets" model
 *   (direct sets + weighted secondary contributions), not strict direct-only sets.
 */
export const VOLUME_LANDMARKS: Record<MuscleGroup, VolumeLandmarks> = {
  Chest: { mev: 8, mavLow: 12, mavHigh: 18, mrv: 22 },
  Back: { mev: 8, mavLow: 14, mavHigh: 20, mrv: 25 },
  Quads: { mev: 6, mavLow: 12, mavHigh: 18, mrv: 20 },
  Hamstrings: { mev: 6, mavLow: 10, mavHigh: 16, mrv: 20 },
  Shoulders: { mev: 6, mavLow: 12, mavHigh: 20, mrv: 24 },
  Biceps: { mev: 4, mavLow: 8, mavHigh: 18, mrv: 24 },
  Triceps: { mev: 4, mavLow: 8, mavHigh: 16, mrv: 20 },
  Abs: { mev: 2, mavLow: 8, mavHigh: 16, mrv: 22 },
  Calves: { mev: 6, mavLow: 10, mavHigh: 18, mrv: 22 },
  Glutes: { mev: 6, mavLow: 8, mavHigh: 16, mrv: 20 },
};

/**
 * Minimum recovery window (hours) before hard re-stimulation.
 *
 * Research basis:
 * - Muscle protein synthesis and performance recovery generally normalize within
 *   ~24-72h depending on muscle size, damage, and training status
 *   (Damas et al., 2016; Schoenfeld et al., 2019 frequency review).
 *
 * Practical rule:
 * - Larger/high-fatigue groups are assigned 72h, smaller groups 24-48h.
 */
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
  Glutes: 72,
};

export function classifyLandmark(sets: number, muscleGroup: MuscleGroup): VolumeLandmark {
  const { mev, mavLow, mavHigh, mrv } = VOLUME_LANDMARKS[muscleGroup];

  if (sets >= mrv) return "above_MRV";
  if (sets >= mavHigh) return "approaching_MRV";
  if (sets >= mavLow) return "at_MAV";
  if (sets >= mev) return "at_MEV";
  return "below_MEV";
}

/**
 * Returns the Monday 00:00:00.000 (local time) of the ISO week containing `date`.
 *
 * ISO weeks start on Monday (day 1). JavaScript's getDay() returns 0=Sun, 1=Mon…6=Sat.
 * We shift by 1 so that Sunday (0) becomes day 6 and Monday (1) becomes day 0.
 */
export function getIsoWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, …, 6=Sat
  const daysFromMonday = (day + 6) % 7; // Mon→0, Tue→1, …, Sun→6
  d.setDate(d.getDate() - daysFromMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Accumulates per-muscle-group effective sets and direct sets for all logs
 * that fall within the given date range (startInclusive, endInclusive].
 *
 * Internal helper shared by EWMA and ISO-week calculations.
 */
function accumulateMuscleVolume(
  logs: ExerciseLog[],
  startInclusive: Date,
  endInclusive: Date,
  overrideMap?: Record<string, MuscleActivation>,
): {
  muscleVolume: Map<MuscleGroup, number>;
  directMuscleVolume: Map<MuscleGroup, number>;
  muscleLastTrained: Map<MuscleGroup, Date>;
  muscleTrainingDays: Map<MuscleGroup, Set<string>>;
} {
  const muscleVolume = new Map<MuscleGroup, number>();
  const directMuscleVolume = new Map<MuscleGroup, number>();
  const muscleLastTrained = new Map<MuscleGroup, Date>();
  const muscleTrainingDays = new Map<MuscleGroup, Set<string>>();

  const windowLogs = logs.filter((l) => l.loggedAt >= startInclusive && l.loggedAt <= endInclusive);

  for (const log of windowLogs) {
    const activation = getMuscleActivation(log.exerciseName, overrideMap);
    if (!activation) continue;

    const dayKey = log.loggedAt.toDateString();
    const markMuscleTraining = (muscleGroup: MuscleGroup): void => {
      const days = muscleTrainingDays.get(muscleGroup) ?? new Set<string>();
      days.add(dayKey);
      muscleTrainingDays.set(muscleGroup, days);

      const prevLast = muscleLastTrained.get(muscleGroup);
      if (!prevLast || log.loggedAt > prevLast) {
        muscleLastTrained.set(muscleGroup, log.loggedAt);
      }
    };

    muscleVolume.set(
      activation.primaryMuscle,
      (muscleVolume.get(activation.primaryMuscle) ?? 0) + 1,
    );
    directMuscleVolume.set(
      activation.primaryMuscle,
      (directMuscleVolume.get(activation.primaryMuscle) ?? 0) + 1,
    );
    markMuscleTraining(activation.primaryMuscle);

    /**
     * Indirect work contributes a discounted hypertrophy stimulus.
     * We also count secondary exposure as a "trained day" for frequency so the
     * readiness signal reflects total weekly muscle stress, not only direct isolation work.
     */
    for (const secondary of activation.secondaryMuscles) {
      muscleVolume.set(
        secondary.muscleGroup,
        (muscleVolume.get(secondary.muscleGroup) ?? 0) + secondary.contribution,
      );
      markMuscleTraining(secondary.muscleGroup);
    }
  }

  return { muscleVolume, directMuscleVolume, muscleLastTrained, muscleTrainingDays };
}

/**
 * Computes a 7-day trailing EWMA of per-muscle daily set volume.
 *
 * Why EWMA instead of a raw rolling window:
 * - A hard 7-day boundary causes landmarks to flip when a session ages out of the
 *   window (e.g. "Monday morning" drops last Monday's session, reducing volume 33%).
 * - An EWMA applies exponentially decaying weight to each day, so no single day's
 *   boundary causes a discrete jump.
 *
 * λ = 0.25 maps to a characteristic time of 1/λ = 4 days, with significant weight
 * still carried beyond 7 days — matching the "7-day window" semantic while smoothing
 * day-boundary discontinuities.
 *
 * Implementation:
 * - Walk the last 28 days (4 × EWMA characteristic time), day by day oldest-first.
 * - For each day, compute the total sets stimulated for each muscle group.
 * - Calculate an Adaptive Recovery requirement based on the volume ratio to MEV.
 *   (Supported by EIMD dose-dependence (Schoenfeld, 2010) and MPS time-course (Ahtiainen, 2015)).
 * - Feed into EWMA: ewma = λ × daily_sets + (1 - λ) × ewma
 * - The final EWMA value is the smoothed "weekly equivalent" set count for that muscle.
 */
const EWMA_LAMBDA = 0.25;
const EWMA_LOOKBACK_DAYS = 28;

export function calculateWeeklyVolume(
  logs: ExerciseLog[],
  targetDate: Date,
  overrideMap?: Record<string, MuscleActivation>,
): WeeklyVolume[] {
  // --- ISO-week raw counts (for display) ---
  const isoWeekStart = getIsoWeekStart(targetDate);
  const isoWeekData = accumulateMuscleVolume(logs, isoWeekStart, targetDate, overrideMap);

  // --- EWMA-smoothed counts (for classification) ---
  // Initialise one EWMA accumulator per muscle group.
  const ewmaSets = new Map<MuscleGroup, number>();
  const ewmaDirectSets = new Map<MuscleGroup, number>();

  // Track the session that dictates the recovery target date
  const recoveryDictatingSession = new Map<
    MuscleGroup,
    { date: Date; adaptiveHours: number; targetDate: Date }
  >();

  for (const mg of VALID_MUSCLE_GROUPS) {
    ewmaSets.set(mg, 0);
    ewmaDirectSets.set(mg, 0);
  }

  // Walk oldest → newest across the lookback window, one calendar day at a time.
  for (let daysBack = EWMA_LOOKBACK_DAYS; daysBack >= 0; daysBack--) {
    const dayStart = new Date(targetDate);
    dayStart.setDate(dayStart.getDate() - daysBack);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const {
      muscleVolume: dayVolume,
      directMuscleVolume: dayDirectVolume,
      muscleLastTrained: dayLastTrained,
    } = accumulateMuscleVolume(logs, dayStart, dayEnd, overrideMap);

    // Apply EWMA update for every muscle group.
    for (const mg of VALID_MUSCLE_GROUPS) {
      const dailySets = dayVolume.get(mg) ?? 0;
      const dailyDirectSets = dayDirectVolume.get(mg) ?? 0;

      // Adaptive Recovery Calculation
      // EIMD and MPS response are dose-dependent (Schoenfeld 2010, MacDougall 1995).
      // Fractional exposures (e.g. 0.2 sets) accelerate recovery via Repeated Bout Effect (Tufano 2012)
      // and do not reset the full recovery clock.
      if (dailySets > 0) {
        const mev = VOLUME_LANDMARKS[mg].mev;
        const baseHours = RECOVERY_HOURS[mg];
        // Scale recovery based on daily volume relative to MEV, capped at 1.25x penalty
        const ratio = Math.min(dailySets / mev, 1.25);
        const adaptiveHours = baseHours * ratio;

        // The exact time of the last log for this muscle on this day
        const sessionDate = dayLastTrained.get(mg)!;
        const targetTime = sessionDate.getTime() + adaptiveHours * 3600000;

        const currentDictating = recoveryDictatingSession.get(mg);
        // Only update if this session pushes the recovery target further into the future
        if (!currentDictating || targetTime > currentDictating.targetDate.getTime()) {
          recoveryDictatingSession.set(mg, {
            date: sessionDate,
            adaptiveHours,
            targetDate: new Date(targetTime),
          });
        }
      }

      ewmaSets.set(mg, EWMA_LAMBDA * dailySets + (1 - EWMA_LAMBDA) * (ewmaSets.get(mg) ?? 0));
      ewmaDirectSets.set(
        mg,
        EWMA_LAMBDA * dailyDirectSets + (1 - EWMA_LAMBDA) * (ewmaDirectSets.get(mg) ?? 0),
      );
    }
  }

  // --- Frequency from the trailing 7 days (unchanged semantics) ---
  const sevenDaysAgo = new Date(targetDate.getTime() - 7 * 86400000);
  const { muscleTrainingDays } = accumulateMuscleVolume(
    logs,
    sevenDaysAgo,
    targetDate,
    overrideMap,
  );

  // --- Assemble results ---
  const result: WeeklyVolume[] = [];
  for (const muscleGroup of VALID_MUSCLE_GROUPS) {
    // EWMA calculates a smoothed *daily* value. We multiply by 7 to get the weekly equivalent
    // to compare against the weekly volume landmarks (e.g. MEV = 8 sets/wk).
    const smoothedSets = (ewmaSets.get(muscleGroup) ?? 0) * 7;
    // Only include muscle groups that have been trained at all in the lookback window.
    if (smoothedSets === 0 && !isoWeekData.muscleVolume.has(muscleGroup)) continue;

    const dictating = recoveryDictatingSession.get(muscleGroup);
    const hoursSince = dictating
      ? (targetDate.getTime() - dictating.date.getTime()) / (1000 * 3600)
      : null;
    const recoveryHours = dictating?.adaptiveHours ?? RECOVERY_HOURS[muscleGroup];
    const trainedDays = muscleTrainingDays.get(muscleGroup)?.size ?? 0;

    result.push({
      muscleGroup,
      sets: smoothedSets,
      directSets: (ewmaDirectSets.get(muscleGroup) ?? 0) * 7,
      isoWeekSets: isoWeekData.muscleVolume.get(muscleGroup) ?? 0,
      isoWeekDirectSets: isoWeekData.directMuscleVolume.get(muscleGroup) ?? 0,
      frequencyPerWeek: trainedDays,
      hoursSinceLastTrained: hoursSince,
      recoveryHours,
    });
  }

  return result;
}

export function isRecovered(hoursSinceLastTrained: number | null, recoveryHours: number): boolean {
  if (hoursSinceLastTrained === null) return true;
  return hoursSinceLastTrained >= recoveryHours;
}

export function calculateMuscleGroupInsights(
  logs: ExerciseLog[],
  targetDate: Date = new Date(),
  overrideMap?: Record<string, MuscleActivation>,
): Partial<Record<MuscleGroup, MuscleGroupInsight>> {
  const weeklyVolumes = calculateWeeklyVolume(logs, targetDate, overrideMap);
  const result: Partial<Record<MuscleGroup, MuscleGroupInsight>> = {};

  for (const volume of weeklyVolumes) {
    // Landmark classification uses the EWMA-smoothed value — stable against jitter.
    const landmark = classifyLandmark(volume.sets, volume.muscleGroup);
    const recovered = isRecovered(volume.hoursSinceLastTrained, volume.recoveryHours);

    result[volume.muscleGroup] = {
      sets: Math.round(volume.sets * 10) / 10,
      directSets: Math.round(volume.directSets * 10) / 10,
      isoWeekSets: Math.round(volume.isoWeekSets * 10) / 10,
      isoWeekDirectSets: Math.round(volume.isoWeekDirectSets * 10) / 10,
      landmark,
      frequencyPerWeek: volume.frequencyPerWeek,
      hoursSinceLastTrained: volume.hoursSinceLastTrained,
      recoveryHours: volume.recoveryHours,
      recoveryReady: recovered,
    };
  }

  return result;
}
