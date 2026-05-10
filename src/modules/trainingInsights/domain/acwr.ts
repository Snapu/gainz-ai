import type { ExerciseLog } from "@/modules/trainingLogs/domain";

/**
 * Default EWMA decay constants recommended by Murray et al. (2017).
 *
 * Acute  λ = 0.28  ≈ 2/(7+1)  — 7-day exponential window
 * Chronic λ = 0.10  ≈ 2/(28+1) — 28-day exponential window
 *
 * Reference: Murray NB et al. (2017). Calculating acute:chronic workload ratios using
 * exponentially weighted moving averages: a practical guide for clinicians.
 * Br J Sports Med, 51(3), 209-210.
 */
const DEFAULT_EWMA_LAMBDA_ACUTE = 0.28;
const DEFAULT_EWMA_LAMBDA_CHRONIC = 0.1;

const MS_PER_DAY = 86_400_000;

/**
 * Returns the raw volume load for a single set: weight (kg) × reps.
 *
 * RPE is deliberately excluded here. Applying RPE as a simple linear multiplier
 * (e.g. rpe/10) has no established evidence base and distorts tonnage comparisons
 * across different athletes and exercises. Raw volume load is the most widely
 * validated load metric for ACWR in resistance-training research.
 *
 * Reference: Haff GG & Triplett NT (2003). Essentials of Strength Training and
 * Conditioning (3rd ed.). Human Kinetics.
 */
function calculateSetLoad(weight: number, reps: number): number {
  return weight * reps;
}

/**
 * Aggregates exercise logs into a map of { dayKey → total volume load }.
 * dayKey = floor(timestamp / MS_PER_DAY), i.e. the UTC day index.
 * Logs dated after `targetDate` are excluded.
 */
function buildDailyLoadMap(logs: ExerciseLog[], targetDate: Date): Map<number, number> {
  const targetDay = Math.floor(targetDate.getTime() / MS_PER_DAY);
  const dailyLoads = new Map<number, number>();

  for (const log of logs) {
    const dayKey = Math.floor(log.loggedAt.getTime() / MS_PER_DAY);
    if (dayKey > targetDay) continue; // Ignore future logs
    dailyLoads.set(
      dayKey,
      (dailyLoads.get(dayKey) ?? 0) + calculateSetLoad(log.weight ?? 0, log.reps ?? 0),
    );
  }

  return dailyLoads;
}

/**
 * Computes the Acute:Chronic Workload Ratio (ACWR) using a simple rolling-average method.
 *
 * - Acute load  = total volume load in the 7 days ending on `targetDate`
 * - Chronic load = average weekly volume load over the 28-day window (always ÷ 4)
 * - ACWR = Acute / Chronic
 *
 * The chronic denominator is always 4 regardless of how many weeks contain data.
 * Dividing by fewer weeks during early training would artificially inflate the ratio
 * and create false injury-risk signals — a documented limitation of variable-denominator
 * approaches (Windt & Gabbett, 2019).
 *
 * Returns `null` when:
 * - There are no logs at all, or
 * - All logs fall within the acute window (< 8 days old) — insufficient chronic baseline.
 *
 * The "sweet spot" zone of ACWR 0.8–1.3 is associated with lower injury risk (Gabbett, 2016),
 * though this threshold is contested for resistance training. Prefer `computeEWMAACWR` for
 * a more sensitive and statistically robust estimate.
 *
 * References:
 * - Gabbett TJ (2016). The training—injury prevention paradox: should athletes be training
 *   smarter and harder? Br J Sports Med, 50(5), 273-280.
 * - Hulin BT et al. (2014). Spikes in acute workload are associated with increased injury
 *   risk in elite cricket fast bowlers. Br J Sports Med, 48(8), 708-712.
 * - Windt J & Gabbett TJ (2019). Is it all for naught? What does mathematical coupling mean
 *   for acute:chronic workload ratios? Br J Sports Med, 53(16), 988-990.
 */
export function computeACWR(logs: ExerciseLog[], targetDate: Date): number | null {
  const now = targetDate.getTime();

  const hasPreAcuteData = logs.some((l) => {
    const age = now - l.loggedAt.getTime();
    return age > 7 * MS_PER_DAY && age <= 28 * MS_PER_DAY;
  });

  if (!hasPreAcuteData) return null;

  const acuteLoad = logs
    .filter((l) => {
      const age = now - l.loggedAt.getTime();
      return age >= 0 && age <= 7 * MS_PER_DAY;
    })
    .reduce((s, l) => s + calculateSetLoad(l.weight ?? 0, l.reps ?? 0), 0);

  const chronicTotal = logs
    .filter((l) => {
      const age = now - l.loggedAt.getTime();
      return age >= 0 && age <= 28 * MS_PER_DAY;
    })
    .reduce((s, l) => s + calculateSetLoad(l.weight ?? 0, l.reps ?? 0), 0);

  // Always divide by 4 weeks — see JSDoc above.
  const chronicWeekly = chronicTotal / 4;

  if (chronicWeekly === 0) return null;

  return Math.round((acuteLoad / chronicWeekly) * 100) / 100;
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

  const targetDay = Math.floor(targetDate.getTime() / MS_PER_DAY);

  // Only consider logs on or before targetDate
  const validLogs = logs.filter((l) => Math.floor(l.loggedAt.getTime() / MS_PER_DAY) <= targetDay);
  if (validLogs.length === 0) return null;

  const earliestDay = validLogs.reduce(
    (min, l) => Math.min(min, Math.floor(l.loggedAt.getTime() / MS_PER_DAY)),
    targetDay,
  );

  // Require at least 7 days of history for a meaningful EWMA warm-up.
  if (targetDay - earliestDay < 7) return null;

  const dailyLoads = buildDailyLoadMap(validLogs, targetDate);

  let ewmaAcute = 0;
  let ewmaChronic = 0;

  for (let day = earliestDay; day <= targetDay; day++) {
    const load = dailyLoads.get(day) ?? 0;
    ewmaAcute = lambdaAcute * load + (1 - lambdaAcute) * ewmaAcute;
    ewmaChronic = lambdaChronic * load + (1 - lambdaChronic) * ewmaChronic;
  }

  if (ewmaChronic === 0) return null;

  return Math.round((ewmaAcute / ewmaChronic) * 100) / 100;
}
