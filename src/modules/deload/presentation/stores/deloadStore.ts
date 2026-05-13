/**
 * Deload lifecycle store.
 *
 * Single source of truth for whether
 * the user is in an active deload week.
 */

import { useDebounceFn } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { loadDeloadPhase, saveDeloadPhase } from "@/modules/deload/application";
import {
  createDeloadPhase,
  type DeloadPhase,
  type DeloadStatus,
  deloadDaysRemaining,
  deloadProgressPercent,
  type FatigueTriggerId,
  getDeloadStatus,
  isDeloadActive,
} from "@/modules/deload/domain";
import { createDeloadPhaseRepository } from "@/modules/deload/infrastructure";
import { useSpreadsheetRepositoryFactory } from "@/modules/platform/presentation";
import { useAuthErrorHandler } from "@/shared/presentation/composables/useAuthErrorHandler";

export type { DeloadPhase, DeloadStatus };

export const useDeloadStore = defineStore("deload", () => {
  const phase = ref<DeloadPhase | null>(null);
  const isLoading = ref(true);

  const { createRepository, getDoc } = useSpreadsheetRepositoryFactory(createDeloadPhaseRepository);
  const { handleAuthError } = useAuthErrorHandler();

  const status = computed<DeloadStatus>(() => getDeloadStatus(phase.value));
  const active = computed(() => isDeloadActive(phase.value));
  const daysRemaining = computed(() => deloadDaysRemaining(phase.value));
  const progressPercent = computed(() => deloadProgressPercent(phase.value));

  const e1rmExcludeRange = computed(() => {
    if (!phase.value || !active.value) return [];
    return [{ start: new Date(phase.value.startedAt), end: new Date(phase.value.endsAt) }];
  });

  const debouncedSave = useDebounceFn(async () => {
    const repository = createRepository();
    if (!repository) return;
    const result = await saveDeloadPhase(phase.value, repository);
    if (result.isErr() && result.error === "auth-failed") {
      handleAuthError("deload-phase-save");
    }
  }, 800);

  function queueSave(): void {
    void debouncedSave();
  }

  function startDeload(fatigueRiskScore: number, triggeredBy: FatigueTriggerId[]): void {
    phase.value = createDeloadPhase(fatigueRiskScore, triggeredBy);
    queueSave();
  }

  function cancelDeload(): void {
    if (!phase.value || !active.value) return;
    phase.value = { ...phase.value, canceledAt: new Date().toISOString() };
    queueSave();
  }

  async function load(): Promise<void> {
    const doc = getDoc();
    if (!doc) {
      isLoading.value = false;
      return;
    }

    isLoading.value = true;

    try {
      const repository = createRepository(doc);
      if (!repository) {
        return;
      }

      const result = await loadDeloadPhase(repository);
      if (result.isErr()) {
        if (result.error === "auth-failed") handleAuthError("deload-phase-load");
        return;
      }
      if (result.value) {
        phase.value = result.value;
      }
    } finally {
      isLoading.value = false;
    }
  }

  return {
    phase,
    isLoading,
    status,
    active,
    daysRemaining,
    progressPercent,
    e1rmExcludeRange,
    startDeload,
    cancelDeload,
    load,
  };
});
