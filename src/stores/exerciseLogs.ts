import { useLocalStorage } from "@vueuse/core";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { defineStore } from "pinia";
import { computed } from "vue";
import {
  addExerciseLog as addExerciseLog_,
  deleteExerciseLog as deleteExerciseLog_,
  type ExerciseLog,
  loadExerciseLogs,
} from "@/services/exerciseLogs";
import { useOfflineSyncedStore } from "@/services/utils/offlineSyncedStore";
import { useSpreadsheetStore } from "./spreadsheet";

export const useExerciseLogsStore = defineStore("exerciseLogs", () => {
  const spreadsheetStore = useSpreadsheetStore();
  const {
    items: exerciseLogs,
    isLoading,
    add,
    remove,
  } = useOfflineSyncedStore<ExerciseLog>({
    key: "exerciseLogs",
    getId: (log) => `${log.exerciseName}-${log.loggedAt.getTime()}`,
    fetchRemote: () => loadExerciseLogs(spreadsheetStore.doc as GoogleSpreadsheet),
    addRemote: (item) => addExerciseLog_(item, spreadsheetStore.doc as GoogleSpreadsheet),
    removeRemote: (item) => deleteExerciseLog_(item, spreadsheetStore.doc as GoogleSpreadsheet),
  });

  const workoutFinished = useLocalStorage("workoutFinished", false);

  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const workoutStarted = computed(() =>
    exerciseLogs.value.find((log) => log.loggedAt.getTime() > startOfToday),
  );

  // reset on new day (i.e. workout not started yet)
  if (!workoutStarted.value) {
    workoutFinished.value = false;
  }

  const addExerciseLog: typeof add = async (exerciseLog) => {
    console.log("Adding exercise log", exerciseLog);
    return add(exerciseLog);
  };

  const removeExerciseLog: typeof add = async (exerciseLog) => {
    console.log("Removing exercise log", exerciseLog);
    return remove(exerciseLog);
  };

  function lastLogForExercise(exerciseName: string) {
    return exerciseLogs.value
      .filter((log) => exerciseName === log.exerciseName)
      .sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime())?.[0];
  }

  return {
    exerciseLogs,
    workoutFinished,
    workoutStarted,
    isLoading,
    addExerciseLog,
    removeExerciseLog,
    lastLogForExercise,
  };
});
