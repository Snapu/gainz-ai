<script setup lang="ts">
import { computed } from "vue";

interface Props {
  values: number[];
  maxValue?: number | null;
  label?: string;
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
  maxValue: null,
  label: "",
  width: 140,
  height: 44,
  color: "oklch(0.87 0.2 150)",
  fillColor: "oklch(0.87 0.2 150 / 0.1)",
});

const padding = { top: 8, right: 4, bottom: 4, left: 4 };

const chartData = computed(() => {
  const vals = props.values;
  if (vals.length < 2) return null;

  // Include maxValue in the range calculation so the dashed line fits
  const dataMin = Math.min(...vals);
  const dataMax = Math.max(...vals);
  const rangeMin = props.maxValue != null ? Math.min(dataMin, props.maxValue) : dataMin;
  const rangeMax = props.maxValue != null ? Math.max(dataMax, props.maxValue) : dataMax;
  const range = rangeMax - rangeMin || 1;

  const w = props.width - padding.left - padding.right;
  const h = props.height - padding.top - padding.bottom;

  const toY = (v: number) => padding.top + h - ((v - rangeMin) / range) * h;

  const points = vals.map((v, i) => ({
    x: padding.left + (i / (vals.length - 1)) * w,
    y: toY(v),
  }));

  const last = points[points.length - 1]!;
  const first = points[0]!;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const fillPath = `${linePath} L${last.x},${props.height} L${first.x},${props.height} Z`;

  return {
    linePath,
    fillPath,
    lastPoint: last,
    maxLineY: props.maxValue != null ? toY(props.maxValue) : null,
  };
});
</script>

<template>
  <svg
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    class="overflow-visible"
  >
    <template v-if="chartData">
      <!-- Max reference dashed line -->
      <template v-if="chartData.maxLineY != null && maxValue != null">
        <line
          :x1="padding.left"
          :y1="chartData.maxLineY"
          :x2="width - padding.right"
          :y2="chartData.maxLineY"
          stroke="oklch(0.7 0.05 60)"
          stroke-width="1"
          stroke-dasharray="3 3"
          opacity="0.6"
        />
        <text
          :x="width - padding.right"
          :y="chartData.maxLineY - 3"
          text-anchor="end"
          class="text-[9px] font-bold"
          fill="oklch(0.7 0.05 60)"
        >
          MAX {{ maxValue }}
        </text>
      </template>

      <!-- Area fill -->
      <path :d="chartData.fillPath" :fill="fillColor" />

      <!-- Trend line -->
      <path
        :d="chartData.linePath"
        fill="none"
        :stroke="color"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <!-- Last point dot -->
      <circle :cx="chartData.lastPoint.x" :cy="chartData.lastPoint.y" r="3" :fill="color" />

      <!-- Label -->
      <text
        v-if="label"
        :x="padding.left"
        :y="padding.top - 2"
        class="text-[9px] font-bold uppercase"
        fill="oklch(0.55 0 0)"
      >
        {{ label }}
      </text>
    </template>

    <!-- Fallback for insufficient data -->
    <text
      v-else
      :x="width / 2"
      :y="height / 2"
      text-anchor="middle"
      dominant-baseline="central"
      class="text-[10px] fill-muted-foreground"
    >
      —
    </text>
  </svg>
</template>
