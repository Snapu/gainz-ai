import { useDocumentVisibility, useIntervalFn, useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

export const useRestTimerStore = defineStore("restTimer", () => {
  const restStartTime = useLocalStorage<number | null>("gainz:restStartTime", null);
  const restElapsed = ref(0);
  const visibility = useDocumentVisibility();

  function updateRestElapsed() {
    if (restStartTime.value) {
      restElapsed.value = Math.floor((Date.now() - restStartTime.value) / 1000);
    } else {
      restElapsed.value = 0;
    }
  }

  const { pause, resume } = useIntervalFn(updateRestElapsed, 1000, {
    immediate: !!restStartTime.value,
  });

  // Resync on focus
  watch(visibility, (v) => {
    if (v === "visible" && restStartTime.value) {
      updateRestElapsed();
    }
  });

  // Auto-control interval
  watch(
    restStartTime,
    (v) => {
      if (v) {
        updateRestElapsed();
        resume();
      } else {
        pause();
        restElapsed.value = 0;
      }
    },
    { immediate: true },
  );

  const isResting = computed(() => !!restStartTime.value);

  const formattedTime = computed(() => {
    const m = Math.floor(restElapsed.value / 60)
      .toString()
      .padStart(2, "0");
    const s = (restElapsed.value % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  });

  function start() {
    restStartTime.value = Date.now();
  }

  function reset() {
    restStartTime.value = null;
  }

  return {
    // Returned for Pinia setup-store compatibility (DevTools/SSR/plugins).
    restStartTime,
    restElapsed,
    visibility,
    isResting,
    formattedTime,
    start,
    reset,
  };
});
