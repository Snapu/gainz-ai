import { useDebounceFn } from "@vueuse/core";
import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { useSpreadsheetRepositoryFactory } from "@/modules/platform/presentation";
import { loadMetrics, saveMetrics } from "@/modules/profile/application";
import type {
  EmpiricalDiscoveryInput,
  PhysiologicalMetric,
  PhysiologicalMetricsMap,
} from "@/modules/profile/domain";
import { calculateMetricUpdates } from "@/modules/profile/domain";
import { createMetricsRepository } from "@/modules/profile/infrastructure";
import { isMuscleGroup, type MuscleGroup } from "@/modules/sharedKernel/domain";
import { useAuthErrorHandler } from "@/shared/presentation/composables/useAuthErrorHandler";

export const useMetricsStore = defineStore("physiologicalMetrics", () => {
  const metrics = ref<PhysiologicalMetricsMap>({} as PhysiologicalMetricsMap);
  const isLoading = ref(true);

  const { createRepository, getDoc } = useSpreadsheetRepositoryFactory(createMetricsRepository);
  const { handleAuthError } = useAuthErrorHandler();

  watch(
    () => getDoc(),
    (doc, _previousDoc, onCleanup) => {
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });

      void (async () => {
        if (!doc) {
          isLoading.value = false;
          return;
        }

        isLoading.value = true;

        const repository = createRepository(doc);
        if (!repository) {
          isLoading.value = false;
          return;
        }

        const result = await loadMetrics(repository);
        if (cancelled) return;

        if (result.isErr() && result.error === "auth-failed") {
          handleAuthError("metrics-load");
          isLoading.value = false;
          return;
        }

        if (result.isOk()) {
          metrics.value = result.value;
        }

        isLoading.value = false;
      })();
    },
    { immediate: true },
  );

  const debouncedSave = useDebounceFn(async () => {
    const repository = createRepository();
    if (!repository) return;

    const result = await saveMetrics(metrics.value, repository);
    if (result.isErr() && result.error === "auth-failed") {
      handleAuthError("metrics-save");
    }
  }, 2000);

  /**
   * Evaluates a training insight for a specific muscle group using domain policy.
   * If the domain determines a new volume landmark has been discovered, this updates the store and persists it.
   */
  function evaluateInsight(muscleGroup: MuscleGroup, insight: EmpiricalDiscoveryInput) {
    if (!isMuscleGroup(muscleGroup)) return;
    const existing = metrics.value[muscleGroup];
    const updates = calculateMetricUpdates(insight, existing);
    if (updates) {
      updateMetric(muscleGroup, updates);
    }
  }

  /**
   * Update the physiological metrics for a muscle group and persist to Google Sheets.
   */
  function updateMetric(
    muscleGroup: MuscleGroup,
    updates: Partial<Omit<PhysiologicalMetric, "muscleGroup">>,
  ) {
    if (!isMuscleGroup(muscleGroup)) return;

    const existing = metrics.value[muscleGroup] || { muscleGroup };

    metrics.value[muscleGroup] = {
      ...existing,
      ...updates,
      lastUpdated: new Date().toISOString(),
    };

    void debouncedSave();
  }

  return {
    metrics,
    isLoading,
    updateMetric,
    evaluateInsight,
  };
});
