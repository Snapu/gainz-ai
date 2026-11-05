import {
  StorageSerializers,
  useDocumentVisibility,
  useIntervalFn,
  useLocalStorage,
} from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

export const useRestTimerStore = defineStore("restTimer", () => {
  const restStartTime = useLocalStorage<number | null>("gainz:restStartTime", null, {
    serializer: StorageSerializers.object,
  });
  const restElapsed = ref(0);
  const targetRestSeconds = useLocalStorage<number | null>("gainz:targetRestSeconds", null, {
    serializer: StorageSerializers.object,
  });
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

  const isResting = computed<boolean>(() => !!restStartTime.value);

  const isOvertime = computed<boolean>(() => {
    return targetRestSeconds.value !== null && restElapsed.value >= targetRestSeconds.value;
  });

  const formattedTime = computed<string>(() => {
    const seconds =
      targetRestSeconds.value === null
        ? restElapsed.value
        : Math.abs(targetRestSeconds.value - restElapsed.value);
    const prefix =
      targetRestSeconds.value !== null && restElapsed.value > targetRestSeconds.value ? "+" : "";
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${prefix}${m}:${s}`;
  });

  function start(duration?: number) {
    restStartTime.value = Date.now();
    targetRestSeconds.value = duration ?? null;
  }

  function reset() {
    restStartTime.value = null;
    targetRestSeconds.value = null;
  }

  return {
    // Returned for Pinia setup-store compatibility (DevTools/SSR/plugins).
    restStartTime,
    restElapsed,
    targetRestSeconds,
    visibility,
    isResting,
    formattedTime,
    isOvertime,
    start,
    reset,
  };
});
