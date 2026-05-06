import type { ExerciseE1RM } from "./e1rm";

export type FatigueTriggerId =
  | "volumeSpike"
  | "tonnageSpike"
  | "performanceDecline"
  | "volumeIncreasing";

/** Fatigue accumulation insight for deload decisions. */
export interface FatigueInsight {
  shouldDeload: boolean;
  /** Primary reason (highest-priority trigger) for concise messaging. */
  reason?: string;
  /** True when at least 4 weekly windows are available for robust triggering. */
  hasSufficientHistory: boolean;
  /** Weekly arrays are oldest -> newest; index 3 is current week. */
  weeklyTotalSets: number[];
  /** Weekly tonnage in kg; same ordering as weeklyTotalSets. */
  weeklyTonnage: number[];
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
const TONNAGE_SPIKE_MULTIPLIER = 1.5;
const DECLINE_THRESHOLD = 0.95;
const MIN_DECLINING_EXERCISES = 2;

const TRIGGER_WEIGHTS: Record<FatigueTriggerId, number> = {
  volumeSpike: 2,
  tonnageSpike: 2,
  performanceDecline: 2,
  volumeIncreasing: 1,
};

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

function toFourWeekWindow(values: number[]): [number, number, number, number] {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0];
}

export function isFatigueTriggerId(value: string): value is FatigueTriggerId {
  return Object.hasOwn(TRIGGER_WEIGHTS, value);
}

export function calculateFatigueRiskScore(triggeredBy: FatigueTriggerId[]): number {
  return triggeredBy.reduce((score, triggerId) => score + TRIGGER_WEIGHTS[triggerId], 0);
}

export function getPrimaryFatigueReason(triggeredBy: FatigueTriggerId[]): string | undefined {
  const topTrigger = TRIGGER_PRIORITY.find((triggerId) => triggeredBy.includes(triggerId));
  return topTrigger ? TRIGGER_REASON[topTrigger] : undefined;
}

export function buildFatigueLoadWindow(
  weeklyTotalSets: number[],
  weeklyTonnage: number[],
): FatigueInsight["loadWindow"] {
  const [setsMinus3, setsMinus2, setsMinus1, setsCurrent] = toFourWeekWindow(weeklyTotalSets);
  const [tonnageMinus3, tonnageMinus2, tonnageMinus1, tonnageCurrent] =
    toFourWeekWindow(weeklyTonnage);

  const priorSetsAvg = (setsMinus3 + setsMinus2 + setsMinus1) / 3;
  const priorTonnageAvg = (tonnageMinus3 + tonnageMinus2 + tonnageMinus1) / 3;

  return {
    sets: {
      weekMinus3: setsMinus3,
      weekMinus2: setsMinus2,
      weekMinus1: setsMinus1,
      current: setsCurrent,
      prior3WeekAvg: Math.round(priorSetsAvg * 100) / 100,
      ratioVsPriorAvg:
        priorSetsAvg > 0 ? Math.round((setsCurrent / priorSetsAvg) * 100) / 100 : null,
    },
    tonnage: {
      weekMinus3: tonnageMinus3,
      weekMinus2: tonnageMinus2,
      weekMinus1: tonnageMinus1,
      current: tonnageCurrent,
      prior3WeekAvg: Math.round(priorTonnageAvg * 100) / 100,
      ratioVsPriorAvg:
        priorTonnageAvg > 0 ? Math.round((tonnageCurrent / priorTonnageAvg) * 100) / 100 : null,
    },
  };
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
  weeklyTotalSets: number[],
  weeklyTonnage: number[],
  e1rmData: Record<string, ExerciseE1RM>,
  isCurrentWeekDeload = false,
): FatigueInsight {
  if (weeklyTotalSets.length < 4 || weeklyTonnage.length < 4) {
    return {
      shouldDeload: false,
      reason: undefined,
      hasSufficientHistory: false,
      weeklyTotalSets,
      weeklyTonnage,
      loadWindow: buildFatigueLoadWindow(weeklyTotalSets, weeklyTonnage),
      triggeredBy: [],
      decliningExercises: 0,
      riskScore: 0,
    };
  }

  const priorSetsAvg = (weeklyTotalSets[0]! + weeklyTotalSets[1]! + weeklyTotalSets[2]!) / 3;
  const currentSets = weeklyTotalSets[3]!;

  const priorTonnageAvg = (weeklyTonnage[0]! + weeklyTonnage[1]! + weeklyTonnage[2]!) / 3;
  const currentTonnage = weeklyTonnage[3]!;

  // Keep id name volumeIncreasing for backward compatibility in snapshot/history.
  const volumeIncreasing =
    weeklyTotalSets[1]! > weeklyTotalSets[0]! &&
    weeklyTotalSets[2]! > weeklyTotalSets[1]! &&
    weeklyTotalSets[3]! >= weeklyTotalSets[2]! &&
    currentSets >= VOLUME_SPIKE_MIN_BASELINE;

  let decliningExercises = 0;
  if (!isCurrentWeekDeload) {
    for (const data of Object.values(e1rmData)) {
      if (data.trend.length < 3) continue;
      const current = data.trend[data.trend.length - 1]!;
      const prior2Avg =
        ((data.trend[data.trend.length - 2] ?? 0) + (data.trend[data.trend.length - 3] ?? 0)) / 2;
      if (prior2Avg > 0 && current < prior2Avg * DECLINE_THRESHOLD) {
        decliningExercises++;
      }
    }
  }
  const performanceDecline = decliningExercises >= MIN_DECLINING_EXERCISES;

  const volumeSpike =
    priorSetsAvg >= VOLUME_SPIKE_MIN_BASELINE &&
    currentSets > priorSetsAvg * VOLUME_SPIKE_MULTIPLIER;

  const tonnageSpike =
    priorTonnageAvg > 0 && currentTonnage > priorTonnageAvg * TONNAGE_SPIKE_MULTIPLIER;

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
    weeklyTotalSets,
    weeklyTonnage,
    loadWindow: buildFatigueLoadWindow(weeklyTotalSets, weeklyTonnage),
    triggeredBy,
    decliningExercises,
    riskScore,
  };
}
