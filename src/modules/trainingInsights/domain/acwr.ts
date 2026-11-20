import { getLocalDayIndex } from "@/modules/sharedKernel/domain";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import { computeEwma, DEFAULT_EWMA_LAMBDA_ACUTE, DEFAULT_EWMA_LAMBDA_CHRONIC } from "./ewma";

/**
 * Calculates the internal load of a single set for ACWR purposes.
 * Previously used Tonnage (weight * reps), which incorrectly tracked phase
 * transitions (Flaw 2A in academic review) and broke calisthenics tracking.
 * Now uses RPE-Weighted Sets (Internal Load proxy), where each set contributes
 * its RPE to the total load. Default RPE 8 assumes a "hard working set".
 *
 * Reference:
 * - Foster C et al. (2001). A new approach to monitoring exercise training.
 *   J Strength Cond Res, 15(1), 109-115. (Pioneered Session-RPE internal load)
 */
function calculateSetLoad(log: ExerciseLog): number {
  return log.rpe ?? 8;
}

/**
 * Aggregates exercise logs into a map of { dayKey → total volume load }.
 * dayKey = floor(timestamp / MS_PER_DAY), i.e. the UTC day index.
 * Logs dated after `targetDate` are excluded.
 */
function buildDailyLoadMap(logs: ExerciseLog[], targetDate: Date): Map<number, number> {
  const targetDay = getLocalDayIndex(targetDate);
  const dailyLoads = new Map<number, number>();

  for (const log of logs) {
    const dayKey = getLocalDayIndex(log.loggedAt);
    if (dayKey > targetDay) continue; // Ignore future logs
    dailyLoads.set(dayKey, (dailyLoads.get(dayKey) ?? 0) + calculateSetLoad(log));
  }

  return dailyLoads;
}

/**
 * Computes the ACWR using Exponentially Weighted Moving Averages (EWMA).
 *
 * EWMA weights recent loads more heavily than older loads, making the ratio
 * more responsive to sudden training spikes and less sensitive to stale data.
 * This method is preferred over the simple rolling-average approach in
 * current sports-science literature.
 *
 * Algorithm (per day, stepping forward from the oldest log to `targetDate`):
 *   EWMAacute(d)   = λa × Load(d) + (1 − λa) × EWMAacute(d − 1)
 *   EWMAchronic(d) = λc × Load(d) + (1 − λc) × EWMAchronic(d − 1)
 *   ACWR           = EWMAacute / EWMAchronic
 *
 * Days with no training contribute a load of 0, allowing the EWMA to decay
 * naturally — this correctly models recovery periods.
 *
 * Decay constants default to λa = 0.28, λc = 0.10 (Murray et al., 2017).
 * A longer history improves accuracy (EWMA warm-up effect); at minimum,
 * logs older than 7 days are required before returning a result.
 *
 * Returns `null` when:
 * - No logs are provided,
 * - All logs are within 7 days of `targetDate` (insufficient warm-up), or
 * - EWMAchronic is 0 at `targetDate`.
 *
 * References:
 * - Murray NB et al. (2017). Calculating acute:chronic workload ratios using
 *   exponentially weighted moving averages: a practical guide for clinicians.
 *   Br J Sports Med, 51(3), 209-210.
 * - Impellizzeri FM et al. (2020). Internal and external training load: 15 years on.
 *   Int J Sports Physiol Perform, 14(2), 270-273.
 */
export function computeEWMAACWR(
  logs: ExerciseLog[],
  targetDate: Date,
  lambdaAcute = DEFAULT_EWMA_LAMBDA_ACUTE,
  lambdaChronic = DEFAULT_EWMA_LAMBDA_CHRONIC,
): number | null {
  if (logs.length === 0) return null;

  const targetDay = getLocalDayIndex(targetDate);
  const dailyLoads = buildDailyLoadMap(logs, targetDate);

  const ewmaResult = computeEwma(dailyLoads, targetDay, lambdaAcute, lambdaChronic, 7);
  return ewmaResult?.ratio ?? null;
}
