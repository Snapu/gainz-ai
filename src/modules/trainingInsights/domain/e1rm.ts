import type { ExerciseLog } from "@/modules/trainingLogs/domain";
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
  trendDates: Date[];
  plateau: boolean;
  /**
   * RPE of the set that produced the current e1RM estimate in the most recent session.
   *
   * Semantics (changed from historical-max to session-specific):
   * The AI uses this to decide whether the estimate is conservative — if the best
   * set of the last session was performed at RPE ≤ 7, there was meaningful reserve
   * remaining and the e1RM is likely underestimated.
   * Tracking the historical-max RPE was a bug: once an RPE ≥ 8 was ever logged,
   * the field was permanently locked and the AI's +5% adjustment became dead code.
   */
  bestRPE?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Relative slope threshold below which we declare a plateau.
 * < 0.3% e1RM gain per session is functionally stagnant for an intermediate lifter.
 * Using a relative (not absolute) threshold makes this exercise- and strength-level
 * agnostic: 0.3% on a 60 kg OHP is 0.18 kg/session; on a 200 kg squat it is 0.6 kg/session.
 */
const PLATEAU_SLOPE_THRESHOLD = 0.003;

/**
 * Minimum sessions required before plateau detection fires.
 * 3 sessions (old value) is too short: General Adaptation Syndrome predicts
 * adaptation windows of 3–6 weeks (Stone et al., 2007, NSCA's Essentials, Ch. 2).
 * At 2 sessions/week that requires ≥ 5 data points.
 */
const MIN_E1RM_TREND_SESSIONS = 5;

const PLATEAU_RESET_DAYS = 21; // Clear plateau if exercise not logged for 3 weeks
const MS_PER_DAY = 86400000;

/**
 * How many past sessions to keep in the trend window.
 * 8 sessions ≈ 3 weeks at 3×/week, which aligns with General Adaptation Syndrome's
 * minimum meaningful observation window (Stone et al., 2007, NSCA's Essentials, Ch. 2).
 * Must be ≥ MIN_E1RM_TREND_SESSIONS so plateau detection has enough data.
 */
const TREND_WINDOW_SIZE = 8;

/**
 * Decay rate applied to the rolling maximum per session.
 * 1% per session ≈ 3–4% per month at 3 sessions/week.
 * Max decay within the 3-session window is 2% (when the max is 2 sessions old),
 * keeping the "current e1RM" sticky (resistant to a single bad day) while still
 * allowing gradual regression if performance genuinely declines over multiple weeks.
 */
const ROLLING_MAX_DECAY_PER_SESSION = 0.01;

// ---------------------------------------------------------------------------
// Zourdos RPE-to-%1RM lookup table
// ---------------------------------------------------------------------------

/**
 * Zourdos et al. (2016) RPE-to-%1RM lookup table.
 *
 * Rows = reps performed (index 0 = 1 rep, index 11 = 12 reps).
 * Columns = RPE 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0.
 *
 * Values represent the fraction of 1RM lifted (e.g. 0.87 = 87% 1RM).
 * Reference: Zourdos MC et al. (2016). Novel resistance training-specific RPE
 * scale measuring repetitions in reserve. J Strength Cond Res, 30(1), 267-275.
 *
 * IMPORTANT — population caveat: this table was validated on trained, competitive
 * powerlifters in a lab setting (Zourdos et al., 2016; Helms et al., 2017,
 * JSCR 31(12)). RPE accuracy for the general population is lower; smoothing at
 * the trend level (dampened rolling max) absorbs the resulting per-session noise
 * without diluting the individualisation advantage of RPE-based estimation.
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

// ---------------------------------------------------------------------------
// Prediction formulas
// ---------------------------------------------------------------------------

/**
 * Epley (1985): e1RM = weight × (1 + reps / 30)
 * Best for sets of 2–5 reps. Grey-literature origin (poundage chart, University
 * of Nebraska), but widely validated for low-rep ranges.
 * Reference: Epley B (1985). Poundage Chart. University of Nebraska.
 */
function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

/**
 * Mayhew et al. (1992): e1RM = (100 × weight) / (52.2 + 41.9 × e^(-0.055 × reps))
 * Best for sets of 6–20 reps; outperforms Epley and Brzycki at higher rep ranges.
 * References:
 * - Mayhew JL et al. (1992). J Sports Med Phys Fitness, 32(1), 37-42.
 * - LeSuer DA et al. (1997). J Strength Cond Res, 11(4), 211-213.
 */
