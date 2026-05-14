/**
 * Deload lifecycle store.
 *
 * Single source of truth for whether
 * the user is in an active deload week.
 */

import { useDebounceFn } from "@vueuse/core";
import { okAsync, ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { loadDeloadPhase, saveDeloadPhase } from "@/modules/deload/application";
import {
  createDeloadPhase,
  type DeloadPhase,
  type DeloadStatus,
  deloadDaysRemaining,
  deloadProgressPercent,
  getDeloadStatus,
  isDeloadActive,
} from "@/modules/deload/domain";
import { createDeloadPhaseRepository } from "@/modules/deload/infrastructure";
import { useSpreadsheetRepositoryFactory } from "@/modules/platform/presentation";
import type { FatigueTriggerId } from "@/modules/sharedKernel/presentation";
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

  function load(): ResultAsync<void, never> {
    const doc = getDoc();
    if (!doc) {
      isLoading.value = false;
      return okAsync(undefined);
    }

    isLoading.value = true;

    const repository = createRepository(doc);
    if (!repository) {
      isLoading.value = false;
      return okAsync(undefined);
    }

    return ResultAsync.fromPromise(loadDeloadPhase(repository), () => undefined as never)
      .andThen((result) => {
        if (result.isErr() && result.error === "auth-failed") {
          handleAuthError("deload-phase-load");
        }
        if (result.isOk() && result.value) {
          phase.value = result.value;
        }
        return okAsync(undefined);
      })
      .andTee(() => {
        isLoading.value = false;
      });
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
