import { getLocalDayIndex, VALID_MUSCLE_GROUPS } from "@/modules/sharedKernel/domain";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import type { ExerciseE1RM } from "./e1rm";
import {
  createMuscleActivationResolver,
  type MuscleActivation,
  type MuscleGroup,
} from "./exerciseMuscleMap";

/** Volume landmarks relative to MEV/MAV/MRV */
export type VolumeLandmark =
  | "detraining"
  | "below_MEV"
  | "at_MEV"
  | "at_MAV"
  | "approaching_MRV"
  | "above_MRV";

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
  volumeTrend: "up" | "down" | "flat";
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
  trendStatus?: "improving" | "plateau" | "dropping" | "stable";
  volumeTrend: "up" | "down" | "flat";
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
  Lats: { mev: 8, mavLow: 14, mavHigh: 20, mrv: 25 },
  "Upper Back": { mev: 8, mavLow: 14, mavHigh: 20, mrv: 25 },
  Quads: { mev: 6, mavLow: 12, mavHigh: 18, mrv: 20 },
  Hamstrings: { mev: 6, mavLow: 10, mavHigh: 16, mrv: 20 },
  "Front Delts": { mev: 6, mavLow: 12, mavHigh: 20, mrv: 24 },
  "Side Delts": { mev: 8, mavLow: 16, mavHigh: 22, mrv: 26 },
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
  Lats: 72,
  "Upper Back": 72,
  Quads: 72,
  Hamstrings: 72,
  "Front Delts": 48,
  "Side Delts": 24,
  Biceps: 48,
  Triceps: 48,
  Abs: 24,
  Calves: 24,
  Glutes: 72,
};

/**
 * Classifies weekly set volume into a Volume Landmark tier.
 *
 * Implements the Empirical Override Model:
 * Static tables (Israetel) have low individual predictive validity (Baz-Valle et al., 2022).
 * If empirical performance trend data is available, it completely overrides the static table:
 * - Improving: The athlete is adapting, therefore they are at MAV regardless of set count.
 * - Dropping: The athlete is failing to recover. If volume is high, they are >MRV. If low, they are <MEV.
 */
