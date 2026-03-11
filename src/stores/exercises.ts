import type { GoogleSpreadsheet } from "google-spreadsheet";
import { defineStore } from "pinia";
import { watch } from "vue";
import {
  addExercise as addExercise_,
  deleteExercise,
  type Exercise,
  loadExercises,
} from "@/services/exercises";
import { useOfflineSyncedStore } from "@/services/utils/offlineSyncedStore";
import { useSpreadsheetStore } from "./spreadsheet";

export const useExercisesStore = defineStore("exercises", () => {
  const spreadsheetStore = useSpreadsheetStore();
  const {
    items: exercises,
    add,
    remove,
    refresh,
  } = useOfflineSyncedStore<Exercise>({
    getId: (exercise) => exercise.name,
    fetchRemote: () => loadExercises(spreadsheetStore.doc as GoogleSpreadsheet),
    addRemote: (item) => addExercise_(item, spreadsheetStore.doc as GoogleSpreadsheet),
    removeRemote: (item) => deleteExercise(item, spreadsheetStore.doc as GoogleSpreadsheet),
  });

  // Refresh when spreadsheet doc becomes available (handles page refresh race condition)
  watch(
    () => spreadsheetStore.doc,
    (doc) => {
      if (doc && exercises.value.length === 0) {
        console.log("[exercises] Spreadsheet ready, refreshing exercises");
        void refresh();
      }
    },
  );

  const addExercise: typeof add = async (exercise) => {
    console.log("Adding exercise", exercise);
    if (exercises.value.some(({ name }) => name === exercise.name)) return;
    return add(exercise);
  };

  const removeExerciseByName = async (exerciseName: string) => {
    console.log("Removing exercise", exerciseName);
    await Promise.all(exercises.value.filter(({ name }) => name === exerciseName).map(remove));
  };

  return { exercises, addExercise, removeExerciseByName, refresh };
});
