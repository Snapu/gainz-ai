import { Result } from "neverthrow";
import { TrainingPlan, type TrainingPlanRepository } from "../domain";

const PLAN_STORAGE_KEY = "training-plan-v1";
const MAX_PLAN_AGE_DAYS = 28;

export class LocalStoragePlanRepository implements TrainingPlanRepository {
  loadPlan(): Result<TrainingPlan | null, "storage-error"> {
    return Result.fromThrowable(
      () => {
        const stored = localStorage.getItem(PLAN_STORAGE_KEY);
        if (!stored) return null;

        const data = JSON.parse(stored);
        const plan = TrainingPlan.reconstitute(data);

        if (!plan.createdAt) {
          localStorage.removeItem(PLAN_STORAGE_KEY);
          return null;
        }

        const createdAt = new Date(plan.createdAt);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - MAX_PLAN_AGE_DAYS);

        if (createdAt < cutoffDate) {
          localStorage.removeItem(PLAN_STORAGE_KEY);
          return null;
        }

        return plan;
      },
      () => "storage-error" as const,
    )();
  }

  savePlan(plan: TrainingPlan): Result<void, "storage-error"> {
    return Result.fromThrowable(
      () => {
        localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
      },
      () => "storage-error" as const,
    )();
  }

  clearPlan(): Result<void, "storage-error"> {
    return Result.fromThrowable(
      () => {
        localStorage.removeItem(PLAN_STORAGE_KEY);
      },
      () => "storage-error" as const,
    )();
  }
}
