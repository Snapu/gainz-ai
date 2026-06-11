import {
  type FatigueTriggerId,
  isFatigueTriggerId as isSharedFatigueTriggerId,
} from "@/modules/sharedKernel/domain";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import type { ExerciseE1RM } from "./e1rm";
import { computeEwma } from "./ewma";

export type { FatigueTriggerId } from "@/modules/sharedKernel/domain";

/** Fatigue accumulation insight for deload decisions. */
export interface FatigueInsight {
  shouldDeload: boolean;
  /** Primary reason (highest-priority trigger) for concise messaging. */
  reason?: string;
  /** True when at least 4 weekly windows are available for robust triggering. */
  hasSufficientHistory: boolean;

  /** AI-oriented explicit load context to avoid positional-index ambiguity. */
  loadWindow: {
    sets: {
      weekMinus3: number;
      weekMinus2: number;
      weekMinus1: number;
      current: number;
      prior3WeekAvg: number;
      ratioVsPriorAvg: number | null;
    };
    tonnage: {
      weekMinus3: number;
      weekMinus2: number;
      weekMinus1: number;
      current: number;
      prior3WeekAvg: number;
      ratioVsPriorAvg: number | null;
    };
  };
  /** Trigger ids active in this evaluation. */
  triggeredBy: FatigueTriggerId[];
  /** Number of exercises with recent meaningful e1RM decline. */
  decliningExercises: number;
  /** Additive fatigue-risk score for thresholding and transparency. */
  riskScore: number;
}

const VOLUME_SPIKE_MIN_BASELINE = 12;
const VOLUME_SPIKE_MULTIPLIER = 1.25;
const VOLUME_RAMP_MIN_MULTIPLIER = 1.2;
const TONNAGE_SPIKE_MULTIPLIER = 1.5;
const DECLINE_THRESHOLD = 0.95;
const MIN_DECLINING_EXERCISES = 2;
const ACUTE_FATIGUE_RECENCY_DAYS = 14;
const MS_PER_DAY = 86400000;

const TRIGGER_WEIGHTS: Record<FatigueTriggerId, number> = {
  volumeSpike: 2,
  tonnageSpike: 2,
  performanceDecline: 2,
  volumeIncreasing: 1,
};

export const MAX_FATIGUE_RISK_SCORE = Object.values(TRIGGER_WEIGHTS).reduce(
  (sum, val) => sum + val,
  0,
);

const TRIGGER_PRIORITY: FatigueTriggerId[] = [
  "performanceDecline",
  "tonnageSpike",
  "volumeSpike",
  "volumeIncreasing",
];

const TRIGGER_REASON: Record<FatigueTriggerId, string> = {
  performanceDecline: "Performance decline across multiple exercises",
  tonnageSpike: "Tonnage spike detected (>50% vs prior 3-week average)",
  volumeSpike: "Volume spike detected (>25% vs prior 3-week average)",
  volumeIncreasing: "4-week progressive volume ramp",
};

export function isFatigueTriggerId(value: string): value is FatigueTriggerId {
  return isSharedFatigueTriggerId(value);
}

function calculateFatigueRiskScore(triggeredBy: FatigueTriggerId[]): number {
  return triggeredBy.reduce((score, triggerId) => score + TRIGGER_WEIGHTS[triggerId], 0);
}

function getPrimaryFatigueReason(triggeredBy: FatigueTriggerId[]): string | undefined {
  const topTrigger = TRIGGER_PRIORITY.find((triggerId) => triggeredBy.includes(triggerId));
  return topTrigger ? TRIGGER_REASON[topTrigger] : undefined;
}

function getRollingSum(map: Map<number, number>, endDay: number): number {
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += map.get(endDay - i) ?? 0;
  }
  return sum;
}

/**
 * Calculates deload recommendation using multiple external+performance signals.
 *
 * Research basis:
 * - Acute workload spikes are associated with elevated injury risk in team sports;
 *   practical thresholds often start around ~1.2-1.5x prior load (Gabbett, 2016;
 *   Hulin et al., 2014). We keep conservative app thresholds of 1.25x sets and
 *   1.5x tonnage to avoid over-triggering in hypertrophy blocks.
 * - Performance decrements across multiple lifts are a stronger overreaching signal
 *   than load alone (Meeusen et al., 2013). We require decline in >=2 exercises.
 *
 * Decision model:
 * - Compute triggers: volume spike, tonnage spike, performance decline, 4-week ramp.
 * - Convert to additive risk score for AI transparency.
 * - Recommend deload when:
 *   a) riskScore >= 3, and
 *   b) current week is not already a deload week.
 */
