import type { ExerciseLog } from "@/services/exerciseLogs";
import { normalizeExerciseName } from "./exerciseMuscleMap";

/** A date range representing a detected deload week (exclusive start, inclusive end). */
export interface ExcludeRange {
  start: Date;
  end: Date;
}

/** E1RM tracking with trend analysis for a single exercise */
export interface ExerciseE1RM {
  e1rm: number;
  trend: number[];
  plateau: boolean;
  bestRPE?: number;
}

const PLATEAU_THRESHOLD = 0.05;
const MIN_E1RM_TREND_SESSIONS = 3;

/**
 * Zourdos et al. (2016) RPE-to-%1RM lookup table.
 *
 * Rows = reps performed (index 0 = 1 rep, index 11 = 12 reps).
 * Columns = RPE 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0.
 *
 * Values represent the fraction of 1RM lifted (e.g. 0.87 = 87% 1RM).
 * Reference: Zourdos MC et al. (2016). Novel resistance training-specific RPE
 * scale measuring repetitions in reserve. J Strength Cond Res, 30(1), 267-275.
 */
const ZOURDOS_TABLE: readonly (readonly number[])[] = [
  [0.78, 0.8, 0.83, 0.85, 0.87, 0.89, 0.91, 0.95, 1.0],
  [0.75, 0.77, 0.8, 0.82, 0.85, 0.87, 0.89, 0.92, 0.95],
  [0.72, 0.75, 0.77, 0.8, 0.82, 0.85, 0.87, 0.9, 0.93],
  [0.7, 0.72, 0.75, 0.77, 0.8, 0.82, 0.85, 0.87, 0.9],
  [0.67, 0.7, 0.72, 0.75, 0.77, 0.8, 0.82, 0.85, 0.87],
  [0.65, 0.67, 0.7, 0.72, 0.75, 0.77, 0.8, 0.82, 0.85],
  [0.62, 0.65, 0.67, 0.7, 0.72, 0.75, 0.77, 0.8, 0.82],
  [0.6, 0.62, 0.65, 0.67, 0.7, 0.72, 0.75, 0.77, 0.8],
  [0.57, 0.6, 0.62, 0.65, 0.67, 0.7, 0.72, 0.75, 0.77],
  [0.55, 0.57, 0.6, 0.62, 0.65, 0.67, 0.7, 0.72, 0.75],
  [0.53, 0.55, 0.57, 0.6, 0.62, 0.65, 0.67, 0.7, 0.72],
  [0.5, 0.53, 0.55, 0.57, 0.6, 0.62, 0.65, 0.67, 0.7],
] as const;

const RPE_STEPS = [6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0] as const;

function zourdosPercent(reps: number, rpe: number): number | null {
  if (reps < 1 || reps > 12) return null;
  const clampedRpe = Math.max(6.0, Math.min(10.0, rpe));
  const roundedRpe = Math.round(clampedRpe * 2) / 2;
  const colIdx = RPE_STEPS.indexOf(roundedRpe as (typeof RPE_STEPS)[number]);
  if (colIdx === -1) return null;
  return ZOURDOS_TABLE[reps - 1]![colIdx]!;
}

/**
 * Epley (1985): e1RM = weight x (1 + reps / 30)
 * Best for sets of 2-5 reps.
 * Reference: Epley B (1985). Poundage Chart. University of Nebraska.
 */
function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

/**
 * Mayhew et al. (1992): e1RM = (100 x weight) / (52.2 + 41.9 x e^(-0.055 x reps))
 * Best for sets of 6-20 reps; outperforms Epley and Brzycki at higher reps.
 * References:
 * - Mayhew JL et al. (1992). J Sports Med Phys Fitness, 32(1), 37-42.
 * - LeSuer DA et al. (1997). J Strength Cond Res, 11(4), 211-213.
 */
function mayhew(weight: number, reps: number): number {
  return (100 * weight) / (52.2 + 41.9 * Math.exp(-0.055 * reps));
}

