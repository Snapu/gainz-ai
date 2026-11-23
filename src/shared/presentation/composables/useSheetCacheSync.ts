import { getActivePinia } from "pinia";
import { watch } from "vue";
import {
  useAiOrchestratorStore,
  useCoachChatStore,
  useTrainingPlanStore,
} from "@/modules/aiCoach/presentation";
import { useEventsStore } from "@/modules/events/presentation";
import { useExerciseMuscleMapStore, useSpreadsheetStore } from "@/modules/platform/presentation";
import { useUserProfileStore } from "@/modules/profile/presentation";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";

const CACHE_OWNER_STORAGE_KEY = "gainz:cacheSpreadsheetId";

function shouldResetStore(storeId: string, onlyInstantiated: boolean): boolean {
  if (!onlyInstantiated) return true;
  const pinia = getActivePinia();
  if (!pinia) return true;
  return pinia._s.has(storeId);
}

export function clearDerivedSheetCaches(options?: { onlyInstantiated?: boolean }): void {
  const onlyInstantiated = options?.onlyInstantiated ?? false;

  if (shouldResetStore("trainingPlan", onlyInstantiated)) {
    const trainingPlanStore = useTrainingPlanStore();
    trainingPlanStore.clearPlan();
    trainingPlanStore.clearCompletedSessions();
  }
  if (shouldResetStore("coachChat", onlyInstantiated)) {
    useCoachChatStore().resetAllSessions();
  }
  if (shouldResetStore("aiOrchestrator", onlyInstantiated)) {
    useAiOrchestratorStore().clearPendingRequest();
  }
  if (shouldResetStore("events", onlyInstantiated)) {
    useEventsStore().clearEvents();
  }
  if (shouldResetStore("exerciseMuscleMap", onlyInstantiated)) {
    useExerciseMuscleMapStore().clearMap();
  }
  if (shouldResetStore("exerciseLogs", onlyInstantiated)) {
    useExerciseLogsStore().clearPendingMutations();
  }
  if (shouldResetStore("userProfile", onlyInstantiated)) {
    useUserProfileStore().hasCompletedSetup = false;
  }
}

/**
 * Synchronizes localStorage caches derived from a spreadsheet so caches are cleared
 * whenever a different spreadsheet ID becomes active or a brand-new spreadsheet is created.
 */
export function useSheetCacheSync(): () => void {
  const spreadsheetStore = useSpreadsheetStore();

  return watch(
    () => spreadsheetStore.doc?.spreadsheetId ?? null,
    (nextId) => {
      if (!nextId) return;

      const ownerId = localStorage.getItem(CACHE_OWNER_STORAGE_KEY);
      const isUnownedNewSheet =
        ownerId === null && spreadsheetStore.createdSpreadsheetId === nextId;
      if (isUnownedNewSheet || (ownerId !== null && ownerId !== nextId)) {
        clearDerivedSheetCaches();
      }

      localStorage.setItem(CACHE_OWNER_STORAGE_KEY, nextId);
    },
    { immediate: true, flush: "sync" },
  );
}
