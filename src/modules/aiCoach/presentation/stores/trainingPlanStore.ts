import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import type { TrainingPlan } from "@/modules/aiCoach/domain";
import { LocalStoragePlanRepository } from "@/modules/aiCoach/infrastructure";

export const useTrainingPlanStore = defineStore("trainingPlan", () => {
  const activePlan = shallowRef<TrainingPlan | null>(null);
  const completedSessions = ref<Set<string>>(new Set());
  const planRepository = new LocalStoragePlanRepository();
  const hasInitialized = ref(false);

  function initialize() {
    if (hasInitialized.value) return;
    hasInitialized.value = true;

    const planResult = planRepository.loadPlan();
    if (planResult.isOk() && planResult.value) {
      activePlan.value = planResult.value;
    }

    const completedResult = planRepository.loadCompletedSessions();
    if (completedResult.isOk()) {
      completedSessions.value = new Set(completedResult.value);
    }
  }

  function setPlan(plan: TrainingPlan) {
    planRepository.savePlan(plan);
    activePlan.value = plan;
  }

  function clearPlan() {
    planRepository.clearPlan();
    activePlan.value = null;
  }

  function setCompletedSessions(sessions: Set<string>) {
    completedSessions.value = sessions;
    planRepository.saveCompletedSessions(Array.from(sessions));
  }

  function clearCompletedSessions() {
    planRepository.clearCompletedSessions();
    completedSessions.value = new Set();
  }

  return {
    initialize,
    activePlan,
    completedSessions,
    hasInitialized,
    setPlan,
    clearPlan,
    setCompletedSessions,
    clearCompletedSessions,
  };
});