/**
 * Estimates one-rep maximum (e1RM) from a single set.
 *
 * Formula selection:
 *   reps = 1        => weight (direct measure)
 *   reps 2-5        => Epley (1985)
 *   reps 6-20       => Mayhew et al. (1992)
 *   reps > 20       => null (estimation unreliable)
 *
 * RPE correction (Zourdos et al., 2016):
 *   When RPE is provided and in [6, 10] and reps <= 12, the Zourdos lookup
 *   table is used: e1RM = weight / pct1RM(reps, RPE). This is empirically
 *   derived from trained athletes and more accurate than the indirect RIR
 *   adjustment approach.
 *
 * Returns null when weight or reps <= 0, or reps > 20.
 *
 * References:
 * - Epley B (1985). Poundage Chart. University of Nebraska.
 * - Mayhew JL et al. (1992). J Sports Med Phys Fitness, 32(1), 37-42.
 * - LeSuer DA et al. (1997). J Strength Cond Res, 11(4), 211-213.
 * - Zourdos MC et al. (2016). J Strength Cond Res, 30(1), 267-275.
 */
export function calculateE1RM(weight: number, reps: number, rpe?: number): number | null {
  if (reps <= 0 || weight <= 0) return null;
  if (reps === 1) return weight;
  if (reps > 20) return null;

  if (rpe !== undefined && rpe >= 6 && rpe <= 10 && reps <= 12) {
    const pct = zourdosPercent(reps, rpe);
    if (pct !== null && pct > 0) {
      return Math.round((weight / pct) * 10) / 10;
    }
  }

  const estimate = reps <= 5 ? epley(weight, reps) : mayhew(weight, reps);
  return Math.round(estimate * 10) / 10;
}

export function calculateE1RMInsights(
  logs: ExerciseLog[],
  excludeRanges?: ExcludeRange[],
): Record<string, ExerciseE1RM> {
  const filteredLogs =
    excludeRanges && excludeRanges.length > 0
      ? logs.filter(
          (log) =>
            !excludeRanges.some((range) => log.loggedAt > range.start && log.loggedAt <= range.end),
        )
      : logs;

  const byExercise = new Map<string, Map<string, ExerciseLog[]>>();
  const displayNames = new Map<string, string>();

  for (const log of filteredLogs) {
    const canonical = normalizeExerciseName(log.exerciseName);
    if (!byExercise.has(canonical)) {
      byExercise.set(canonical, new Map());
      displayNames.set(canonical, log.exerciseName);
    }
    const dateKey = log.loggedAt.toDateString();
    const dayLogs = byExercise.get(canonical)!;
    if (!dayLogs.has(dateKey)) dayLogs.set(dateKey, []);
    dayLogs.get(dateKey)!.push(log);
  }

  const result: Record<string, ExerciseE1RM> = {};

  for (const [canonical, sessions] of byExercise) {
    const sortedDays = Array.from(sessions.keys()).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    );
    const sessionE1RMs = sortedDays.flatMap((day) => {
      const logsForDay = sessions.get(day)!;
      const estimates = logsForDay
        .map((l) => calculateE1RM(l.weight ?? 0, l.reps ?? 0, l.rpe))
        .filter((v): v is number => v !== null);
      if (estimates.length === 0) return [];
      return [Math.max(...estimates)];
    });

    if (sessionE1RMs.length === 0) continue;

    const trend = sessionE1RMs.slice(-4);
    const currentE1RM = Math.max(...trend);

    const plateauThreshold = currentE1RM * PLATEAU_THRESHOLD;
    const plateau =
      trend.length >= MIN_E1RM_TREND_SESSIONS &&
      trend.slice(-3).every((v) => Math.abs(v - currentE1RM) <= plateauThreshold);

    const allRPEs = sortedDays.flatMap((day) =>
      sessions.get(day)!.flatMap((l) => (l.rpe !== undefined && l.rpe > 0 ? [l.rpe] : [])),
    );
    const bestRPE = allRPEs.length > 0 ? Math.max(...allRPEs) : undefined;

    const displayName = displayNames.get(canonical);
    if (displayName) {
      result[displayName] = {
        e1rm: currentE1RM,
        trend,
        plateau,
        bestRPE,
      };
    }
  }

  return result;
}