export function calculateFatigueInsight(
  logs: ExerciseLog[],
  e1rmData: Record<string, ExerciseE1RM>,
  isCurrentWeekDeload = false,
  targetDate: Date = new Date(),
  excludeRanges?: { start: Date; end: Date }[],
): FatigueInsight {
  const targetDay = Math.floor(targetDate.getTime() / MS_PER_DAY);

  const dailySets = new Map<number, number>();
  const dailyTonnage = new Map<number, number>();

  for (const log of logs) {
    if (log.synthetic) continue;
    const dayKey = Math.floor(log.loggedAt.getTime() / MS_PER_DAY);
    if (dayKey > targetDay) continue;

    dailySets.set(dayKey, (dailySets.get(dayKey) ?? 0) + 1);
    dailyTonnage.set(dayKey, (dailyTonnage.get(dayKey) ?? 0) + (log.weight ?? 0) * (log.reps ?? 0));
  }

  // If there are excluded ranges (e.g., past deloads), we fill those days
  // with the average daily load of the 21 days prior to the deload.
  // This prevents a completed deload from artificially depressing the chronic baseline
  // and triggering a false volume spike when normal training resumes.
  if (excludeRanges) {
    for (const range of excludeRanges) {
      const rangeStartDay = Math.floor(range.start.getTime() / MS_PER_DAY);
      const rangeEndDay = Math.floor(range.end.getTime() / MS_PER_DAY);

      if (rangeEndDay < targetDay - 28) continue; // Too old to affect current EWMA

      let preDeloadSetsSum = 0;
      let preDeloadTonnageSum = 0;
      let preDeloadDays = 0;

      for (let d = rangeStartDay - 21; d < rangeStartDay; d++) {
        preDeloadSetsSum += dailySets.get(d) ?? 0;
        preDeloadTonnageSum += dailyTonnage.get(d) ?? 0;
        preDeloadDays++;
      }

      const avgSets = preDeloadDays > 0 ? preDeloadSetsSum / preDeloadDays : 0;
      const avgTonnage = preDeloadDays > 0 ? preDeloadTonnageSum / preDeloadDays : 0;

      for (let d = rangeStartDay; d <= rangeEndDay; d++) {
        // Only fill if it's in the past or today
        if (d <= targetDay) {
          dailySets.set(d, avgSets);
          dailyTonnage.set(d, avgTonnage);
        }
      }
    }
  }

  const setsEwma = computeEwma(dailySets, targetDay);
  const tonnageEwma = computeEwma(dailyTonnage, targetDay);

  const sets0 = getRollingSum(dailySets, targetDay);
  const sets1 = getRollingSum(dailySets, targetDay - 7);
  const sets2 = getRollingSum(dailySets, targetDay - 14);
  const sets3 = getRollingSum(dailySets, targetDay - 21);

  const tonnage0 = getRollingSum(dailyTonnage, targetDay);
  const tonnage1 = getRollingSum(dailyTonnage, targetDay - 7);
  const tonnage2 = getRollingSum(dailyTonnage, targetDay - 14);
  const tonnage3 = getRollingSum(dailyTonnage, targetDay - 21);

  const hasSufficientHistory = setsEwma !== null && tonnageEwma !== null;

  if (!hasSufficientHistory) {
    return {
      shouldDeload: false,
      reason: undefined,
      hasSufficientHistory: false,
      loadWindow: {
        sets: {
          weekMinus3: sets3,
          weekMinus2: sets2,
          weekMinus1: sets1,
          current: sets0,
          prior3WeekAvg: 0,
          ratioVsPriorAvg: null,
        },
        tonnage: {
          weekMinus3: tonnage3,
          weekMinus2: tonnage2,
          weekMinus1: tonnage1,
          current: tonnage0,
          prior3WeekAvg: 0,
          ratioVsPriorAvg: null,
        },
      },
      triggeredBy: [],
      decliningExercises: 0,
      riskScore: 0,
    };
  }

  // EWMA Snapshots for robust 4-week ramp detection (prevents rest-day jitter)
  // We use the 'acute' (7-day) EWMA, not the chronic (28-day) EWMA, because we want
  // to compare the weekly volume at these 4 distinct checkpoints.
  const ewma1 = computeEwma(dailySets, targetDay - 7);
  const ewma2 = computeEwma(dailySets, targetDay - 14);
  const ewma3 = computeEwma(dailySets, targetDay - 21);

  const ewmaSets0 = setsEwma.acute * 7;
  const ewmaSets1 = ewma1 ? ewma1.acute * 7 : 0;
  const ewmaSets2 = ewma2 ? ewma2.acute * 7 : 0;
  const ewmaSets3 = ewma3 ? ewma3.acute * 7 : 0;

  // Keep id name volumeIncreasing for backward compatibility in snapshot/history.
  const volumeIncreasing =
    ewma3 !== null &&
    ewmaSets2 > ewmaSets3 &&
    ewmaSets1 > ewmaSets2 &&
    ewmaSets0 >= ewmaSets1 &&
    ewmaSets0 >= ewmaSets3 * VOLUME_RAMP_MIN_MULTIPLIER &&
    ewmaSets0 >= VOLUME_SPIKE_MIN_BASELINE;

  let decliningExercises = 0;
  if (!isCurrentWeekDeload) {
    for (const data of Object.values(e1rmData)) {
      if (data.trend.length < 4) continue;

      const lastLogDate = data.trendDates[data.trendDates.length - 1]!;
      const daysSinceLastLog = (targetDate.getTime() - lastLogDate.getTime()) / MS_PER_DAY;

      // If the exercise hasn't been trained recently,
      // any drop is likely detraining or an old drop, not a current fatigue indicator.
      if (daysSinceLastLog > ACUTE_FATIGUE_RECENCY_DAYS) continue;

      const d2 = data.trend[data.trend.length - 1]!; // current
      const d1 = data.trend[data.trend.length - 2]!; // previous
      const b2 = data.trend[data.trend.length - 3]!; // baseline 2
      const b1 = data.trend[data.trend.length - 4]!; // baseline 1

      const baselineAvg = (b1 + b2) / 2;
      if (
        baselineAvg > 0 &&
        d1 < baselineAvg * DECLINE_THRESHOLD &&
        d2 < baselineAvg * DECLINE_THRESHOLD
      ) {
        decliningExercises++;
      }
    }
  }
  const performanceDecline = decliningExercises >= MIN_DECLINING_EXERCISES;

  // EWMA values are daily averages. Multiply by 7 for weekly equivalent comparisons.
  const chronicWeeklySets = setsEwma.chronic * 7;
  const volumeSpike =
    chronicWeeklySets >= VOLUME_SPIKE_MIN_BASELINE && setsEwma.ratio > VOLUME_SPIKE_MULTIPLIER;

  const tonnageSpike = tonnageEwma.chronic > 0 && tonnageEwma.ratio > TONNAGE_SPIKE_MULTIPLIER;

  const triggeredBy: FatigueTriggerId[] = [];

  if (volumeSpike) triggeredBy.push("volumeSpike");
  if (tonnageSpike) triggeredBy.push("tonnageSpike");
  if (performanceDecline) triggeredBy.push("performanceDecline");
  if (volumeIncreasing) triggeredBy.push("volumeIncreasing");

  const riskScore = calculateFatigueRiskScore(triggeredBy);
  const shouldDeload = !isCurrentWeekDeload && riskScore >= 3;
  const reason = shouldDeload ? getPrimaryFatigueReason(triggeredBy) : undefined;

  return {
    shouldDeload,
    reason,
    hasSufficientHistory: true,
    loadWindow: {
      sets: {
        weekMinus3: sets3,
        weekMinus2: sets2,
        weekMinus1: sets1,
        current: sets0,
        prior3WeekAvg: Math.round(chronicWeeklySets * 10) / 10,
        ratioVsPriorAvg: setsEwma.ratio,
      },
      tonnage: {
        weekMinus3: tonnage3,
        weekMinus2: tonnage2,
        weekMinus1: tonnage1,
        current: tonnage0,
        prior3WeekAvg: Math.round(tonnageEwma.chronic * 7 * 10) / 10,
        ratioVsPriorAvg: tonnageEwma.ratio,
      },
    },
    triggeredBy,
    decliningExercises,
    riskScore,
  };
}
