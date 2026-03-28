<script setup lang="ts">
import { useDocumentVisibility, useIntervalFn } from "@vueuse/core";
import { haptic } from "ios-haptics";
import { Pause, Play, RotateCcw } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import Button from "@/components/ui/Button.vue";

const accumulatedSeconds = ref(0);
const startTime = ref<number | null>(null);
const displaySeconds = ref(0);

const { pause, resume, isActive } = useIntervalFn(
  () => {
    updateDisplay();
  },
  1000,
  { immediate: false },
);

function updateDisplay() {
  if (startTime.value !== null) {
    const now = Date.now();
    displaySeconds.value = accumulatedSeconds.value + Math.floor((now - startTime.value) / 1000);
  }
}

// Ensure the timer immediately corrects its value if the browser suspended Javascript while sleeping
const visibility = useDocumentVisibility();
watch(visibility, (current) => {
  if (current === "visible" && isActive.value) {
    updateDisplay();
  }
});

function toggleTimer() {
  haptic();
  if (isActive.value) {
    updateDisplay();
    accumulatedSeconds.value = displaySeconds.value;
    startTime.value = null;
    pause();
  } else {
    startTime.value = Date.now();
    resume();
  }
}

function resetTimer() {
  haptic();
  pause();
  accumulatedSeconds.value = 0;
  startTime.value = null;
  displaySeconds.value = 0;
}

const formattedTime = computed(() => {
  const m = Math.floor(displaySeconds.value / 60)
    .toString()
    .padStart(2, "0");
  const s = (displaySeconds.value % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
});
</script>

<template>
  <div class="flex items-center justify-between bg-card/50 p-4 rounded-2xl border border-white/5 mt-2">
    <div class="font-mono text-3xl font-bold tracking-tight text-primary">{{ formattedTime }}</div>
    <div class="flex gap-2">
      <Button variant="secondary" size="icon" @click="resetTimer" class="h-12 w-12 rounded-xl">
        <RotateCcw class="w-5 h-5" />
      </Button>
      <Button variant="secondary" size="icon" @click="toggleTimer" class="h-12 w-12 rounded-xl">
        <Pause v-if="isActive" class="w-5 h-5" />
        <Play v-else class="w-5 h-5 ml-1" />
      </Button>
    </div>
  </div>
</template>
