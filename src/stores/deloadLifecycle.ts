import { useDebounceFn } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref, watch, watchEffect } from "vue";
import { useAuthErrorHandler } from "@/composables/useAuthErrorHandler";
import {
  applyDeloadLifecycleTransition,
  consumePostStopConservativeSession,
  type DeloadLifecycle,
  type DeloadRecommendation,
} from "@/services/deloadLifecycle";
import { loadDeloadLifecycle, saveDeloadLifecycle } from "@/services/deloadLifecycleSheet";
import { calculateTrainingInsights } from "@/services/trainingScience";
import { summaryToExerciseLogs } from "@/services/trainingSummary";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";
import { useExerciseMuscleMapStore } from "@/stores/exerciseMuscleMap";
import { useSpreadsheetStore } from "@/stores/spreadsheet";
import { useTrainingSummaryStore } from "@/stores/trainingSummary";
import { useUserProfileStore } from "@/stores/userProfile";

export const useDeloadLifecycleStore = defineStore("deloadLifecycle", () => {
  const lifecycle = ref<DeloadLifecycle | undefined>(undefined);
  const isLoading = ref(true);

  const { handleAuthError } = useAuthErrorHandler();
  const profileStore = useUserProfileStore();
  const logsStore = useExerciseLogsStore();
  const summaryStore = useTrainingSummaryStore();
  const muscleMapStore = useExerciseMuscleMapStore();

  function areNumberArraysEqual(a: number[] | undefined, b: number[] | undefined): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    return a.every((value, index) => value === b[index]);
  }

  function isSameDeloadLifecycle(
    current: DeloadLifecycle | undefined,
    nextLifecycle: DeloadLifecycle | undefined,
  ): boolean {
    if (!current && !nextLifecycle) return true;
    if (!current || !nextLifecycle) return false;

    return (
      current.status === nextLifecycle.status &&
      current.startedAtIso === nextLifecycle.startedAtIso &&
      current.endsAtIso === nextLifecycle.endsAtIso &&
      current.recommendationIssuedAtIso === nextLifecycle.recommendationIssuedAtIso &&
      current.triggerReason === nextLifecycle.triggerReason &&
      current.lastEndedAtIso === nextLifecycle.lastEndedAtIso &&
      current.currentBlockStartedAtIso === nextLifecycle.currentBlockStartedAtIso &&
      current.postStopConservativeSessionsRemaining ===
        nextLifecycle.postStopConservativeSessionsRemaining &&
      areNumberArraysEqual(current.triggerSnapshot?.weeklyTotalSets, nextLifecycle.triggerSnapshot?.weeklyTotalSets) &&
      areNumberArraysEqual(current.triggerSnapshot?.weeklyTonnage, nextLifecycle.triggerSnapshot?.weeklyTonnage) &&
      (current.triggerSnapshot?.triggeredBy ?? []).join(",") ===
        (nextLifecycle.triggerSnapshot?.triggeredBy ?? []).join(",") &&
      current.triggerSnapshot?.decliningExercisesAtStart ===
        nextLifecycle.triggerSnapshot?.decliningExercisesAtStart
    );
  }

  function setLifecycle(nextLifecycle: DeloadLifecycle | undefined): void {
    if (isSameDeloadLifecycle(lifecycle.value, nextLifecycle)) return;
    lifecycle.value = nextLifecycle;
  }

  watchEffect(async () => {
    const spreadsheetStore = useSpreadsheetStore();
    const { doc } = spreadsheetStore;
    if (!doc) {
      isLoading.value = false;
      return;
    }

    isLoading.value = true;
    const result = await loadDeloadLifecycle(doc);
    if (result.isErr() && result.error === "auth-failed") {
      handleAuthError("deload-lifecycle-load");
      isLoading.value = false;
      return;
    }
    if (result.isOk()) {
      lifecycle.value = result.value;
    }
    isLoading.value = false;
  });

  const debouncedSave = useDebounceFn(async () => {
    const spreadsheetStore = useSpreadsheetStore();
    const { doc } = spreadsheetStore;
    if (!doc) return;

    const result = await saveDeloadLifecycle(lifecycle.value, doc);
    if (result.isErr() && result.error === "auth-failed") {
      handleAuthError("deload-lifecycle-save");
    }
  }, 1500);

  watch(lifecycle, () => {
    if (isLoading.value) return;
    void debouncedSave();
  }, { deep: true });

  function syncDeloadLifecycle(recommendation: DeloadRecommendation, now: Date = new Date()): void {
    if (isLoading.value) return;
    const nextLifecycle = applyDeloadLifecycleTransition(lifecycle.value, recommendation, { now });
    setLifecycle(nextLifecycle);
  }

  function stopDeloadNow(now: Date = new Date()): void {
    const nextLifecycle = applyDeloadLifecycleTransition(
      lifecycle.value,
      { shouldDeload: false },
      { now, manualStop: true },
    );
    setLifecycle(nextLifecycle);
  }

  function consumeConservativeSession(): void {
    const nextLifecycle = consumePostStopConservativeSession(lifecycle.value);
    if (!nextLifecycle) return;
    setLifecycle(nextLifecycle);
  }

  watchEffect(() => {
    if (isLoading.value || profileStore.isLoading) return;

    const allLogs = [
      ...summaryToExerciseLogs(summaryStore.summaries),
      ...logsStore.exerciseLogs,
    ];

    const recommendationInsights = calculateTrainingInsights(
      allLogs,
      new Date(),
      muscleMapStore.learnedMap,
      profileStore.userProfile.weightKg,
    );

    syncDeloadLifecycle({
      shouldDeload: recommendationInsights.fatigue.shouldDeload,
      reason: recommendationInsights.fatigue.reason,
      snapshot: {
        weeklyTotalSets: recommendationInsights.fatigue.weeklyTotalSets,
        weeklyTonnage: recommendationInsights.fatigue.weeklyTonnage,
        triggeredBy: recommendationInsights.fatigue.triggeredBy,
        decliningExercisesAtStart: recommendationInsights.fatigue.decliningExercises,
      },
    });
  });

  const deloadLifecycle = computed(() => lifecycle.value);

  return {
    deloadLifecycle,
    lifecycle,
    isLoading,
    syncDeloadLifecycle,
    stopDeloadNow,
    consumeConservativeSession,
    setLifecycle,
  };
});
