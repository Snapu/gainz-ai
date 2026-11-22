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

import type { RankTierId, UserProgress } from "@/modules/sharedKernel/domain";
import {
  calculateE1RM,
  calculateMuscleGroupInsights,
  createMuscleActivationResolver,
} from "@/modules/trainingInsights/domain";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";

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
 * TITLE SYSTEM
 * ====================================================== */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const resolveAsset = (path: string) => `${BASE}${path}`;

/**
 * Grounded athletic rank tiers that scale with long-term training consistency.
 *
 * Spaced for long-term progression:
 * - Early tiers come quickly to recognize initial consistency
 * - Mid-tier ranks reflect sustained multi-month habits
 * - Senior tiers represent years of disciplined strength training
 */
const TITLES: ReadonlyArray<{
  id: RankTierId;
  level: number;
  title: string;
  avatar: string;
  description: string;
}> = [
  {
    id: "foundation",
    level: 1,
    title: "Rookie I",
    avatar: resolveAsset("/assets/ranks/rank-1.png"),
    description: "Every strength journey starts with the very first logged set.",
  },
  {
    id: "consistent",
    level: 5,
    title: "Rookie II",
    avatar: resolveAsset("/assets/ranks/rank-2.png"),
    description: "First momentum built through steady weekly sessions.",
  },
  {
    id: "committed",
    level: 10,
    title: "Rookie III",
    avatar: resolveAsset("/assets/ranks/rank-3.png"),
    description: "Training has become an established weekly routine.",
  },
  {
    id: "disciplined",
    level: 15,
    title: "Athlete I",
    avatar: resolveAsset("/assets/ranks/rank-4.png"),
    description: "Showing up and executing the plan, even on demanding days.",
  },
  {
    id: "structured",
    level: 20,
    title: "Athlete II",
    avatar: resolveAsset("/assets/ranks/rank-5.png"),
    description: "Volume, recovery, and progression clicking into place.",
  },
  {
    id: "resilient",
    level: 25,
    title: "Athlete III",
    avatar: resolveAsset("/assets/ranks/rank-6.png"),
    description: "Adapting through fatigue cycles without losing momentum.",
  },
  {
    id: "dedicated",
    level: 30,
    title: "Pro I",
    avatar: resolveAsset("/assets/ranks/rank-7.png"),
    description: "Months of deliberate effort showing across core lifts.",
  },
  {
    id: "methodical",
    level: 40,
    title: "Pro II",
    avatar: resolveAsset("/assets/ranks/rank-8.png"),
    description: "Measured overload and sharp execution block after block.",
  },
  {
    id: "seasoned",
    level: 50,
    title: "Pro III",
    avatar: resolveAsset("/assets/ranks/rank-9.png"),
    description: "A full year of structured strength work behind your baseline.",
  },
  {
    id: "proficient",
    level: 60,
    title: "Elite I",
    avatar: resolveAsset("/assets/ranks/rank-10.png"),
    description: "High work capacity paired with technical precision under load.",
  },
  {
    id: "advanced",
    level: 75,
    title: "Elite II",
    avatar: resolveAsset("/assets/ranks/rank-11.png"),
    description: "Sustained progression across years of training cycles.",
  },
  {
    id: "veteran",
    level: 100,
    title: "Elite III",
    avatar: resolveAsset("/assets/ranks/rank-12.png"),
    description: "Triple-digit benchmark forged by patience and smart pacing.",
  },
  {
    id: "specialist",
    level: 125,
    title: "World Class I",
    avatar: resolveAsset("/assets/ranks/rank-13.png"),
    description: "Years of deliberate work reflected in exceptional resilience.",
  },
  {
    id: "performance",
    level: 150,
    title: "World Class II",
    avatar: resolveAsset("/assets/ranks/rank-14.png"),
    description: "High-level strength sustained across competitive seasons.",
  },
  {
    id: "highCapacity",
    level: 187,
    title: "World Class III",
    avatar: resolveAsset("/assets/ranks/rank-15.png"),
    description: "Rare training maturity built through years of relentless output.",
  },
  {
    id: "master",
    level: 200,
    title: "Icon",
    avatar: resolveAsset("/assets/ranks/rank-16.png"),
    description: "A benchmark of long-term dedication others look up to.",
  },
  {
    id: "elite",
    level: 250,
    title: "Living Legend",
    avatar: resolveAsset("/assets/ranks/rank-17.png"),
    description: "Ironclad consistency over more than a decade under the bar.",
  },
  {
    id: "pinnacle",
    level: 300,
    title: "G.O.A.T.",
    avatar: resolveAsset("/assets/ranks/rank-18.png"),
    description: "The pinnacle: lifetime mastery of strength, longevity, and grit.",
  },
];

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
function getAvatarForLevel(level: number): string {
  return getRankInfoForLevel(level).avatar;
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

function toDate(val: unknown): Date {
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val;
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * Normalize a date to YYYY-MM-DD.
 *
 * Used to identify a unique *exercise day* regardless
 * of how many exercises occurred on that day.
 */
function toDayKey(date: Date): string {
  const d = toDate(date);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
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
  const source = toDate(date);
  const d = new Date(source.getFullYear(), source.getMonth(), source.getDate());
  const day = d.getDay() || 7; // Sunday → 7
  d.setDate(d.getDate() - day + 1);
  return d;
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
      rankId: TITLES[0].id,
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

  // Normalize log dates to ensure they are valid Date objects
  const normalizedLogs = logs.map((l) => ({
    ...l,
    loggedAt: toDate(l.loggedAt),
  }));

  // Sort logs chronologically (only if needed for performance)
  const isSorted = normalizedLogs.every(
    (l, i) => i === 0 || l.loggedAt.getTime() >= normalizedLogs[i - 1]?.loggedAt.getTime(),
  );
  const sortedLogs = isSorted
    ? normalizedLogs
    : [...normalizedLogs].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());

  // Group logs by week
  const logsByWeek = new Map<number, ExerciseLog[]>();
  for (const log of sortedLogs) {
    const weekKey = startOfWeek(log.loggedAt).getTime();
    if (!logsByWeek.has(weekKey)) logsByWeek.set(weekKey, []);
    logsByWeek.get(weekKey)?.push(log);
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

  // Reuse one memoized activation resolver across all weekly insight windows.
  const resolveActivation = createMuscleActivationResolver();

  // Sliding window for insights (prevents O(N^2) filtering)
  let windowStartIndex = 0;
  let windowEndIndex = 0;
  const slidingWindowDuration = 30 * 24 * 60 * 60 * 1000; // 30 days buffer

  for (const weekKey of weekKeys) {
    const weekLogs = logsByWeek.get(weekKey) ?? [];
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

    // Fatigue detection: uses a sliding window of logs for performance
    const windowStartTime = weekEnd.getTime() - slidingWindowDuration;
    while (windowEndIndex < sortedLogs.length && sortedLogs[windowEndIndex]?.loggedAt <= weekEnd) {
      windowEndIndex++;
    }
    while (
      windowStartIndex < windowEndIndex &&
      sortedLogs[windowStartIndex]?.loggedAt.getTime() < windowStartTime
    ) {
      windowStartIndex++;
    }

    const logsForInsights = sortedLogs.slice(windowStartIndex, windowEndIndex);
    const insights = calculateMuscleGroupInsights(logsForInsights, weekEnd, resolveActivation);

    // Fatigue detection (heuristic: if many groups are above MRV)
    const overreachingGroups = Object.values(insights).filter(
      (i) => i?.landmark === "above_MRV",
    ).length;
    if (overreachingGroups >= 2) {
      readiness -= READINESS_LOSS_FATIGUE;
    }

    readiness = clamp(readiness, READINESS_MIN, READINESS_MAX);

    /* ---- 3. XP Pillar Calculation ---- */
    let weeklyXP = 0;
    const sessionPRsThisWeek = new Set<string>();

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
        if (currentE1RM === null) continue;
        const prevBest = historyE1RM.get(log.exerciseName) || 0;

        const sessionExerciseKey = `${toDayKey(log.loggedAt)}-${log.exerciseName}`;

        if (currentE1RM > prevBest * 1.025 && prevBest > 0) {
          if (!sessionPRsThisWeek.has(sessionExerciseKey)) {
            weeklyXP += XP_PR_BREAKTHROUGH;
            xpProgression += XP_PR_BREAKTHROUGH * readiness;
            sessionPRsThisWeek.add(sessionExerciseKey);
          }
        }

        if (currentE1RM > prevBest) {
          historyE1RM.set(log.exerciseName, currentE1RM);
        }
      }
    }

    // Pillar: Symmetry (Hitting MAV Landmarks)
    const mavHits = Object.values(insights).filter(
      (i) => i?.landmark === "at_MAV" || i?.landmark === "above_MRV",
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
    rankId: rankInfo.id,
    title: rankInfo.title,
    description: rankInfo.description,
    avatar: rankInfo.avatar,
    totalWorkoutDays: uniqueDays.size,
    totalVolumeKg: Math.floor(totalVolumeKg),
    totalSets,
    totalReps,
    journeyDurationWeeks: Math.max(
      1,
      Math.ceil(
        (sortedLogs[sortedLogs.length - 1]?.loggedAt.getTime() -
          sortedLogs[0]?.loggedAt.getTime()) /
          (7 * 24 * 60 * 60 * 1000),
      ),
    ),
    firstSessionDate: sortedLogs[0]?.loggedAt,
    xpBreakdown: {
      discipline: Math.floor(xpDiscipline),
      intensity: Math.floor(xpIntensity),
      progression: Math.floor(xpProgression),
      mastery: Math.floor(xpMastery),
    },
  };
}
