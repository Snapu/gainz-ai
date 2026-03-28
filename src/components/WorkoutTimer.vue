<script setup lang="ts">
import { useIntervalFn } from "@vueuse/core";
import { haptic } from "ios-haptics";
import { Pause, Play, RotateCcw } from "lucide-vue-next";
import { computed, ref } from "vue";
import Button from "@/components/ui/Button.vue";

const elapsedSeconds = ref(0);
const { pause, resume, isActive } = useIntervalFn(
  () => {
    elapsedSeconds.value++;
  },
  1000,
  { immediate: false },
);

function toggleTimer() {
  haptic();
  if (isActive.value) pause();
  else resume();
}

function resetTimer() {
  haptic();
  pause();
  elapsedSeconds.value = 0;
}

const formattedTime = computed(() => {
  const m = Math.floor(elapsedSeconds.value / 60)
    .toString()
    .padStart(2, "0");
  const s = (elapsedSeconds.value % 60).toString().padStart(2, "0");
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
