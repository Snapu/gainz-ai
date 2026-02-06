/**
 * FITNESS LEVELING & CONSISTENCY SYSTEM
 * ====================================
 *
 * PURPOSE
 * -------
 * This system models long-term fitness progress using principles of
 * delayed gratification, discipline, and habit formation.
 *
 * It is intentionally NOT optimized for:
 * - daily streak dopamine
 * - short-term engagement tricks
 * - grinding or session spam
 *
 * Instead, it rewards:
 * - showing up consistently over weeks
 * - respecting recovery and life interruptions
 * - long-term adherence measured in months and years
 *
 * CORE IDEAS
 * ----------
 * 1. Progress is earned, not granted.
 * 2. Consistency beats intensity.
 * 3. Momentum is fragile and valuable.
 * 4. Fitness has no finish line.
 */

/* ======================================================
 * CONFIGURATION CONSTANTS
 * ======================================================
 *
 * These constants define the "physics" of the system.
 * They should be tuned slowly and carefully.
 */

// Base XP awarded per completed workout BEFORE momentum
// This represents raw effort.
const BASE_XP_PER_WORKOUT = 100;

// Momentum bounds (acts as an XP multiplier)
//
// MOMENTUM_MIN:
// - represents inactivity / cold start
// - momentum always starts here
//
// MOMENTUM_MAX:
// - represents elite, long-term consistency
// - intentionally hard to reach
const MOMENTUM_MIN = 0.5;
const MOMENTUM_MAX = 1.25;

// Momentum growth rules
//
// MOMENTUM_GAIN_WEEK:
// - granted for any week with at least one workout
//
// MOMENTUM_GAIN_GOAL:
// - bonus for meeting weekly workout target
const MOMENTUM_GAIN_WEEK = 0.03;
const MOMENTUM_GAIN_GOAL = 0.02;

// Momentum decay
//
// Missing a full week hurts more than gaining one helps.
// This encodes the reality that consistency is fragile.
const MOMENTUM_LOSS_MISSED_WEEK = 0.08;

// Level XP curve
//
// Exponential growth ensures:
// - early levels feel reachable
// - high levels represent lifestyle commitment
const LEVEL_XP_BASE = 400;
const LEVEL_XP_GROWTH = 1.08;

// Recovery & forgiveness rules
//
// Users with high consistency are allowed a small buffer
// to rest, get sick, or handle life events.
const HIGH_MOMENTUM_THRESHOLD = 1.0;
const FREE_MISSED_WEEKS_AT_HIGH_MOMENTUM = 1;

// Overtraining protection
//
// Limits how much extra XP can be earned beyond the weekly goal.
// Prevents grinding and unhealthy session spam.
const EXTRA_WORKOUT_CAP = 1;

/* ======================================================
 * TYPES
 * ====================================================== */

/**
 * Result returned by the leveling system.
 *
 * UI layers are responsible for visualization:
 * - flames
 * - colors
 * - progress bars
 *
 * This service only returns raw values.
 */
export interface UserProgress {
  level: number;
  totalXP: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
  momentum: number; // consistency multiplier
}

/* ======================================================
 * UTILITY FUNCTIONS
 * ====================================================== */

/**
 * Clamps a value between min and max.
 * Used heavily for momentum safety.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Converts a date to the start of its ISO week (Monday).
 *
 * Weekly granularity is intentional:
 * - respects rest days
 * - avoids toxic daily streaks
 * - matches real training cycles
 */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay() || 7; // Sunday becomes 7
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + 1);
  return d;
}

/**
 * Groups workout dates by week.
 *
 * Each week is evaluated independently for:
 * - momentum gain
 * - momentum decay
 * - XP calculation
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
 * This is intentionally exponential:
 * - level 20 ≈ ~3 months consistent
 * - level 100 ≈ ~1 year disciplined
 * - no hard upper bound
 */
function xpForLevel(level: number): number {
  return Math.floor(LEVEL_XP_BASE * LEVEL_XP_GROWTH ** level);
}

/* ======================================================
 * MAIN CALCULATION
 * ====================================================== */

/**
 * Calculates the user's overall training progress.
 *
 * INPUTS
 * ------
 * workoutDays:
 *   Array of dates when workouts occurred.
 *
 * aimedWorkoutsPerWeek:
 *   User's intended weekly training frequency.
 *
 * OUTPUT
 * ------
 * A UserProgress object representing:
 * - long-term level
 * - XP progress
 * - consistency momentum
 */
export function calculateUserProgress(
  workoutDays: Date[],
  aimedWorkoutsPerWeek: number,
): UserProgress {
  /* ----------------------------------
   * Empty / new user state
   * ----------------------------------
   *
   * No workouts means:
   * - level 0
   * - zero XP
   * - minimum momentum
   */
  if (workoutDays.length === 0) {
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
   * Preparation
   * ---------------------------------- */

  // Sort dates chronologically
  const sortedDates = [...workoutDays].sort((a, b) => a.getTime() - b.getTime());

  // Group workouts by week
  const weeks = groupByWeek(sortedDates);
  const weekKeys = [...weeks.keys()].sort();

  let momentum = MOMENTUM_MIN;
  let totalXP = 0;
  let previousWeek: number | null = null;

  /* ----------------------------------
   * Weekly evaluation loop
   * ----------------------------------
   *
   * This loop is the heart of the system.
   * Each iteration represents one training week.
   */
  for (const weekKey of weekKeys) {
    /* ---- Handle missed weeks ---- */
    if (previousWeek !== null) {
      const weeksMissed = (weekKey - previousWeek) / (7 * 24 * 60 * 60 * 1000) - 1;

      if (weeksMissed > 0) {
        // High-consistency users get a small recovery buffer
        const effectiveMissed =
          momentum >= HIGH_MOMENTUM_THRESHOLD
            ? Math.max(0, weeksMissed - FREE_MISSED_WEEKS_AT_HIGH_MOMENTUM)
            : weeksMissed;

        momentum -= effectiveMissed * MOMENTUM_LOSS_MISSED_WEEK;
      }
    }

    /* ---- Evaluate current week ---- */
    const workoutsThisWeek = weeks.get(weekKey)!.length;

    // Momentum inertia:
    // High momentum is harder to build (but still valuable)
    const inertia = momentum > 1.0 ? 0.5 : 1.0;

    // Any active week builds momentum
    momentum += MOMENTUM_GAIN_WEEK * inertia;

    // Meeting weekly goal gives a bonus
    if (workoutsThisWeek >= aimedWorkoutsPerWeek) {
      momentum += MOMENTUM_GAIN_GOAL * inertia;
    }

    momentum = clamp(momentum, MOMENTUM_MIN, MOMENTUM_MAX);

    /* ---- XP calculation ---- */
    const effectiveWorkouts = Math.min(workoutsThisWeek, aimedWorkoutsPerWeek + EXTRA_WORKOUT_CAP);

    totalXP += effectiveWorkouts * BASE_XP_PER_WORKOUT * momentum;

    previousWeek = weekKey;
  }

  /* ----------------------------------
   * Level calculation
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
