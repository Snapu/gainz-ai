import { computed } from "vue";
import { useRestTimerStore } from "@/modules/platform/presentation";
import { formatRestDuration } from "@/modules/sharedKernel/presentation";

/**
 * Provides pre-derived rest timer display values for use in any component
 * that needs to render rest timer state (progress %, formatted target time, etc.).
 *
 * Avoids duplicating the progress calculation and time formatting logic
 * across AICoachPage and RestTimerToast.
 */
export function useRestTimerDisplay() {
  const store = useRestTimerStore();

  const progressPercent = computed(() => {
    if (!store.targetRestSeconds) return 0;
    return Math.min(100, Math.round((store.restElapsed / store.targetRestSeconds) * 100));
  });

  const formattedTarget = computed(() => formatRestDuration(store.targetRestSeconds));

  return {
    isResting: computed(() => store.isResting),
    isOvertime: computed(() => store.isOvertime),
    formattedTime: computed(() => store.formattedTime),
    targetRestSeconds: computed(() => store.targetRestSeconds),
    progressPercent,
    formattedTarget,
    reset: () => store.reset(),
  };
}
