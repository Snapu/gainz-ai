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
// Tuned for ~Level 100 after 3 years of consistent training
const LEVEL_XP_BASE = 330;
const LEVEL_XP_GROWTH = 1.01;

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
  title: string; // anime-style rank title
  description: string; // motivational lore/description
  avatar: string; // path to rank-specific avatar
}

/* ======================================================
 * TITLE SYSTEM
 * ====================================================== */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const resolveAsset = (path: string) => `${BASE}${path}`;

/**
 * Anime-inspired rank titles that escalate with level milestones.
 *
 * Spaced for psychological impact:
 * - Early titles come quickly to hook new users
 * - Mid-tier titles celebrate sustained commitment
 * - Elite titles are legendary achievements
 *
 * Each title is more epic than the previous, creating clear progression.
 */
const TITLES = [
  {
    level: 1,
    title: "Novice Challenger",
    avatar: resolveAsset("/assets/ranks/rank-1.png"),
    description: "Every legend starts with a single rep. Your journey has just begun.",
  },
  {
    level: 5,
    title: "Iron Warrior",
    avatar: resolveAsset("/assets/ranks/rank-2.png"),
    description: "Forged in the fires of consistency. Your resolve is hardening like iron.",
  },
  {
    level: 10,
    title: "Flame Bearer",
    avatar: resolveAsset("/assets/ranks/rank-3.png"),
    description: "The spark has become a flame. Keep the fire burning through every session.",
  },
  {
    level: 15,
    title: "Thunder Fist",
    avatar: resolveAsset("/assets/ranks/rank-4.png"),
    description:
      "Your strikes carry the weight of discipline. Speed and power are now your allies.",
  },
  {
    level: 20,
    title: "Steel Conqueror",
    avatar: resolveAsset("/assets/ranks/rank-5.png"),
    description: "You've conquered the initial hurdles. Your body is a temple of steel.",
  },
  {
    level: 25,
    title: "Rising Phoenix",
    avatar: resolveAsset("/assets/ranks/rank-6.png"),
    description: "From the ashes of your old self, a stronger athlete rises. Soar higher.",
  },
  {
    level: 30,
    title: "Immortal Guardian",
    avatar: resolveAsset("/assets/ranks/rank-7.png"),
    description: "Consistency is your shield. You protect your gains with unwavering discipline.",
  },
  {
    level: 40,
    title: "Champion of Will",
    avatar: resolveAsset("/assets/ranks/rank-8.png"),
    description: "Mind over matter. Your will is stronger than any resistance you face.",
  },
  {
    level: 50,
    title: "Legendary Slayer",
    avatar: resolveAsset("/assets/ranks/rank-9.png"),
    description: "You slay doubt and fatigue daily. Your progress is the stuff of legends.",
  },
  {
    level: 60,
    title: "Master of Discipline",
    avatar: resolveAsset("/assets/ranks/rank-10.png"),
    description: "The gym is your dojo. You have mastered the art of showing up.",
  },
  {
    level: 75,
    title: "Storm Emperor",
    avatar: resolveAsset("/assets/ranks/rank-11.png"),
    description: "You command the storm of your life. Your power is a force of nature.",
  },
  {
    level: 100,
    title: "Diamond Ascendant",
    avatar: resolveAsset("/assets/ranks/rank-12.png"),
    description: "Pressure has turned your effort into something unbreakable. Pure and strong.",
  },
  {
    level: 125,
    title: "Dragon Sovereign",
    avatar: resolveAsset("/assets/ranks/rank-13.png"),
    description: "The dragon within has awakened. You rule your fitness with absolute power.",
  },
  {
    level: 150,
    title: "Thunder God",
    avatar: resolveAsset("/assets/ranks/rank-14.png"),
    description: "A deity of the weights. Every rep echoes like thunder across the heavens.",
  },
  {
    level: 187,
    title: "Inferno Overlord",
    avatar: resolveAsset("/assets/ranks/rank-15.png"),
    description:
      "You've mastered the heat. Even the toughest workouts are but a breeze to your fire.",
  },
  {
    level: 200,
    title: "Cosmic Titan",
    avatar: resolveAsset("/assets/ranks/rank-16.png"),
    description: "Your strength spans the stars. You've transcended mortal limits.",
  },
  {
    level: 250,
    title: "Demon King",
    avatar: resolveAsset("/assets/ranks/rank-17.png"),
    description:
      "The ultimate peak. You have conquered every challenge and stand alone at the top.",
  },
  {
    level: 300,
    title: "Celestial Transcendent",
    avatar: resolveAsset("/assets/ranks/rank-17.png"),
    description:
      "Beyond levels, beyond limits. You have become one with the flow of infinite energy.",
  },
] as const;

type RankInfo = (typeof TITLES)[number];

/**
 * Get internal rank info for a given level.
 */
function getRankInfoForLevel(level: number): RankInfo {
  let current: RankInfo = TITLES[0];

  for (const info of TITLES) {
    if (level >= info.level) {
      current = info;
    } else {
      break;
    }
  }

  return current;
}

/**
 * Get the appropriate title for a given level.
 * Returns the highest unlocked title.
 */
export function getTitleForLevel(level: number): string {
  return getRankInfoForLevel(level).title;
}

/**
 * Get the appropriate avatar path for a given level.
 */
export function getAvatarForLevel(level: number): string {
  return getRankInfoForLevel(level).avatar;
}

/**
 * Get the next title milestone and XP required.
 */
export function getNextTitleMilestone(level: number): { level: number; title: string } | null {
  for (const { level: requiredLevel, title } of TITLES) {
    if (level < requiredLevel) {
      return { level: requiredLevel, title };
    }
  }
  return null; // Max title reached
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
      level: 1,
      totalXP: 0,
      xpIntoLevel: 0,
      xpForNextLevel: xpForLevel(1),
      progressPercent: 0,
      momentum: MOMENTUM_MIN,
      title: getTitleForLevel(1),
      description: TITLES[0].description,
      avatar: getAvatarForLevel(1),
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

  let level = 1;
  let xpRemaining = totalXP;

  while (xpRemaining >= xpForLevel(level)) {
    xpRemaining -= xpForLevel(level);
    level++;
  }

  const xpForNext = xpForLevel(level);
  const progressPercent = Math.floor((xpRemaining / xpForNext) * 100);

  /* ----------------------------------
   * Title and Avatar resolution
   * ---------------------------------- */
  const rankInfo = getRankInfoForLevel(level);

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
    title: rankInfo.title,
    description: (rankInfo as any).description,
    avatar: rankInfo.avatar,
  };
}
