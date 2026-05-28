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
export const DEFAULT_EWMA_LAMBDA_ACUTE = 0.28;
export const DEFAULT_EWMA_LAMBDA_CHRONIC = 0.1;

export interface EwmaResult {
  /** The acute exponential moving average */
  acute: number;
  /** The chronic exponential moving average */
  chronic: number;
  /** The ratio (acute / chronic), rounded to 2 decimal places */
  ratio: number;
}

/**
 * Computes Exponentially Weighted Moving Averages (EWMA) over a timeline of daily values.
 *
 * Algorithm (per day, stepping forward from the oldest log to `targetDay`):
 *   EWMAacute(d)   = λa × Value(d) + (1 − λa) × EWMAacute(d − 1)
 *   EWMAchronic(d) = λc × Value(d) + (1 − λc) × EWMAchronic(d − 1)
 *   Ratio          = EWMAacute / EWMAchronic
 *
 * Days with no recorded value contribute 0, allowing the EWMA to decay
 * naturally — this correctly models physiological recovery periods.
 *
 * Returns `null` when:
 * - The timeline contains no values before or on `targetDay`,
 * - All values are within `minHistoryDays` of `targetDay` (insufficient warm-up for the chronic average), or
 * - EWMAchronic is 0 at `targetDay` (preventing division by zero).
 *
 * @param dailyValues Map of `day index -> value`. Day index = floor(timestamp / 86400000)
 * @param targetDay The target day index to compute the EWMA for
 * @param lambdaAcute Decay constant for the acute window (default 0.28)
 * @param lambdaChronic Decay constant for the chronic window (default 0.10)
 * @param minHistoryDays Minimum number of days between the oldest value and targetDay required for a valid chronic baseline (default 7)
 */
export function computeEwma(
  dailyValues: Map<number, number>,
  targetDay: number,
  lambdaAcute = DEFAULT_EWMA_LAMBDA_ACUTE,
  lambdaChronic = DEFAULT_EWMA_LAMBDA_CHRONIC,
  minHistoryDays = 7,
): EwmaResult | null {
  if (dailyValues.size === 0) return null;

  const validDays = Array.from(dailyValues.keys()).filter((d) => d <= targetDay);
  if (validDays.length === 0) return null;

  const earliestDay = Math.min(...validDays);

  // Require minimum history for a meaningful EWMA warm-up.
  if (targetDay - earliestDay < minHistoryDays) return null;

  let ewmaAcute = 0;
  let ewmaChronic = 0;

  for (let day = earliestDay; day <= targetDay; day++) {
    const val = dailyValues.get(day) ?? 0;
    ewmaAcute = lambdaAcute * val + (1 - lambdaAcute) * ewmaAcute;
    ewmaChronic = lambdaChronic * val + (1 - lambdaChronic) * ewmaChronic;
  }

  if (ewmaChronic === 0) return null;

  return {
    acute: ewmaAcute,
    chronic: ewmaChronic,
    ratio: Math.round((ewmaAcute / ewmaChronic) * 100) / 100,
  };
}
