<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  formattedTime: string;
  isOvertime?: boolean;
  targetRestSeconds?: number | null;
  restElapsed?: number;
}>();

defineEmits<(e: "dismiss") => void>();

const progressPercent = computed(() => {
  if (!props.targetRestSeconds) return 0;
  return Math.min(100, Math.round(((props.restElapsed || 0) / props.targetRestSeconds) * 100));
});
</script>

<template>
  <div 
    class="pointer-events-auto relative flex items-center gap-3 overflow-hidden rounded-full border p-2 pr-3 shadow-2xl transition-colors duration-300 bg-card/95 backdrop-blur-md"
    :class="isOvertime ? 'border-destructive shadow-destructive/20' : 'border-primary/40'"
  >
    <!-- Animated highlight layer -->
    <div 
      class="absolute inset-0 rounded-full border ring-2 animate-pulse pointer-events-none transition-colors duration-300"
      :class="isOvertime ? 'border-destructive/50 ring-destructive/20' : 'border-primary/60 ring-primary/20'"
    />

    <!-- Radial Progress Ring -->
    <div class="relative w-12 h-12 shrink-0 flex items-center justify-center">
      <svg class="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
        <!-- Track -->
        <circle cx="50" cy="50" r="45" class="stroke-muted/20" stroke-width="8" fill="none" />
        <!-- Progress -->
        <circle
          cx="50"
          cy="50"
          r="45"
          class="transition-all duration-1000 ease-linear"
          :class="isOvertime ? 'stroke-destructive' : 'stroke-primary'"
          stroke-width="8"
          fill="none"
          stroke-linecap="round"
          :stroke-dasharray="283"
          :stroke-dashoffset="(283 * progressPercent) / 100"
        />
      </svg>
      <!-- Center Time -->
      <div class="absolute inset-0 flex items-center justify-center">
        <span 
          class="text-xs font-bold tabular-nums tracking-tight"
          :class="isOvertime ? 'text-destructive' : 'text-primary'"
        >
          {{ formattedTime }}
        </span>
      </div>
    </div>

    <!-- Text & Action -->
    <div class="flex items-center gap-3 z-10">
      <div class="flex flex-col justify-center">
        <span 
          class="text-sm font-bold truncate transition-colors duration-300"
          :class="isOvertime ? 'text-destructive' : 'text-foreground'"
        >
          {{ isOvertime ? 'Overtime!' : 'Resting' }}
        </span>
      </div>
      <button 
        type="button" 
        @click="$emit('dismiss')"
        class="text-xs font-semibold uppercase tracking-wider hover:text-primary active:scale-95 transition-all duration-200 cursor-pointer outline-none rounded-full px-3 py-1.5 border border-white/5 bg-white/5"
        :class="isOvertime ? 'text-destructive-foreground hover:bg-destructive/10 border-destructive/20' : 'text-foreground hover:bg-white/10'"
      >
        Skip
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Any custom component-specific styles if needed */
</style>
