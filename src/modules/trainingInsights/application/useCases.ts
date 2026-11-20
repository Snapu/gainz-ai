import type { DeloadPhase } from "@/modules/deload/domain";
import type { MuscleGroup } from "@/modules/sharedKernel/domain";
import type { MuscleActivation, PersonalLandmarkOverride } from "@/modules/trainingInsights/domain";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import { calculateTrainingInsights, type TrainingInsights } from "../domain";

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
  personalMetrics?: Partial<Record<MuscleGroup, PersonalLandmarkOverride>>,
): TrainingInsights {
  return calculateTrainingInsights(
    logs,
    targetDate,
    overrideMap,
    bodyWeightKg,
    deloadPhase,
    personalMetrics,
  );
}