function mayhew(weight: number, reps: number): number {
  return (100 * weight) / (52.2 + 41.9 * Math.exp(-0.055 * reps));
}

// ---------------------------------------------------------------------------
// Core per-set estimator
// ---------------------------------------------------------------------------

/**
 * Estimates one-rep maximum (e1RM) from a single set.
 *
 * ## Formula selection
 *
 * ```
 * reps = 1, rpe ≥ 9.0 (or no RPE)  →  weight (direct measure)
 * reps = 1, rpe < 9.0               →  Zourdos (sub-maximal single)
 * reps 2–4                          →  Epley (1985)
 * reps 4–7  (crossfade zone)        →  linear blend Epley → Mayhew
 * reps 7–20                         →  Mayhew et al. (1992)
 * reps > 20                         →  null (estimation unreliable)
 * ```
 *
 * ## RPE path (Zourdos et al., 2016)
 * When RPE is in [6, 10] and reps ≤ 12, the Zourdos lookup table is used:
 * `e1RM = weight / pct1RM(reps, RPE)`. This is empirically derived from trained
 * powerlifters and more accurate than formula-only estimation when RPE is reliable.
 * The RPE path takes priority over Epley/Mayhew for reps 2–12 when RPE is provided.
 *
 * ## Crossfade zone (reps 4–7) — Flaw 1 fix
 * Epley and Mayhew disagree by < 0.2% at the exact boundary (LeSuer et al., 1997),
 * but their *derivative* (rate of change per rep) shifts discontinuously. A linear
 * blend over reps 4–7 eliminates this artefact. Outside the RPE path, which already
 * handles this zone gracefully via table lookup.
 *
 * ## Singles with sub-maximal RPE — Flaw 6 fix
 * When reps = 1 and rpe < 9.0, the lifted weight is NOT the true 1RM — the athlete
 * had meaningful reserve. Sub-maximal singles at RPE 7–8 are standard practice in
 * DUP, RTS, and autoregulated programs (Helms et al., 2017, JSCR 31(12)).
 * At rpe ≥ 9.0 the single is treated as approximately maximal (within ~5% noise);
 * applying Zourdos here would add more error than it removes.
 *
 * ## Returns
 * `null` when weight or reps ≤ 0, or reps > 20.
 *
 * ## References
 * - Epley B (1985). Poundage Chart. University of Nebraska.
 * - Mayhew JL et al. (1992). J Sports Med Phys Fitness, 32(1), 37-42.
 * - LeSuer DA et al. (1997). J Strength Cond Res, 11(4), 211-213.
 * - Zourdos MC et al. (2016). J Strength Cond Res, 30(1), 267-275.
 * - Helms ER et al. (2017). J Strength Cond Res, 31(12), 3463-3470.
 */
export function calculateE1RM(weight: number, reps: number, rpe?: number): number | null {
  if (reps <= 0 || weight <= 0) return null;
  if (reps > 20) return null;

  // --- Singles ---
  if (reps === 1) {
    // Sub-maximal single: apply Zourdos to account for reserve in the tank.
    // Threshold rpe < 9.0 chosen because at RPE 9.0 the Zourdos correction is only
    // ~5% (within typical RPE measurement error), so the raw weight is the better
    // estimate. Below RPE 9.0 the correction is meaningful (>9%) and should be applied.
    // Ref: Helms et al. (2017) JSCR 31(12) — RPE accuracy for singles (r = 0.62).
    if (rpe !== undefined && rpe < 9.0 && rpe >= 6.0) {
      const pct = zourdosPercent(1, rpe);
      if (pct !== null && pct > 0) {
        return Math.round((weight / pct) * 10) / 10;
      }
    }
    // rpe ≥ 9.0 or no RPE: weight is the direct measure.
    return weight;
  }

  // --- RPE path (reps 2–12) ---
  // Zourdos table provides individualised %1RM calibrated to the athlete's
  // perceived effort. This is preferred over population-average formulas when
  // RPE is available. Absorb session-to-session RPE noise at the trend level
  // (dampened rolling max) rather than diluting it here.
  if (rpe !== undefined && rpe >= 6 && rpe <= 10 && reps <= 12) {
    const pct = zourdosPercent(reps, rpe);
    if (pct !== null && pct > 0) {
      return Math.round((weight / pct) * 10) / 10;
    }
  }

  // --- Formula path (no RPE, or reps 13–20 where Zourdos table ends) ---
  // Crossfade zone reps 4–7: linear blend Epley → Mayhew.
  // Motivation: Epley and Mayhew have a discontinuous derivative at the boundary,
  // creating a <0.2% step artefact (LeSuer et al., 1997). A blend removes it cheaply.
  // Pure Epley ≤ 3 reps, pure Mayhew ≥ 8 reps; blend in between.
  let estimate: number;
  if (reps <= 3) {
    estimate = epley(weight, reps);
  } else if (reps <= 7) {
    const t = (reps - 3) / 4; // 0.0 at reps=3, 1.0 at reps=7
    estimate = epley(weight, reps) * (1 - t) + mayhew(weight, reps) * t;
  } else {
    estimate = mayhew(weight, reps);
  }

  return Math.round(estimate * 10) / 10;
}

