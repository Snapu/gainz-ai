/**
 * Deload lifecycle store.
 *
 * Replaces the old `deloadLifecycle` store. Single source of truth for whether
 * the user is in an active deload week.
 *
 * Lifecycle:
 *   1. AI response contains `startDeload: true` → `useAiStore` calls `startDeload()`
 *   2. App reads `isDeloadActive` to suppress fatigue detection + exclude e1RM ranges
 *   3. User may call `cancelDeload()` at any time to end early
 *   4. Status auto-resolves to "completed" once `endsAt` passes
 */

import { useDebounceFn } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useAuthErrorHandler } from "@/composables/useAuthErrorHandler";
import { loadDeloadPhase, saveDeloadPhase } from "@/services/deloadPhaseSheet";
import {
  createDeloadPhase,
  type DeloadPhase,
  type DeloadStatus,
  deloadDaysRemaining,
  deloadProgressPercent,
  getDeloadStatus,
  isDeloadActive,
} from "@/services/trainingScience/deloadPhase";
import type { FatigueTriggerId } from "@/services/trainingScience/fatigueDetection";
import { useSpreadsheetStore } from "@/stores/spreadsheet";

export type { DeloadPhase, DeloadStatus };

export const useDeloadStore = defineStore("deload", () => {
  const phase = ref<DeloadPhase | null>(null);
  const isLoading = ref(true);

  const { handleAuthError } = useAuthErrorHandler();

  // --- Derived state ---

  const status = computed<DeloadStatus>(() => getDeloadStatus(phase.value));

  /** Guards: fatigue detection disabled + e1RM excludes deload range when true. */
  const active = computed(() => isDeloadActive(phase.value));

  /** 1–7 when active, null otherwise. Used for cooldown bar. */
  const daysRemaining = computed(() => deloadDaysRemaining(phase.value));

  /** 0–100 when active, null otherwise. Used for cooldown progress bar. */
  const progressPercent = computed(() => deloadProgressPercent(phase.value));

  /**
   * e1RM exclude range: the deload window to pass to `calculateE1RMInsights`.
   * Ensures performance drops during deload don't contaminate the e1RM trend.
   *
   * Research basis: reduced intensity during deload (~40-60% 1RM) produces sets
   * with lower absolute load, which would otherwise register as a performance
   * decline and erroneously trigger further fatigue signals (Meeusen et al., 2013).
   */
  const e1rmExcludeRange = computed(() => {
    if (!phase.value || !active.value) return [];
    return [{ start: new Date(phase.value.startedAt), end: new Date(phase.value.endsAt) }];
  });

  // --- Actions ---

  function startDeload(fatigueRiskScore: number, triggeredBy: FatigueTriggerId[]): void {
    phase.value = createDeloadPhase(fatigueRiskScore, triggeredBy);
  }

  function cancelDeload(): void {
    if (!phase.value || !active.value) return;
    phase.value = { ...phase.value, canceledAt: new Date().toISOString() };
  }

  // --- Persistence (Google Sheets, debounced) ---

  const debouncedSave = useDebounceFn(async () => {
    const spreadsheetStore = useSpreadsheetStore();
    const { doc } = spreadsheetStore;
    if (!doc) return;
    const result = await saveDeloadPhase(phase.value, doc);
    if (result.isErr() && result.error === "auth-failed") {
      handleAuthError("deload-phase-save");
    }
  }, 800);

  watch(
    phase,
    () => {
      void debouncedSave();
    },
    { deep: true },
  );

  async function load(): Promise<void> {
    const spreadsheetStore = useSpreadsheetStore();
    const { doc } = spreadsheetStore;
    if (!doc) {
      isLoading.value = false;
      return;
    }

    isLoading.value = true;
    const result = await loadDeloadPhase(doc);
    if (result.isErr()) {
      if (result.error === "auth-failed") handleAuthError("deload-phase-load");
      isLoading.value = false;
      return;
    }
    if (result.value) phase.value = result.value;
    isLoading.value = false;
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
