import type { GoogleSpreadsheet } from "google-spreadsheet";
import { ok } from "neverthrow";
import { defineStore } from "pinia";
import { watch } from "vue";
import { useAuthErrorHandler } from "@/composables/useAuthErrorHandler";
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
  const { handleAuthError } = useAuthErrorHandler();
  const {
    items: exercises,
    add,
    remove,
    refresh,
  } = useOfflineSyncedStore({
    getId: (exercise) => exercise.name,
    fetchRemote: () => loadExercises(spreadsheetStore.doc as GoogleSpreadsheet),
    addRemote: (item) => addExercise_(item, spreadsheetStore.doc as GoogleSpreadsheet),
    removeRemote: (item) => deleteExercise(item, spreadsheetStore.doc as GoogleSpreadsheet),
  });

  // Refresh when spreadsheet doc becomes available (handles page refresh race condition)
  watch(
    () => spreadsheetStore.doc,
    async (doc) => {
      if (doc && exercises.value.length === 0) {
        console.log("[exercises] Spreadsheet ready, refreshing exercises");
        const result = await refresh();
        if (result.isErr() && result.error === "auth-failed") {
          handleAuthError("exercise-load");
        }
      }
    },
  );

  const addExercise: typeof add = async (exercise) => {
    console.log("Adding exercise", exercise);
    if (exercises.value.some(({ name }) => name === exercise.name)) return ok(undefined);
    const result = await add(exercise);
    if (result.isErr() && result.error === "auth-failed") {
      handleAuthError("exercise-add");
    }
    return result;
  };

  const removeExerciseByName = async (exerciseName: string) => {
    console.log("Removing exercise", exerciseName);
    const results = await Promise.all(
      exercises.value.filter(({ name }) => name === exerciseName).map(remove),
    );
    // Check if any removal failed due to auth
    for (const result of results) {
      if (result.isErr() && result.error === "auth-failed") {
        handleAuthError("exercise-delete");
        return;
      }
    }
  };

  return { exercises, addExercise, removeExerciseByName, refresh };
});
