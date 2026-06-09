import type { Result } from "neverthrow";
import type { TrainingPlan } from "./trainingPlan";

/**
 * Domain Repository Interface for Training Plan storage.
 * Abstracts the persistence layer (e.g. LocalStorage) away from business logic.
 */
export interface TrainingPlanRepository {
  /**
   * Loads the active training plan from storage.
   * Resolves to null if no plan exists or the plan has expired.
   */
  loadPlan(): Result<TrainingPlan | null, "storage-error">;

  /**
   * Saves the provided plan to storage.
   */
  savePlan(plan: TrainingPlan): Result<void, "storage-error">;

  /**
   * Clears the current active plan.
   */
  clearPlan(): Result<void, "storage-error">;
}
