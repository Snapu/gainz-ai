import { Result } from "neverthrow";
import { TrainingPlan, type TrainingPlanRepository } from "../domain";

const PLAN_STORAGE_KEY = "training-plan-v1";
const COMPLETED_SESSIONS_STORAGE_KEY = "training-plan-completed-v1";

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
        const maxPlanAgeDays = plan.cycleWeeks * 7 + 7;
        cutoffDate.setDate(cutoffDate.getDate() - maxPlanAgeDays);

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

  loadCompletedSessions(): Result<string[], "storage-error"> {
    return Result.fromThrowable(
      () => {
        const stored = localStorage.getItem(COMPLETED_SESSIONS_STORAGE_KEY);
        if (!stored) return [];
        return JSON.parse(stored) as string[];
      },
      () => "storage-error" as const,
    )();
  }

  saveCompletedSessions(keys: string[]): Result<void, "storage-error"> {
    return Result.fromThrowable(
      () => {
        localStorage.setItem(COMPLETED_SESSIONS_STORAGE_KEY, JSON.stringify(keys));
      },
      () => "storage-error" as const,
    )();
  }

  clearCompletedSessions(): Result<void, "storage-error"> {
    return Result.fromThrowable(
      () => {
        localStorage.removeItem(COMPLETED_SESSIONS_STORAGE_KEY);
      },
      () => "storage-error" as const,
    )();
  }
}
