import { useDebounceFn } from "@vueuse/core";
import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { retryOnAuthError } from "@/modules/auth/presentation";
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

export const useMetricsStore = defineStore("physiologicalMetrics", () => {
  const metrics = ref<PhysiologicalMetricsMap>({} as PhysiologicalMetricsMap);
  const isLoading = ref(true);

  const { createRepository, getDoc } = useSpreadsheetRepositoryFactory(createMetricsRepository);

  watch(
    () => getDoc(),
    (doc, _previousDoc, onCleanup) => {
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });

      void (async () => {
        if (!doc) {
          metrics.value = {} as PhysiologicalMetricsMap;
          isLoading.value = false;
          return;
        }

        isLoading.value = true;

        const repository = createRepository(doc);
        if (!repository) {
          isLoading.value = false;
          return;
        }

        const result = await retryOnAuthError("metrics-load", () => loadMetrics(repository), {
          fallbackError: "load-failed",
          isCancelled: () => cancelled,
        });
        if (cancelled) return;

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

    await retryOnAuthError("metrics-save", () => saveMetrics(metrics.value, repository), {
      fallbackError: "save-failed",
    });
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
