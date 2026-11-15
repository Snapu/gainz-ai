import { watch } from "vue";
import { useCoachChatStore, useTrainingPlanStore } from "@/modules/aiCoach/presentation";
import { useEventsStore } from "@/modules/events/presentation";
import { useExerciseMuscleMapStore, useSpreadsheetStore } from "@/modules/platform/presentation";
import { useUserProfileStore } from "@/modules/profile/presentation";

const CACHE_OWNER_STORAGE_KEY = "gainz:cacheSpreadsheetId";

function clearDerivedSheetCaches(): void {
  const trainingPlanStore = useTrainingPlanStore();
  trainingPlanStore.clearPlan();
  trainingPlanStore.clearCompletedSessions();
  useCoachChatStore().resetAllSessions();
  useEventsStore().clearEvents();
  useExerciseMuscleMapStore().clearMap();
  useUserProfileStore().hasCompletedSetup = false;
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
