<script setup lang="ts">
import { computed } from "vue";

interface Props {
  values: number[];
  referenceValue?: number | null;
  referenceLabel?: string;
  referenceLabelAlign?: "left" | "right";
  label?: string;
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
  referenceValue: null,
  referenceLabel: "AVG",
  referenceLabelAlign: "right",
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

  // Include referenceValue in the range calculation so the dashed line fits
  const dataMin = Math.min(...vals);
  const dataMax = Math.max(...vals);
  const rangeMin = props.referenceValue != null ? Math.min(dataMin, props.referenceValue) : dataMin;
  const rangeMax = props.referenceValue != null ? Math.max(dataMax, props.referenceValue) : dataMax;
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
    maxLineY: props.referenceValue != null ? toY(props.referenceValue) : null,
  };
});
</script>

<template>
  <div class="relative w-full" :style="{ aspectRatio: `${width} / ${height}` }">
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      class="overflow-visible absolute inset-0 w-full h-full opacity-90 transition-opacity duration-300"
    >
      <template v-if="chartData">
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

        <!-- Reference dashed line -->
        <template v-if="chartData.maxLineY != null && referenceValue != null">
          <line
            :x1="padding.left"
            :y1="chartData.maxLineY"
            :x2="width - padding.right"
            :y2="chartData.maxLineY"
            :stroke="color"
            stroke-width="1"
            stroke-dasharray="3 3"
            opacity="0.6"
          />
        </template>
      </template>

      <!-- Fallback for insufficient data -->
      <text
        v-else
        :x="width / 2"
        :y="height / 2"
        text-anchor="middle"
        dominant-baseline="central"
        class="text-xs fill-muted-foreground"
      >
        —
      </text>
    </svg>

    <!-- HTML Text Overlays for absolute foreground stacking -->
    <template v-if="chartData">
      <div
        v-if="chartData.maxLineY != null && referenceValue != null"
        class="absolute z-50 text-[9px] font-bold pointer-events-none"
        :style="{
          top: `${chartData.maxLineY - 12}px`,
          left: referenceLabelAlign === 'left' ? `${padding.left}px` : 'auto',
          right: referenceLabelAlign === 'right' ? `${padding.right}px` : 'auto',
          color: color,
          textShadow: '0 0 4px var(--background), 0 0 2px var(--background)'
        }"
      >
        {{ referenceLabel }} {{ typeof referenceValue === 'number' ? Math.round(referenceValue) : referenceValue }}
      </div>

      <div
        v-if="label"
        class="absolute z-50 text-xs font-bold uppercase pointer-events-none"
        style="color: oklch(0.55 0 0);"
        :style="{ top: `${padding.top - 12}px`, left: `${padding.left}px` }"
      >
        {{ label }}
      </div>
    </template>
  </div>
</template>
