<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    progress: number; // 0-100
    size?: number; // pixels (default 56)
    strokeWidth?: number; // pixels (default 4)
    trackClass?: string; // Tailwind classes for track circle
    progressClass?: string; // Tailwind classes for progress circle
  }>(),
  {
    size: 56,
    strokeWidth: 4,
    trackClass: "text-white/5",
    progressClass: "text-primary",
  },
);

// Calculate SVG circle properties
const radius = computed(() => props.size / 2 - props.strokeWidth / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);
const strokeDashoffset = computed(
  () => circumference.value - (circumference.value * props.progress) / 100,
);
const center = computed(() => props.size / 2);
</script>

<template>
  <div class="relative" :style="{ width: `${size}px`, height: `${size}px` }">
    <!-- Radial Progress SVG -->
    <svg
      class="absolute inset-0 w-full h-full -rotate-90 drop-shadow-[0_0_12px_rgba(var(--color-primary-rgb),0.4)]"
      :width="size"
      :height="size"
    >
      <!-- Track Circle -->
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        stroke="currentColor"
        :stroke-width="strokeWidth"
        :class="trackClass"
      />
      <!-- Progress Circle -->
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        stroke="currentColor"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        :class="[progressClass, 'transition-all duration-300 ease-out']"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="strokeDashoffset"
      />
    </svg>

    <!-- Center Content Slot -->
    <div class="absolute inset-0 flex items-center justify-center">
      <slot />
    </div>
  </div>
</template>