// ---------------------------------------------------------------------------
// Session-level and trend-level aggregation
// ---------------------------------------------------------------------------

/**
 * Computes a linear-regression slope (kg per session) over an array of values.
 * Uses ordinary least squares on session index (0, 1, 2, …) as the x-variable.
 *
 * Returns 0 when the array has fewer than 2 points (undefined slope).
 *
 * Used for slope-based plateau detection; see Flaw 5 fix in calculateE1RMInsights.
 */
function linearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i]!;
    sumXY += i * values[i]!;
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

export function calculateE1RMInsights(
  logs: ExerciseLog[],
  excludeRanges?: ExcludeRange[],
  now: Date = new Date(),
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

    // --- Session-level aggregation: best set wins ---
    // Using the maximum e1RM across all sets in a session is the NSCA-recommended
    // approach (Haff & Triplett, 2016, Ch. 18): "the set yielding the highest
    // predicted 1RM should be used, as it most closely represents the athlete's
    // true maximal capacity." Fatigued later sets, warmups, and technical
    // breakdowns produce artificially depressed estimates that the max naturally
    // discards. See e1rm_academic_review.md — Flaw 3.
    //
    // Alongside the best e1RM we now also capture the RPE of that specific set.
    // This is consumed by the AI's +5% adjustment for conservative estimates.
    const sessionData = sortedDays.flatMap((day) => {
      const logsForDay = sessions.get(day)!;
      let bestE1RM: number | null = null;
      let bestSetRPE: number | undefined;

      for (const l of logsForDay) {
        const est = calculateE1RM(l.weight ?? 0, l.reps ?? 0, l.rpe);
        if (est !== null && (bestE1RM === null || est > bestE1RM)) {
          bestE1RM = est;
          bestSetRPE = l.rpe; // RPE of THIS specific best set
        }
      }

      if (bestE1RM === null) return [];
      // Carry the date alongside the estimate so trendDates stays in sync
      // with trend even when some sessions are filtered out (e.g. reps > 20).
      return [{ e1rm: bestE1RM, rpe: bestSetRPE, date: new Date(day) }];
    });

    if (sessionData.length === 0) continue;

    const lastLogDate = new Date(sortedDays[sortedDays.length - 1]!);
    const daysSinceLastLog = (now.getTime() - lastLogDate.getTime()) / MS_PER_DAY;

    // Keep the last TREND_WINDOW_SIZE sessions.
    // trendDates is derived from the same trendWindow slice — not from sortedDays —
    // so that indices always stay aligned even when some sessions produce no valid
    // e1RM (e.g. all sets had reps > 20 and were filtered out by sessionData).
    const trendWindow = sessionData.slice(-TREND_WINDOW_SIZE);
    const trend = trendWindow.map((s) => s.e1rm);
    const trendDates = trendWindow.map((s) => s.date);

    // --- Dampened rolling-max for currentE1RM — Flaw 4 fix ---
    //
    // Problem with raw last-session: one bad day tanks the displayed e1RM,
    // causing the AI to prescribe weights that are too light (under-stimulation)
    // and falsely triggering deload/plateau logic.
    //
    // Problem with EWMA: introduces systematic lag during genuine rapid progression
    // (common in novice/early-intermediate athletes), causing the AI to chronically
    // under-prescribe as the athlete improves.
    //
    // Solution — dampened rolling maximum (3-session window):
    //   1. Find the best e1RM across the last 3 sessions (rolling max).
    //   2. Decay it by 1% per session since it was achieved.
    //   3. Never report below the literal last session's value (prevents infinite
    //      decay during genuine detraining — the raw last session then takes over).
    //
    // Properties:
    //   - Sticky to genuine PRs (resistant to single bad days)
    //   - Gradual regression if performance truly declines (1%/session ≈ 3–4%/month)
    //   - Instantly responsive to new PRs (max is updated in the same session)
    //   - No lag bias against fast progressors
    //
    // Ref: Haff & Triplett (2016) NSCA Essentials, Ch. 18; academic review Flaw 4.
    const recentWindow = trend.slice(-3);
    const rollingMax = Math.max(...recentWindow);
    const rollingMaxIdx = recentWindow.lastIndexOf(rollingMax);
    const sessionsSinceMax = recentWindow.length - 1 - rollingMaxIdx;
    const decayedMax = rollingMax * (1 - ROLLING_MAX_DECAY_PER_SESSION * sessionsSinceMax);
    const lastSessionE1RM = trend[trend.length - 1]!;
    const currentE1RM = Math.max(decayedMax, lastSessionE1RM);

    // --- bestRPE: RPE of the set that produced the most recent session's best e1RM ---
    //
    // Bug in original: bestRPE tracked the ALL-TIME maximum RPE across every session.
    // Once any session reached RPE ≥ 8, the field was permanently ≥ 8 and the AI's
    // "+5% for bestRPE ≤ 7" adjustment became dead code.
    //
    // Fix: bestRPE now reflects the RPE of the set that produced the current
    // e1RM estimate (most recent session's best set). This makes the AI adjustment
    // meaningful: if today's best set was at RPE 7, there was gas in the tank and
    // the estimate is genuinely conservative right now.
    const latestSessionData = trendWindow[trendWindow.length - 1];
    const bestRPE = latestSessionData?.rpe;

    // --- Slope-based plateau detection — Flaw 5 fix ---
    //
    // Old approach: plateau if all of the last 3 sessions are within 5% of the peak.
    // Problems (per academic review Flaw 5):
    //   1. 5% band is enormous — genuine linear progression (e.g. 95→100 kg over 3
    //      weeks) is misclassified as plateau because all values are within 5% of 100.
    //   2. 3 sessions minimum is too short. General Adaptation Syndrome (Selye, 1956;
    //      Stone et al., 2007) predicts 3–6 week adaptation windows. Triggering exercise
    //      rotation after ~10 days creates a perpetual rotation trap.
    //   3. Proximity-to-peak ignores direction. [95, 97, 100] and [100, 100, 100]
    //      are both "within 5% of peak" but only the latter is a real plateau.
    //
    // New approach: linear regression slope over the trend window.
    //   - Plateau iff slope < 0.3% of currentE1RM per session (relative threshold,
    //     making detection exercise/strength-level agnostic).
    //   - Require ≥ MIN_E1RM_TREND_SESSIONS (5) sessions in the window.
    //   - Still respect the PLATEAU_RESET_DAYS absence window (exercise not logged
    //     for 3 weeks → reset, likely due to variant swap recovery).
    //
    // Refs: Selye (1956) The Stress of Life; Stone et al. (2007) NSCA Essentials Ch. 2;
    //       academic review Flaw 5; LeSuer et al. (1997) JSCR 11(4), 211-213.
    const slope = linearRegressionSlope(trend);
    const relativeSlope = currentE1RM > 0 ? slope / currentE1RM : 0;
    // Use Math.abs: a *negative* slope (genuine decline) must not trigger plateau.
    // Declining athletes need a different intervention ("dropping" status in the
    // view model, deload recommendation) — not an exercise swap.
    const plateau =
      daysSinceLastLog < PLATEAU_RESET_DAYS &&
      trend.length >= MIN_E1RM_TREND_SESSIONS &&
      Math.abs(relativeSlope) < PLATEAU_SLOPE_THRESHOLD;

    const displayName = displayNames.get(canonical);
    if (displayName) {
      result[displayName] = {
        e1rm: currentE1RM,
        trend,
        trendDates,
        plateau,
        bestRPE,
      };
    }
  }

  return result;
}
