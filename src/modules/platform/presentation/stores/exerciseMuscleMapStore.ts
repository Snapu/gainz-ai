import { defineStore } from "pinia";
import { ref } from "vue";
import type { ExerciseCleanupResult } from "@/modules/aiCoach/application";
import { createExerciseMuscleMapRepository } from "@/modules/platform/infrastructure/exerciseMuscleMapRepository";
import {
  applyAiCleanupResults,
  clearLearnedMap as clearLearnedMapService,
  getLearnedMuscleMap,
} from "@/modules/sharedKernel/application";
import { getMuscleActivation, type MuscleActivation } from "@/modules/trainingInsights/domain";

export const useExerciseMuscleMapStore = defineStore("exerciseMuscleMap", () => {
  const repository = createExerciseMuscleMapRepository();
  const learnedMap = ref<Record<string, MuscleActivation>>(getLearnedMuscleMap(repository));

  /** Re-read localStorage into the reactive ref. Call after any write to the service layer. */
  function refresh(): void {
    learnedMap.value = getLearnedMuscleMap(repository);
  }

  /** Apply AI cleanup results and refresh the reactive map. */
  function applyCleanupResults(input: ExerciseCleanupResult): void {
    applyAiCleanupResults(input.classifications, repository);
    refresh();
  }

  /** Clear all learned mappings and refresh. */
  function clearMap(): void {
    clearLearnedMapService(repository);
    refresh();
  }

  function resolveMuscleActivation(exerciseName: string) {
    return getMuscleActivation(exerciseName, learnedMap.value);
  }

  return { learnedMap, refresh, applyCleanupResults, clearMap, resolveMuscleActivation };
});
