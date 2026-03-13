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
      class="h-full w-full bg-primary transition-all duration-500 ease-out shadow-[0_0_15px_rgba(204,255,0,0.5)]"
      :style="`transform: translateX(-${100 - (modelValue || 0)}%)`"
    />
  </ProgressRoot>
</template>
