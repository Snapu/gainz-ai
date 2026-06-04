import type { TrainingPlan } from "../domain/types";

const PLAN_STORAGE_KEY = "training-plan-v1";
const MAX_PLAN_AGE_DAYS = 28;

export function loadPlan(): TrainingPlan | null {
  const stored = localStorage.getItem(PLAN_STORAGE_KEY);
  if (!stored) return null;

  try {
    const plan = JSON.parse(stored) as TrainingPlan;

    if (!plan.createdAt) {
      clearPlan();
      return null;
    }

    const createdAt = new Date(plan.createdAt);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_PLAN_AGE_DAYS);

    if (createdAt < cutoffDate) {
      clearPlan();
      return null;
    }

    return plan;
  } catch {
    clearPlan();
    return null;
  }
}

export function savePlan(plan: TrainingPlan): void {
  try {
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
  } catch (error) {
    console.error("Failed to save training plan to localStorage", error);
  }
}

export function clearPlan(): void {
  localStorage.removeItem(PLAN_STORAGE_KEY);
}
