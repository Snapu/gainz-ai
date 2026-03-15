<script setup lang="ts">
import { Flame } from "lucide-vue-next";
import { computed } from "vue";

const props = defineProps<{
  momentum: number;
}>();

const flameConfig = computed(() => {
  const m = props.momentum;

  if (m < 0.7) {
    return {
      count: 1,
      color: "text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]",
    };
  }
  if (m < 0.9) {
    return {
      count: 2,
      color: "text-orange-400 drop-shadow-[0_0_10px_rgba(251,146,60,0.6)]",
    };
  }
  if (m <= 1.0) {
    return {
      count: 3,
      color: "text-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.7)]",
    };
  }
  if (m < 1.15) {
    return {
      count: 4,
      color: "text-red-600 drop-shadow-[0_0_15px_rgba(220,38,38,0.8)]",
    };
  }
  return {
    count: 5,
    color: "text-fuchsia-500 drop-shadow-[0_0_20px_rgba(192,38,211,0.9)] animate-pulse",
  };
});
</script>

<template>
  <div class="flex gap-0.5 items-center">
    <Flame 
      v-for="i in 5" 
      :key="i"
      class="w-3 h-3 transition-all duration-500"
      :class="i <= flameConfig.count ? [flameConfig.color, 'fill-current'] : 'text-white/10'"
    />
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
