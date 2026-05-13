import type { DeloadPhase } from "@/modules/deload/domain";
import type { MuscleActivation } from "@/modules/trainingInsights/domain";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import {
  summaryToExerciseLogs as summaryToExerciseLogsModule,
  type TrainingSummary,
} from "@/modules/trainingSummary/application";
import {
  calculateTrainingInsights,
  summarizeTrainingInsights,
  type TrainingInsights,
} from "../domain";

/**
 * Application-level use-cases for training insights.
 * These orchestrate domain logic for calculating and summarizing training state.
 */

export type { TrainingInsights };

export function calculateInsights(
  logs: ExerciseLog[],
  targetDate: Date = new Date(),
  overrideMap?: Record<string, MuscleActivation>,
  bodyWeightKg?: number,
  deloadPhase?: DeloadPhase | null,
): TrainingInsights {
  return calculateTrainingInsights(logs, targetDate, overrideMap, bodyWeightKg, deloadPhase);
}

export function summarizeInsights(insights: TrainingInsights): string {
  return summarizeTrainingInsights(insights);
}

export function summaryToExerciseLogs(summaries: TrainingSummary[]): ExerciseLog[] {
  return summaryToExerciseLogsModule(summaries);
}
