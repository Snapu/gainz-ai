<script setup lang="ts">
import { computed } from "vue";

export interface DonutChartItem {
  label: string;
  value: number;
  percent: number;
  colorClass: string;
}

const props = withDefaults(
  defineProps<{
    data: DonutChartItem[];
    size?: number;
    strokeWidth?: number;
  }>(),
  {
    size: 112, // 28 x 4 (standard w-28 in Tailwind is 112px)
    strokeWidth: 5,
  },
);

const center = computed(() => props.size / 2);
const radius = computed(() => (props.size - props.strokeWidth) / 2);
const circumference = computed(() => 2 * Math.PI * radius.value);

const segments = computed(() => {
  let accumulatedPercent = 0;
  
  return props.data
    .filter(item => item.percent > 0)
    .map((item) => {
      const startPercent = accumulatedPercent;
      accumulatedPercent += item.percent;
      
      // Calculate dasharray and dashoffset
      // Dasharray: [segment_length, gap_length]
      // Dashoffset: distance from 12 o'clock (top)
      const dashLength = (item.percent / 100) * circumference.value;
      const gapLength = circumference.value - dashLength;
      
      // SVG dashoffset rotates counter-clockwise.
      // To start at 12 o'clock, we rotate -90deg or 25% of circumference.
      // But standard way is to use transform rotate on the group or circle.
      // Offset = - (accumulated percentage * circumference / 100)
      const offset = -(startPercent / 100) * circumference.value;

      return {
        ...item,
        dashArray: `${dashLength} ${gapLength}`,
        offset,
      };
    });
});
</script>

<template>
  <div class="relative inline-block" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg :viewBox="`0 0 ${size} ${size}`" class="w-full h-full transform-gpu">
      <!-- Background Track -->
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        stroke="currentColor"
        :stroke-width="strokeWidth"
        class="text-white/5"
      />
      
      <!-- Data Segments -->
      <circle
        v-for="seg in segments"
        :key="seg.label"
        :cx="center"
        :cy="center"
        :r="radius"
        fill="none"
        stroke="currentColor"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        :stroke-dasharray="seg.dashArray"
        :stroke-dashoffset="seg.offset"
        :class="[seg.colorClass, 'transition-all duration-700 ease-out origin-center -rotate-90']"
      />
    </svg>

    <!-- Center Content Slot -->
    <div class="absolute inset-0 flex items-center justify-center">
      <slot />
    </div>
  </div>
</template>
