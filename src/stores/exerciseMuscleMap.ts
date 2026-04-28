import { defineStore } from "pinia";
import { ref } from "vue";
import type { ExerciseCleanupResult } from "@/services/ai";
import {
  applyAiCleanupResults,
  clearLearnedMap as clearLearnedMapService,
  getLearnedMuscleMap,
} from "@/services/exerciseMuscleMap";
import type { MuscleActivation } from "@/services/trainingScience";

export const useExerciseMuscleMapStore = defineStore("exerciseMuscleMap", () => {
  const learnedMap = ref<Record<string, MuscleActivation>>(getLearnedMuscleMap());

  /** Re-read localStorage into the reactive ref. Call after any write to the service layer. */
  function refresh(): void {
    learnedMap.value = getLearnedMuscleMap();
  }

  /** Apply AI cleanup results and refresh the reactive map. */
  function applyCleanupResults(input: ExerciseCleanupResult): void {
    applyAiCleanupResults(input.classifications);
    refresh();
  }

  /** Clear all learned mappings and refresh. */
  function clearMap(): void {
    clearLearnedMapService();
    refresh();
  }

  return { learnedMap, refresh, applyCleanupResults, clearMap };
});
