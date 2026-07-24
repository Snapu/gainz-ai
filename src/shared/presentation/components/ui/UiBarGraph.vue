<script setup lang="ts">
import { computed } from "vue";

interface BarItem {
  value: number;
  groupKey?: string;
}

interface Props {
  items?: BarItem[];
  values?: number[]; // fallback for older usage
  label?: string;
  color?: string;
  direction?: "up" | "down";
  formatValue?: (val: number) => string | number;
}

const props = withDefaults(defineProps<Props>(), {
  items: () => [],
  values: () => [],
  label: "",
  color: "oklch(0.87 0.2 150)",
  direction: "up",
});

const activeItems = computed<BarItem[]>(() => {
  if (props.items.length > 0) return props.items;
  return props.values.map((v) => ({ value: v }));
});

const maxVal = computed(() => {
  return Math.max(...activeItems.value.map((i) => i.value), 1);
});

const minVal = computed(() => {
  const vals = activeItems.value.map((i) => i.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (min === max) return 0;
  // Optional: add a buffer below the min value so the lowest bar isn't 0px
  return Math.max(min * 0.8, 0);
});

const range = computed(() => {
  const diff = maxVal.value - minVal.value;
  return diff > 0 ? diff : 1;
});

function getBarHeight(val: number): string {
  if (val === 0 || range.value === 0) return "2px";
  return `max(2px, ${((val - minVal.value) / range.value) * 100}%)`;
}

const itemGroupIndices = computed(() => {
  let groupIdx = 0;
  const indices: number[] = [];
  for (let i = 0; i < activeItems.value.length; i++) {
    if (i > 0 && activeItems.value[i].groupKey !== activeItems.value[i - 1].groupKey) {
      groupIdx++;
    }
    indices.push(groupIdx % 2);
  }
  return indices;
});
</script>

<template>
  <div class="w-full h-full flex" :class="direction === 'down' ? 'flex-col-reverse' : 'flex-col'">
    <!-- Header Label -->
    <div
      v-if="label"
      class="text-xs font-bold uppercase opacity-60 leading-none"
      :class="direction === 'down' ? 'mt-1' : 'mb-1'"
      :style="{ color: props.color }"
    >
      {{ label }}
    </div>
    
    <div 
      class="w-full flex-1 flex relative"
      :class="direction === 'down' ? 'items-start pb-6' : 'items-end pt-6'"
    >
      <template v-for="(item, idx) in activeItems" :key="idx">
        <div 
          class="flex-1 flex group relative h-full min-w-0"
          :class="[
            idx > 0 ? 'ml-0.5' : '',
            direction === 'down' ? 'items-start' : 'items-end'
          ]"
        >
          <!-- The bar -->
          <div 
            class="w-full transition-opacity relative"
            :class="[
              itemGroupIndices[idx] === 0 ? 'opacity-80 group-hover:opacity-100' : 'opacity-40 group-hover:opacity-60',
              direction === 'down' ? 'rounded-b-[2px]' : 'rounded-t-[2px]'
            ]"
            :style="{ height: getBarHeight(item.value), backgroundColor: props.color }"
          >
            <span 
              class="absolute left-1/2 -translate-x-1/2 text-xs font-bold tracking-tighter transition-opacity"
              :class="[
                direction === 'down' ? 'top-full mt-2' : 'bottom-full mb-1',
                '-rotate-45',
                itemGroupIndices[idx] === 0 ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'
              ]"
              :style="{ color: props.color }"
            >
              {{ formatValue ? formatValue(item.value) : item.value }}
            </span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
