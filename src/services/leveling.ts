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
 * - A consistency-based readiness multiplier affects XP gain
 * - Missing weeks reduces readiness; sustained consistency restores it
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

import type { ExerciseLog } from "./exerciseLogs";
import { calculateE1RM, calculateMuscleGroupInsights } from "./trainingScience";

const BASE_XP_PER_SESSION = 50;
const BASE_XP_PER_SET = 10;
const XP_PR_BREAKTHROUGH = 500;
const XP_VOLUME_MAV_BONUS = 200;
const XP_CONSISTENCY_BONUS = 150;

// Readiness (Evolved Momentum)
const READINESS_MIN = 0.5;
const READINESS_MAX = 1.5;
const READINESS_GAIN_WEEK = 0.05;
const READINESS_GAIN_GOAL = 0.03;
const READINESS_LOSS_MISSED_WEEK = 0.1;
const READINESS_LOSS_FATIGUE = 0.08;

// Level curve (Piecewise Exponential + Linear)
// Tuned for ~Level 300 after 10-12 years of consistent training
const LEVEL_XP_BASE = 500;
const LEVEL_XP_GROWTH = 1.005;
const LEVEL_XP_LINEAR = 100;

/* ======================================================
 * TYPES
 * ====================================================== */

export interface UserProgress {
  level: number;
  totalXP: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
  readiness: number;
  title: string;
  description: string;
  avatar: string;
  // --- Career Stats ---
  totalWorkoutDays: number;
  totalVolumeKg: number;
  totalSets: number;
  totalReps: number;
  journeyDurationWeeks: number;
  firstSessionDate: Date;
  // --- XP Pillars ---
  xpBreakdown: {
    discipline: number;
    intensity: number;
    progression: number;
    mastery: number;
  };
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
    avatar: resolveAsset("/assets/ranks/rank-18.png"),
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
 */
function xpForLevel(level: number): number {
  return Math.floor(LEVEL_XP_BASE * LEVEL_XP_GROWTH ** level + LEVEL_XP_LINEAR);
}

function getRpeMultiplier(rpe?: number): number {
  if (rpe === undefined || rpe === null) return 0.5; // Unknown effort
  if (rpe >= 9) return 2.5; // Near failure
  if (rpe >= 7) return 1.5; // Effective volume
  if (rpe >= 5) return 1.0; // Maintenance volume
  return 0.5; // Warmup / Recovery
}

/* ======================================================
 * MAIN CALCULATION
 * ====================================================== */

/**
 * Calculate long-term training progress using multi-pillar XP sources.
 */
export function calculateUserProgress(
  logs: ExerciseLog[],
  aimedWorkoutsPerWeek: number,
): UserProgress {
  if (logs.length === 0) {
    return {
      level: 1,
      totalXP: 0,
      xpIntoLevel: 0,
      xpForNextLevel: xpForLevel(1),
      progressPercent: 0,
      readiness: READINESS_MIN,
      title: getTitleForLevel(1),
      description: TITLES[0].description,
      avatar: getAvatarForLevel(1),
      totalWorkoutDays: 0,
      totalVolumeKg: 0,
      totalSets: 0,
      totalReps: 0,
      journeyDurationWeeks: 0,
      firstSessionDate: new Date(),
      xpBreakdown: { discipline: 0, intensity: 0, progression: 0, mastery: 0 },
    };
  }

  // Sort logs chronologically
  const sortedLogs = [...logs].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());

  // Group logs by week
  const logsByWeek = new Map<number, ExerciseLog[]>();
  for (const log of sortedLogs) {
    const weekKey = startOfWeek(log.loggedAt).getTime();
    if (!logsByWeek.has(weekKey)) logsByWeek.set(weekKey, []);
    logsByWeek.get(weekKey)!.push(log);
  }

  const weekKeys = [...logsByWeek.keys()].sort();
  let readiness = READINESS_MIN;
  let totalXP = 0;
  let previousWeek: number | null = null;

  // Track max e1RM per exercise for "Breakthrough" XP
  const historyE1RM = new Map<string, number>();

  // Career Totals
  let totalVolumeKg = 0;
  let totalSets = 0;
  let totalReps = 0;
  const uniqueDays = new Set<string>();

  // XP Pillar Accumulators
  let xpDiscipline = 0;
  let xpIntensity = 0;
  let xpProgression = 0;
  let xpMastery = 0;

