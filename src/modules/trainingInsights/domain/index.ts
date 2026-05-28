/**
 * Training Science — barrel index.
 *
 * Composes ACWR, e1RM, fatigue detection, and volume landmarks into a single
 * `calculateTrainingInsights()` call consumed by the AI service, views, and stores.
 *
 * Deload phase integration:
 * - When an active DeloadPhase is provided, fatigue detection is suppressed
 *   (isCurrentWeekDeload=true) preventing the deadlock where a deload-induced
 *   performance drop re-triggers another deload recommendation.
 * - e1RM calculations exclude the deload date range so reduced training loads
 *   don't corrupt the strength trend baseline.
 *
 * References:
 * - Meeusen R et al. (2013). Med Sci Sports Exerc, 45(1), 186-205.
 * - Gabbett TJ (2016). Br J Sports Med, 50(5), 273-280.
 */

import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import { computeEWMAACWR } from "./acwr";
import {
  type DeloadPhase,
  type DeloadStatus,
  getDeloadStatus,
  isDeloadActive,
} from "./deloadPhase";
import { calculateE1RMInsights, type ExerciseE1RM } from "./e1rm";
import type { MuscleActivation } from "./exerciseMuscleMap";
import { calculateFatigueInsight } from "./fatigueDetection";
import {
  calculateMuscleGroupInsights,
  getIsoWeekStart,
  type MuscleGroupInsight,
} from "./volumeLandmarks";

export * from "./acwr";
export * from "./e1rm";
// Re-export sub-modules so consumers can import types from the barrel.
export * from "./ewma";
export * from "./exerciseMuscleMap";
export * from "./fatigueDetection";
export * from "./volumeLandmarks";

/** High-level training phase shown in the UI. */
export type SystemicPhase = "Build" | "Maintain" | "Deload" | "Inactive";

/**
 * Derive the high-level systemic phase from available signals.
 *
 * Research basis (Gabbett 2016; Meeusen et al. 2013):
 * - active deload or shouldDeload → "Deload"
 * - ACWR < 0.6 → "Inactive" (stimulus below MEV)
 * - ≥ 40% muscle groups at MAV or approaching MRV → "Build"
 * - Otherwise → "Maintain"
 */
function derivePhase(
  acwr: number | null,
  shouldDeload: boolean,
  deloadStatus: DeloadStatus,
  muscleGroups: ReturnType<typeof calculateMuscleGroupInsights>,
): SystemicPhase {
  if (deloadStatus === "active" || shouldDeload) return "Deload";

  const muscleList = Object.values(muscleGroups).filter(Boolean) as MuscleGroupInsight[];
  if (muscleList.length === 0) return "Inactive";
  if (acwr !== null && acwr < 0.6) return "Inactive";

  const buildCount = muscleList.filter(
    (m) => m.landmark === "at_MAV" || m.landmark === "approaching_MRV",
  ).length;

  if (buildCount / muscleList.length >= 0.4) return "Build";
  return "Maintain";
}

/** Full training insights aggregate returned by calculateTrainingInsights(). */
export interface TrainingInsights {
  phase: SystemicPhase;
  acwr: number | null;
  fatigue: ReturnType<typeof calculateFatigueInsight>;
  e1rm: Record<string, ExerciseE1RM>;
  muscleGroups: Partial<Record<string, MuscleGroupInsight>>;
  deloadStatus: DeloadStatus;
  deloadEndsAt: string | null;
  deloadTimeRemainingMs: number | null;
  /** True when e1RM trend tracking is suppressed due to active deload. */
  e1rmPaused: boolean;
  /** True when plateau detection is suppressed due to active deload. */
  plateauPaused: boolean;
  /** Snapshot of triggers for the most recent deload, shown in the UI. */
  deloadTriggerSnapshot: { triggeredBy: string[]; riskScore: number } | null;
}

/**
 * Compose all training science signals into a single insights object.
 *
 * @param logs - All exercise logs (historical + current)
 * @param targetDate - Reference date (defaults to now)
 * @param overrideMap - Learned muscle-group overrides from AI classification
 * @param bodyWeightKg - Optional body weight (reserved for relative-load metrics)
 * @param deloadPhase - Active deload phase record, if any
 */
export function calculateTrainingInsights(
  logs: ExerciseLog[],
  targetDate: Date = new Date(),
  overrideMap?: Record<string, MuscleActivation>,
  _bodyWeightKg?: number,
  deloadPhase?: DeloadPhase | null,
): TrainingInsights {
  const phase = deloadPhase ?? null;
  const deloadActive = isDeloadActive(phase, targetDate);
  const deloadStatus = getDeloadStatus(phase, targetDate);

  // Exclude the deload window from e1RM so reduced loads don't warp strength trends.
  // We must exclude it even if the deload is completed, otherwise the recently
  // finished light workouts will flood into the 8-session trend and crash the e1RM.
  const excludeRanges = phase
    ? [{ start: new Date(phase.startedAt), end: new Date(phase.canceledAt ?? phase.endsAt) }]
    : undefined;

  const e1rm = calculateE1RMInsights(logs, excludeRanges, targetDate);

  // Suppress fatigue detection while deload is active to prevent re-triggering.
  // Pass excludeRanges so fatigueDetection can fill the deload gap with baseline averages,
  // preventing a false volume spike when training resumes.
  const fatigue = calculateFatigueInsight(logs, e1rm, deloadActive, targetDate, excludeRanges);
  const acwr = computeEWMAACWR(logs, targetDate);
  const muscleGroups = calculateMuscleGroupInsights(logs, targetDate, overrideMap);
  const systemicPhase = derivePhase(acwr, fatigue.shouldDeload, deloadStatus, muscleGroups);

  const deloadEndsAt = phase?.endsAt ?? null;
  const deloadTimeRemainingMs =
    deloadActive && phase
      ? Math.max(0, new Date(phase.endsAt).getTime() - targetDate.getTime())
      : null;

  const deloadTriggerSnapshot =
    phase && (deloadStatus === "active" || deloadStatus === "completed")
      ? { triggeredBy: [...phase.triggeredBy], riskScore: phase.fatigueRiskScore }
      : null;

  return {
    phase: systemicPhase,
    acwr,
    fatigue,
    e1rm,
    muscleGroups,
    deloadStatus,
    deloadEndsAt,
    deloadTimeRemainingMs,
    e1rmPaused: deloadActive,
    plateauPaused: deloadActive,
    deloadTriggerSnapshot,
  };
}

/**
 * Summarise training insights to a compact string for the AI prompt.
 * Keeps the token footprint small while preserving all decision-critical signals.
 */
export function summarizeTrainingInsights(insights: TrainingInsights): string {
  const parts: string[] = [`Phase: ${insights.phase}`];

  if (insights.acwr !== null) {
    parts.push(`ACWR: ${insights.acwr.toFixed(2)}`);
  }

  const { fatigue } = insights;
  parts.push(`FatigueRisk: ${fatigue.riskScore} (shouldDeload=${fatigue.shouldDeload})`);

  if (insights.deloadStatus === "active" && insights.deloadEndsAt) {
    const msLeft = insights.deloadTimeRemainingMs ?? 0;
    const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
    parts.push(`DeloadActive: ends in ${daysLeft}d`);
  }

  const muscleEntries = Object.entries(insights.muscleGroups).filter(([, v]) => v !== undefined);
  if (muscleEntries.length > 0) {
    const muscleList = muscleEntries
      .map(([group, m]) => `${group}:${m!.sets}sets(${m!.landmark})`)
      .join(", ");
    parts.push(`Muscles: ${muscleList}`);
  }

  return parts.join(" | ");
}
