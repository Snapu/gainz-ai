// --------------------
// Types
// --------------------

export type UserProgress = {
  level: number;
  totalXP: number;
  momentum: number; // raw multiplier 0.5 - 1.25
  xpInCurrentLevel: number;
  xpForNextLevel: number;
  progressPercent: number; // 0-100
};

// --------------------
// Constants
// --------------------

const BASE_WEEKLY_XP = 100;
const MAX_CONSISTENCY_MULTIPLIER = 1.5;

const MOMENTUM_MIN = 0.5;
const MOMENTUM_MAX = 1.25;
const MOMENTUM_GAIN = 0.03;
const MOMENTUM_LOSS = 0.07;

const LEVEL_XP_BASE = 200;
const LEVEL_XP_EXPONENT = 1.5;

// --------------------
// Helpers
// --------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function parseWeekKey(key: string): { year: number; week: number } {
  const [y, w] = key.split("-W");
  return { year: Number(y), week: Number(w) };
}

function weekDiff(a: string, b: string): number {
  const A = parseWeekKey(a);
  const B = parseWeekKey(b);
  return (B.year - A.year) * 52 + (B.week - A.week);
}

function xpRequiredForLevel(level: number): number {
  return LEVEL_XP_BASE * level ** LEVEL_XP_EXPONENT;
}

// --------------------
// Main function
// --------------------

export function calculateUserProgress(
  workoutDates: Date[],
  aimedWorkoutsPerWeek: number,
): UserProgress {
  if (aimedWorkoutsPerWeek <= 0) {
    throw new Error("aimedWorkoutsPerWeek must be > 0");
  }

  // Deduplicate workouts per UTC day
  const uniqueDays = new Set(
    workoutDates.map((d) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`),
  );

  // Group by ISO week
  const weekMap = new Map<string, number>();
  for (const key of uniqueDays) {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(Date.UTC(y!, m, d));
    const weekKey = getISOWeekKey(date);
    weekMap.set(weekKey, (weekMap.get(weekKey) ?? 0) + 1);
  }

  if (weekMap.size === 0) {
    return {
      level: 0,
      totalXP: 0,
      momentum: 1,
      xpInCurrentLevel: 0,
      xpForNextLevel: xpRequiredForLevel(1),
      progressPercent: 0,
    };
  }

  // Sort weeks chronologically
  const sortedWeekKeys = [...weekMap.keys()].sort((a, b) => weekDiff(a, b));

  const firstWeek = sortedWeekKeys[0]!;
  const lastWeek = sortedWeekKeys[sortedWeekKeys.length - 1]!;

  // Create a full list of weeks between first and last to apply decay for empty weeks
  const totalWeeks = weekDiff(firstWeek, lastWeek) + 1;
  let totalXP = 0;
  let momentum = 1.0;
  let lastWeekKey: string | null = null;

  for (let i = 0; i < totalWeeks; i++) {
    // Compute the current week key
    const { year, week } = parseWeekKey(firstWeek);
    const weekNumber = week + i;
    const currentYear = year + Math.floor((weekNumber - 1) / 52);
    const currentWeek = ((weekNumber - 1) % 52) + 1;
    const currentWeekKey = `${currentYear}-W${String(currentWeek).padStart(2, "0")}`;

    const workouts = weekMap.get(currentWeekKey) ?? 0;

    // Apply decay for skipped weeks
    if (lastWeekKey !== null && weekDiff(lastWeekKey, currentWeekKey) > 1) {
      const gap = weekDiff(lastWeekKey, currentWeekKey) - 1;
      momentum = clamp(momentum - gap * MOMENTUM_LOSS, MOMENTUM_MIN, MOMENTUM_MAX);
    }

    // Weekly consistency
    const consistency = workouts / aimedWorkoutsPerWeek;
    const effectiveConsistency = Math.min(consistency, MAX_CONSISTENCY_MULTIPLIER);
    const weeklyXP = BASE_WEEKLY_XP * effectiveConsistency * momentum;
    totalXP += weeklyXP;

    // Momentum grows only for consecutive successful weeks
    if (lastWeekKey !== null && weekDiff(lastWeekKey, currentWeekKey) === 1 && consistency >= 1) {
      momentum = clamp(momentum + MOMENTUM_GAIN, MOMENTUM_MIN, MOMENTUM_MAX);
    }

    lastWeekKey = currentWeekKey;
  }

  // Compute level and progress
  let level = 0;
  let accumulatedXP = 0;
  while (true) {
    const xpNext = xpRequiredForLevel(level + 1);
    if (accumulatedXP + xpNext > totalXP) break;
    accumulatedXP += xpNext;
    level++;
  }

  const xpInCurrentLevel = totalXP - accumulatedXP;
  const xpForNextLevel = xpRequiredForLevel(level + 1);
  const progressPercent = Math.min(Math.floor((xpInCurrentLevel / xpForNextLevel) * 100), 100);

  return {
    level,
    totalXP: Math.floor(totalXP),
    momentum: Number(momentum.toFixed(2)),
    xpInCurrentLevel: Math.floor(xpInCurrentLevel),
    xpForNextLevel: Math.floor(xpForNextLevel),
    progressPercent,
  };
}