export function classifyLandmark(
  sets: number,
  muscleGroup: MuscleGroup,
  trendStatus?: "improving" | "plateau" | "dropping" | "stable",
): VolumeLandmark {
  const { mev, mavLow, mavHigh, mrv } = VOLUME_LANDMARKS[muscleGroup];

  // Absolute floor: If you are doing basically zero volume, you are detraining,
  // regardless of what a lagging 1RM trend says.
  if (sets < mev / 2) {
    return "detraining";
  }

  if (trendStatus === "improving") {
    if (sets < mev) return "at_MEV";
    return "at_MAV";
  }

  if (trendStatus === "dropping") {
    if (sets < mavLow) return "below_MEV"; // Detraining or severe cut
    return "above_MRV"; // Overreaching / under-recovering
  }

  if (trendStatus === "plateau") {
    if (sets < mavLow) return "below_MEV"; // Needs more stimulus to progress
    if (sets >= mavHigh) return "approaching_MRV"; // Nudge toward deload/resensitization
    return "at_MAV"; // Adapted, but holding steady
  }

  // Fallback to static population averages
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

const EWMA_LAMBDA = 0.25;
const EWMA_LOOKBACK_DAYS = 28;
const MS_PER_DAY = 86_400_000;

interface DayVolumeBucket {
  muscleVolume: Map<MuscleGroup, number>;
  directMuscleVolume: Map<MuscleGroup, number>;
  muscleLastTrained: Map<MuscleGroup, Date>;
}

interface WindowVolumeBuckets {
  dayBuckets: (DayVolumeBucket | undefined)[];
  isoWeekVolume: Map<MuscleGroup, number>;
  isoWeekDirectVolume: Map<MuscleGroup, number>;
  muscleTrainingDays: Map<MuscleGroup, Set<number>>;
  hasActivity: boolean;
}

function addVolume(map: Map<MuscleGroup, number>, muscleGroup: MuscleGroup, delta: number): void {
  map.set(muscleGroup, (map.get(muscleGroup) ?? 0) + delta);
}

function getOrCreateDayBucket(
  dayBuckets: (DayVolumeBucket | undefined)[],
  index: number,
): DayVolumeBucket {
  let bucket = dayBuckets[index];
  if (!bucket) {
    bucket = {
      muscleVolume: new Map(),
      directMuscleVolume: new Map(),
      muscleLastTrained: new Map(),
    };
    dayBuckets[index] = bucket;
  }
  return bucket;
}

interface LogExposureContext {
  dayBucket: DayVolumeBucket;
  buckets: WindowVolumeBuckets;
  loggedAt: Date;
  logDayIndex: number;
  inIsoWeek: boolean;
  inLast7Days: boolean;
}

function recordMuscleExposure(
  ctx: LogExposureContext,
  muscleGroup: MuscleGroup,
  sets: number,
  isPrimary: boolean,
): void {
  addVolume(ctx.dayBucket.muscleVolume, muscleGroup, sets);
  if (isPrimary) {
    addVolume(ctx.dayBucket.directMuscleVolume, muscleGroup, sets);
  }

  const prevLast = ctx.dayBucket.muscleLastTrained.get(muscleGroup);
  if (!prevLast || ctx.loggedAt > prevLast) {
    ctx.dayBucket.muscleLastTrained.set(muscleGroup, ctx.loggedAt);
  }

  if (ctx.inIsoWeek) {
    addVolume(ctx.buckets.isoWeekVolume, muscleGroup, sets);
    if (isPrimary) {
      addVolume(ctx.buckets.isoWeekDirectVolume, muscleGroup, sets);
    }
  }

  if (ctx.inLast7Days) {
    let days = ctx.buckets.muscleTrainingDays.get(muscleGroup);
    if (!days) {
      days = new Set<number>();
      ctx.buckets.muscleTrainingDays.set(muscleGroup, days);
    }
    days.add(ctx.logDayIndex);
  }
}

/**
 * Single-pass bucketing of logs into local calendar days across the 29-day
 * EWMA lookback window, while simultaneously accumulating ISO-week totals
 * and trailing 7-day training-day frequency.
 */
function bucketWindowVolume(
  logs: ExerciseLog[],
  targetDate: Date,
  resolveActivation: (exerciseName: string) => MuscleActivation | null,
): WindowVolumeBuckets {
  const targetTime = targetDate.getTime();
  const isoWeekStartMs = getIsoWeekStart(targetDate).getTime();
  const sevenDaysAgoMs = targetTime - 7 * MS_PER_DAY;

  const windowStart = new Date(targetDate);
  windowStart.setDate(windowStart.getDate() - EWMA_LOOKBACK_DAYS);
  windowStart.setHours(0, 0, 0, 0);
  const windowStartMs = windowStart.getTime();

  const windowEnd = new Date(targetDate);
  windowEnd.setHours(23, 59, 59, 999);
  const windowEndMs = windowEnd.getTime();

  const minDayIndex = getLocalDayIndex(targetDate) - EWMA_LOOKBACK_DAYS;

  const buckets: WindowVolumeBuckets = {
    dayBuckets: new Array<DayVolumeBucket | undefined>(EWMA_LOOKBACK_DAYS + 1),
    isoWeekVolume: new Map(),
    isoWeekDirectVolume: new Map(),
    muscleTrainingDays: new Map(),
    hasActivity: false,
  };

  for (const log of logs) {
    const logTime = log.loggedAt.getTime();
    if (!(logTime >= windowStartMs && logTime <= windowEndMs)) continue;

    const activation = resolveActivation(log.exerciseName);
    if (!activation) continue;

    const logDayIndex = getLocalDayIndex(log.loggedAt);
    const bucketIndex = logDayIndex - minDayIndex;
    if (bucketIndex < 0 || bucketIndex > EWMA_LOOKBACK_DAYS) continue;

    const dayBucket = getOrCreateDayBucket(buckets.dayBuckets, bucketIndex);
    buckets.hasActivity = true;

    const ctx: LogExposureContext = {
      dayBucket,
      buckets,
      loggedAt: log.loggedAt,
      logDayIndex,
      inIsoWeek: logTime >= isoWeekStartMs && logTime <= targetTime,
      inLast7Days: logTime >= sevenDaysAgoMs && logTime <= targetTime,
    };

    recordMuscleExposure(ctx, activation.primaryMuscle, 1, true);

    /**
     * Indirect work contributes a discounted hypertrophy stimulus.
     * We also count secondary exposure as a "trained day" for frequency so the
     * readiness signal reflects total weekly muscle stress, not only direct isolation work.
     */
    for (const secondary of activation.secondaryMuscles) {
      recordMuscleExposure(ctx, secondary.muscleGroup, secondary.contribution, false);
    }
  }

  return buckets;
}

function computeWeeklyVolume(
  logs: ExerciseLog[],
  targetDate: Date,
  resolveActivation: (exerciseName: string) => MuscleActivation | null,
): WeeklyVolume[] {
  const { dayBuckets, isoWeekVolume, isoWeekDirectVolume, muscleTrainingDays, hasActivity } =
    bucketWindowVolume(logs, targetDate, resolveActivation);
  if (!hasActivity) return [];

  // --- EWMA-smoothed counts (for classification) ---
  // Initialise one EWMA accumulator per muscle group.
  const ewmaSets = new Map<MuscleGroup, number>();
  const ewmaDirectSets = new Map<MuscleGroup, number>();
  const ewmaSets7DaysAgo = new Map<MuscleGroup, number>();

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
  for (let bucketIndex = 0; bucketIndex <= EWMA_LOOKBACK_DAYS; bucketIndex++) {
    const daysBack = EWMA_LOOKBACK_DAYS - bucketIndex;
    const dayBucket = dayBuckets[bucketIndex];

    // Apply EWMA update for every muscle group.
    for (const mg of VALID_MUSCLE_GROUPS) {
      const dailySets = dayBucket?.muscleVolume.get(mg) ?? 0;
      const dailyDirectSets = dayBucket?.directMuscleVolume.get(mg) ?? 0;

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
        const sessionDate = dayBucket?.muscleLastTrained.get(mg);
        if (!sessionDate) continue;
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

      if (daysBack === 7) {
        ewmaSets7DaysAgo.set(mg, ewmaSets.get(mg) ?? 0);
      }
    }
  }

  // --- Assemble results ---
  const result: WeeklyVolume[] = [];
  for (const muscleGroup of VALID_MUSCLE_GROUPS) {
    // EWMA calculates a smoothed *daily* value. We multiply by 7 to get the weekly equivalent
    // to compare against the weekly volume landmarks (e.g. MEV = 8 sets/wk).
    const smoothedSets = (ewmaSets.get(muscleGroup) ?? 0) * 7;
    // Only include muscle groups that have been trained at all in the lookback window.
    if (smoothedSets === 0 && !isoWeekVolume.has(muscleGroup)) continue;

    const dictating = recoveryDictatingSession.get(muscleGroup);
    const hoursSince = dictating
      ? (targetDate.getTime() - dictating.date.getTime()) / (1000 * 3600)
      : null;
    const recoveryHours = dictating?.adaptiveHours ?? RECOVERY_HOURS[muscleGroup];
    const trainedDays = muscleTrainingDays.get(muscleGroup)?.size ?? 0;

    const oldSets = (ewmaSets7DaysAgo.get(muscleGroup) ?? 0) * 7;
    let volumeTrend: "up" | "down" | "flat" = "flat";
    if (smoothedSets > oldSets + 1) volumeTrend = "up";
    else if (smoothedSets < oldSets - 1) volumeTrend = "down";

    result.push({
      muscleGroup,
      sets: smoothedSets,
      directSets: (ewmaDirectSets.get(muscleGroup) ?? 0) * 7,
      isoWeekSets: isoWeekVolume.get(muscleGroup) ?? 0,
      isoWeekDirectSets: isoWeekDirectVolume.get(muscleGroup) ?? 0,
      frequencyPerWeek: trainedDays,
      hoursSinceLastTrained: hoursSince,
      recoveryHours,
      volumeTrend,
    });
  }

  return result;
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
export function calculateWeeklyVolume(
  logs: ExerciseLog[],
  targetDate: Date,
  overrideMap?: Record<string, MuscleActivation>,
): WeeklyVolume[] {
  return computeWeeklyVolume(logs, targetDate, createMuscleActivationResolver(overrideMap));
}

export function isRecovered(hoursSinceLastTrained: number | null, recoveryHours: number): boolean {
  if (hoursSinceLastTrained === null) return true;
  return hoursSinceLastTrained >= recoveryHours;
}

export function calculateMuscleGroupInsights(
  logs: ExerciseLog[],
  targetDate: Date = new Date(),
  overrideMap?: Record<string, MuscleActivation>,
  e1rmData?: Record<string, ExerciseE1RM>,
): Partial<Record<MuscleGroup, MuscleGroupInsight>> {
  const resolveActivation = createMuscleActivationResolver(overrideMap);
  const weeklyVolumes = computeWeeklyVolume(logs, targetDate, resolveActivation);
  if (weeklyVolumes.length === 0) return {};
  const result: Partial<Record<MuscleGroup, MuscleGroupInsight>> = {};

  // Aggregate e1rm trends per muscle group
  const muscleTrends = new Map<
    MuscleGroup,
    { improving: number; dropping: number; plateau: number; stable: number }
  >();
  if (e1rmData) {
    for (const [exerciseName, e1rm] of Object.entries(e1rmData)) {
      const activation = resolveActivation(exerciseName);
      if (!activation) continue;

      // We only consider the primary muscle group for trend aggregation
      const primaryMuscle = activation.primaryMuscle;
      let counts = muscleTrends.get(primaryMuscle);
      if (!counts) {
        counts = { improving: 0, dropping: 0, plateau: 0, stable: 0 };
        muscleTrends.set(primaryMuscle, counts);
      }

      const trend = e1rm.trend;
      const current = trend[trend.length - 1] ?? e1rm.e1rm;
      const previous = trend.length >= 2 ? (trend[trend.length - 2] ?? null) : null;
      const deltaPct =
        previous && previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

      let status: "plateau" | "improving" | "dropping" | "stable" = "stable";
      if (e1rm.plateau) {
        status = "plateau";
      } else if (deltaPct !== null && deltaPct >= 2) {
        status = "improving";
      } else if (deltaPct !== null && deltaPct <= -2) {
        status = "dropping";
      }

      counts[status]++;
    }
  }

  for (const volume of weeklyVolumes) {
    let trendStatus: "improving" | "plateau" | "dropping" | "stable" | undefined;

    if (e1rmData) {
      const counts = muscleTrends.get(volume.muscleGroup) ?? {
        improving: 0,
        dropping: 0,
        plateau: 0,
        stable: 0,
      };
      const totalTrained = counts.improving + counts.dropping + counts.plateau + counts.stable;

      if (totalTrained > 0) {
        if (counts.improving > 0) {
          trendStatus = "improving";
        } else if (counts.dropping === totalTrained) {
          trendStatus = "dropping";
        } else if (counts.plateau > 0) {
          trendStatus = "plateau";
        } else {
          trendStatus = "stable";
        }
      }
    }

    // Landmark classification uses the EWMA-smoothed value — stable against jitter.
    const landmark = classifyLandmark(volume.sets, volume.muscleGroup, trendStatus);
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
      trendStatus: landmark === "detraining" ? undefined : trendStatus,
      volumeTrend: volume.volumeTrend,
    };
  }

  return result;
}