  for (const weekKey of weekKeys) {
    const weekLogs = logsByWeek.get(weekKey)!;
    const weekEnd = new Date(weekKey + 7 * 24 * 60 * 60 * 1000);

    /* ---- 1. Readiness Decay (Missed Weeks) ---- */
    if (previousWeek !== null) {
      const weeksMissed = (weekKey - previousWeek) / (7 * 24 * 60 * 60 * 1000) - 1;
      if (weeksMissed > 0) {
        // High readiness gives forgiveness
        const effectiveMissed = readiness >= 1.0 ? Math.max(0, weeksMissed - 1) : weeksMissed;
        readiness -= effectiveMissed * READINESS_LOSS_MISSED_WEEK;
      }
    }

    /* ---- 2. Weekly Readiness Growth & Fatigue ---- */
    const uniqueDaysThisWeek = new Set(weekLogs.map((l) => toDayKey(l.loggedAt))).size;

    // Build readiness with any activity
    readiness += READINESS_GAIN_WEEK;

    // Bonus for meeting goal
    if (uniqueDaysThisWeek >= aimedWorkoutsPerWeek) {
      readiness += READINESS_GAIN_GOAL;
    }

    // Fatigue penalty: check if we should have deloaded
    const lastLogOfContext = weekLogs[weekLogs.length - 1]!;
    const logsUpToWeek = sortedLogs.filter((l) => l.loggedAt <= lastLogOfContext.loggedAt);
    const insights = calculateMuscleGroupInsights(logsUpToWeek, weekEnd);

    // Fatigue detection (heuristic: if many groups are above MRV)
    const overreachingGroups = Object.values(insights).filter(
      (i) => i!.landmark === "above_MRV",
    ).length;
    if (overreachingGroups >= 2) {
      readiness -= READINESS_LOSS_FATIGUE;
    }

    readiness = clamp(readiness, READINESS_MIN, READINESS_MAX);

    /* ---- 3. XP Pillar Calculation ---- */
    let weeklyXP = 0;

    // Pillar: Discipline (Daily base)
    weeklyXP += uniqueDaysThisWeek * BASE_XP_PER_SESSION;

    // Pillar: Intensity (Set-by-set)
    for (const log of weekLogs) {
      uniqueDays.add(toDayKey(log.loggedAt));
      if (log.reps && log.weight) {
        const setXP = BASE_XP_PER_SET * getRpeMultiplier(log.rpe);
        weeklyXP += setXP;
        xpIntensity += setXP * readiness;

        totalVolumeKg += (log.weight || 0) * (log.reps || 0);
        totalSets += 1;
        totalReps += log.reps || 0;

        // Pillar: Progression (PRs / Strength Breakthroughs)
        const currentE1RM = calculateE1RM(log.weight, log.reps, log.rpe);
        const prevBest = historyE1RM.get(log.exerciseName) || 0;

        if (currentE1RM > prevBest * 1.025 && prevBest > 0) {
          weeklyXP += XP_PR_BREAKTHROUGH;
          xpProgression += XP_PR_BREAKTHROUGH * readiness;
        }

        if (currentE1RM > prevBest) {
          historyE1RM.set(log.exerciseName, currentE1RM);
        }
      }
    }

    // Pillar: Symmetry (Hitting MAV Landmarks)
    const mavHits = Object.values(insights).filter(
      (i) => i!.landmark === "at_MAV" || i!.landmark === "above_MRV",
    ).length;
    const masteryXP = mavHits * XP_VOLUME_MAV_BONUS;
    weeklyXP += masteryXP;
    xpMastery += masteryXP * readiness;

    // Pillar: Goals
    if (uniqueDaysThisWeek >= aimedWorkoutsPerWeek) {
      const goalXP = XP_CONSISTENCY_BONUS;
      weeklyXP += goalXP;
      xpDiscipline += goalXP * readiness;
    }

    // Assign remaining breakdown
    // (Approximation: Discipline already handled via session base and goal)
    xpDiscipline += uniqueDaysThisWeek * BASE_XP_PER_SESSION * readiness;

    totalXP += weeklyXP * readiness;
    previousWeek = weekKey;
  }

  /* ---- 4. Level Resolution ---- */
  let level = 1;
  let xpRemaining = totalXP;
  while (xpRemaining >= xpForLevel(level)) {
    xpRemaining -= xpForLevel(level);
    level++;
  }

  const xpForNext = xpForLevel(level);
  const progressPercent = Math.floor((xpRemaining / xpForNext) * 100);
  const rankInfo = getRankInfoForLevel(level);

  return {
    level,
    totalXP: Math.floor(totalXP),
    xpIntoLevel: Math.floor(xpRemaining),
    xpForNextLevel: xpForNext,
    progressPercent,
    readiness,
    title: rankInfo.title,
    description: (rankInfo as any).description,
    avatar: rankInfo.avatar,
    totalWorkoutDays: uniqueDays.size,
    totalVolumeKg: Math.floor(totalVolumeKg),
    totalSets,
    totalReps,
    journeyDurationWeeks: Math.max(
      1,
      Math.ceil(
        (sortedLogs[sortedLogs.length - 1]!.loggedAt.getTime() -
          sortedLogs[0]!.loggedAt.getTime()) /
          (7 * 24 * 60 * 60 * 1000),
      ),
    ),
    firstSessionDate: sortedLogs[0]!.loggedAt,
    xpBreakdown: {
      discipline: Math.floor(xpDiscipline),
      intensity: Math.floor(xpIntensity),
      progression: Math.floor(xpProgression),
      mastery: Math.floor(xpMastery),
    },
  };
}
