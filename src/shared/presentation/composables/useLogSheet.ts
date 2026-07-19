import { ref } from "vue";
import type { ExerciseLog } from "@/modules/trainingLogs/presentation";

// Global singleton state for the log sheet
const isOpen = ref(false);
const logToEdit = ref<ExerciseLog | null>(null);
const prefillData = ref<{
  exerciseName: string;
  reps?: number;
  weight?: number;
  duration?: number;
  rpe?: number;
} | null>(null);
const restSeconds = ref<number | null>(null);

export function useLogSheet() {
  function openNewLog() {
    logToEdit.value = null;
    prefillData.value = null;
    restSeconds.value = null;
    isOpen.value = true;
  }

  function openEditLog(log: ExerciseLog) {
    logToEdit.value = log;
    prefillData.value = null;
    restSeconds.value = null;
    isOpen.value = true;
  }

  function openPrefilledLog(
    data: {
      exerciseName: string;
      reps?: number;
      weight?: number;
      duration?: number;
      rpe?: number;
    },
    targetRestSeconds?: number | null,
  ) {
    logToEdit.value = null;
    prefillData.value = data;
    restSeconds.value = targetRestSeconds ?? null;
    isOpen.value = true;
  }

  function close() {
    isOpen.value = false;
  }

  return {
    isOpen,
    logToEdit,
    prefillData,
    restSeconds,
    openNewLog,
    openEditLog,
    openPrefilledLog,
    close,
  };
}
