<script setup lang="ts">
import { Flame } from "lucide-vue-next";
import { computed } from "vue";

const props = defineProps<{
  momentum: number;
}>();

/**
 * Momentum Range: 0.5 (cold) to 1.25 (elite)
 *
 * Mapping Logic:
 * - 0.5 - 0.7: 1 Flame, Blue (oklch(0.6 0.15 250))
 * - 0.7 - 0.9: 2 Flames, Orange (oklch(0.7 0.2 40))
 * - 0.9 - 1.0: 3 Flames, Red (oklch(0.6 0.2 25))
 * - 1.0 - 1.15: 4 Flames, Red/Orange (oklch(0.6 0.25 30))
 * - 1.15+: 5 Flames, Purple/Inferno (oklch(0.6 0.2 300))
 */

const flameConfig = computed(() => {
  const m = props.momentum;

  if (m < 0.7) {
    return {
      count: 1,
      color: "text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]",
      label: "Cold",
    };
  }
  if (m < 0.9) {
    return {
      count: 2,
      color: "text-orange-400 drop-shadow-[0_0_10px_rgba(251,146,60,0.6)]",
      label: "Warm",
    };
  }
  if (m <= 1.0) {
    return {
      count: 3,
      color: "text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.7)]",
      label: "Hot",
    };
  }
  if (m < 1.15) {
    return {
      count: 4,
      color: "text-red-600 drop-shadow-[0_0_15px_rgba(220,38,38,0.8)]",
      label: "On Fire",
    };
  }
  return {
    count: 5,
    color: "text-fuchsia-500 drop-shadow-[0_0_20px_rgba(192,38,211,0.9)] animate-pulse",
    label: "Inferno",
  };
});
</script>

<template>
  <div class="flex flex-col items-end">
    <div class="flex gap-0.5 items-center">
      <Flame 
        v-for="i in flameConfig.count" 
        :key="i"
        class="w-5 h-5 transition-all duration-500 fill-current"
        :class="flameConfig.color"
      />
    </div>
    <span class="text-[10px] font-black uppercase tracking-tighter opacity-70 mt-0.5" :class="flameConfig.color">
      {{ flameConfig.label }}
    </span>
  </div>
</template>

<style scoped>
.animate-pulse {
  animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.1);
  }
}
</style>
