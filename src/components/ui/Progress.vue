<script setup lang="ts">
import { ProgressIndicator, ProgressRoot } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<{
  modelValue?: number | null;
  max?: number;
  class?: any;
}>();
</script>

<template>
  <ProgressRoot
    :value="modelValue"
    :max="max ?? 100"
    :class="cn('relative h-3 w-full overflow-hidden rounded-full bg-black/40 border border-white/5 shadow-inner', props.class)"
  >
    <ProgressIndicator
      class="h-full w-full bg-linear-to-r from-primary to-primary/60 transition-all duration-500 ease-out"
      :style="`transform: translateX(-${100 - (modelValue || 0)}%)`"
    />
  </ProgressRoot>
</template>
