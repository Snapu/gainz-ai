/**
 * FITNESS PROGRESSION SYSTEM
 * ==========================
 *
 * This module calculates long-term fitness progress using
 * consistency-first principles instead of short-term engagement mechanics.
 *
 * DESIGN PHILOSOPHY
 * -----------------
 * - Consistency beats intensity
 * - Progress compounds over weeks, not days
 * - Momentum amplifies effort but cannot replace it
 * - Breaks cause setbacks, not hard resets
 * - Fitness has no finish line
 *
 * CORE MODEL
 * ----------
 * - Input represents calendar days on which any exercise occurred
 * - Multiple exercises on the same day count as one exercise day
 * - Progress is evaluated on a weekly cadence
 * - A consistency-based momentum multiplier affects XP gain
 * - Missing weeks reduces momentum; sustained consistency restores it
 *
 * SAFEGUARDS
 * ----------
 * - Diminishing returns prevent grinding or overtraining
 * - High-consistency users receive limited forgiveness for short breaks
 * - All values are bounded to prevent runaway growth
 *
 * OUTCOME
 * -------
 * - Early levels are achievable within weeks
 * - High levels represent months or years of discipline
 * - There is no maximum level; progress reflects lifestyle commitment
 *
 * This system is intentionally designed for delayed gratification
 * and long-term adherence rather than rapid leveling.
 */

/* ======================================================
 * CONFIGURATION CONSTANTS
 * ====================================================== */

const BASE_XP_PER_EXERCISE_DAY = 100;

// Momentum (consistency multiplier)
const MOMENTUM_MIN = 0.5; // cold start / inactivity
const MOMENTUM_MAX = 1.25; // elite long-term consistency

// Momentum gain
const MOMENTUM_GAIN_WEEK = 0.03; // any active week
const MOMENTUM_GAIN_GOAL = 0.02; // meeting weekly goal

// Momentum decay (missing weeks hurts)
const MOMENTUM_LOSS_MISSED_WEEK = 0.08;

// Level curve (exponential, no hard cap)
const LEVEL_XP_BASE = 400;
const LEVEL_XP_GROWTH = 1.08;

// Recovery buffer for disciplined users
const HIGH_MOMENTUM_THRESHOLD = 1.0;
const FREE_MISSED_WEEKS_AT_HIGH_MOMENTUM = 1;

// Overtraining / grinding protection
const EXTRA_EXERCISE_DAY_CAP = 1;

/* ======================================================
 * TYPES
 * ====================================================== */

export interface UserProgress {
  level: number;
  totalXP: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
  momentum: number; // consistency multiplier
}

/* ======================================================
 * UTILITIES
 * ====================================================== */

/**
 * Clamp a number between bounds.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Normalize a date to YYYY-MM-DD.
 *
 * Used to identify a unique *exercise day* regardless
 * of how many exercises occurred on that day.
 */
function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Deduplicate exercise dates by calendar day.
 *
 * If multiple exercises are logged on the same day,
 * they count as ONE exercise day for consistency tracking.
 */
function dedupeExerciseDays(dates: Date[]): Date[] {
  const seen = new Set<string>();

  return dates.filter((date) => {
    const key = toDayKey(date);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Convert a date to the start of its ISO week (Monday).
 *
 * Weekly granularity:
 * - respects rest days
 * - avoids toxic daily streaks
 * - mirrors real training cycles
 */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay() || 7; // Sunday → 7
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + 1);
  return d;
}

/**
 * Group exercise days by week.
 */
function groupByWeek(dates: Date[]): Map<number, Date[]> {
  const map = new Map<number, Date[]>();

  for (const date of dates) {
    const weekKey = startOfWeek(date).getTime();
    if (!map.has(weekKey)) map.set(weekKey, []);
    map.get(weekKey)!.push(date);
  }

  return map;
}

/**
 * XP required to advance FROM a given level.
 *
 * Exponential curve:
 * - early levels feel achievable
 * - high levels represent lifestyle commitment
 */
function xpForLevel(level: number): number {
  return Math.floor(LEVEL_XP_BASE * LEVEL_XP_GROWTH ** level);
}

/* ======================================================
 * MAIN CALCULATION
 * ====================================================== */

/**
 * Calculate long-term training progress.
 *
 * @param exerciseDates
 *   Dates on which the user performed at least one exercise.
 *   (Raw logs; may include multiple entries per day.)
 *
 * @param aimedWorkoutsPerWeek
 *   Intended number of exercise days per week.
 *
 * @returns UserProgress
 *   Level, XP, and consistency momentum.
 */
export function calculateUserProgress(
  exerciseDates: Date[],
  aimedWorkoutsPerWeek: number,
): UserProgress {
  /* ----------------------------------
   * New / inactive user
   * ---------------------------------- */
  if (exerciseDates.length === 0) {
    return {
      level: 0,
      totalXP: 0,
      xpIntoLevel: 0,
      xpForNextLevel: xpForLevel(0),
      progressPercent: 0,
      momentum: MOMENTUM_MIN,
    };
  }

  /* ----------------------------------
   * Normalize input data
   * ---------------------------------- */

  // Sort chronologically
  const sortedDates = [...exerciseDates].sort((a, b) => a.getTime() - b.getTime());

  // Deduplicate by calendar day → exercise days
  const uniqueExerciseDays = dedupeExerciseDays(sortedDates);

  // Group exercise days by week
  const weeks = groupByWeek(uniqueExerciseDays);
  const weekKeys = [...weeks.keys()].sort();

  let momentum = MOMENTUM_MIN;
  let totalXP = 0;
  let previousWeek: number | null = null;

  /* ----------------------------------
   * Weekly evaluation loop
   * ---------------------------------- */
  for (const weekKey of weekKeys) {
    /* ---- Handle missed weeks ---- */
    if (previousWeek !== null) {
      const weeksMissed = (weekKey - previousWeek) / (7 * 24 * 60 * 60 * 1000) - 1;

      if (weeksMissed > 0) {
        const effectiveMissed =
          momentum >= HIGH_MOMENTUM_THRESHOLD
            ? Math.max(0, weeksMissed - FREE_MISSED_WEEKS_AT_HIGH_MOMENTUM)
            : weeksMissed;

        momentum -= effectiveMissed * MOMENTUM_LOSS_MISSED_WEEK;
      }
    }

    /* ---- Current week ---- */
    const exerciseDaysThisWeek = weeks.get(weekKey)!.length;

    // Momentum inertia:
    // high consistency is harder to build, but more stable
    const inertia = momentum > 1.0 ? 0.5 : 1.0;

    // Any active week builds momentum
    momentum += MOMENTUM_GAIN_WEEK * inertia;

    // Meeting weekly goal grants bonus
    if (exerciseDaysThisWeek >= aimedWorkoutsPerWeek) {
      momentum += MOMENTUM_GAIN_GOAL * inertia;
    }

    momentum = clamp(momentum, MOMENTUM_MIN, MOMENTUM_MAX);

    /* ---- XP calculation ---- */
    const effectiveExerciseDays = Math.min(
      exerciseDaysThisWeek,
      aimedWorkoutsPerWeek + EXTRA_EXERCISE_DAY_CAP,
    );

    totalXP += effectiveExerciseDays * BASE_XP_PER_EXERCISE_DAY * momentum;

    previousWeek = weekKey;
  }

  /* ----------------------------------
   * Level resolution
   * ---------------------------------- */

  let level = 0;
  let xpRemaining = totalXP;

  while (xpRemaining >= xpForLevel(level)) {
    xpRemaining -= xpForLevel(level);
    level++;
  }

  const xpForNext = xpForLevel(level);
  const progressPercent = Math.floor((xpRemaining / xpForNext) * 100);

  /* ----------------------------------
   * Final result
   * ---------------------------------- */
  return {
    level,
    totalXP: Math.floor(totalXP),
    xpIntoLevel: Math.floor(xpRemaining),
    xpForNextLevel: xpForNext,
    progressPercent,
    momentum,
  };
}
