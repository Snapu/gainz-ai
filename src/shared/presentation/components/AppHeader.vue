<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/shared/presentation/lib/utils";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <header
    :class="cn(
      'flex items-center justify-between h-13 px-4 sticky top-0 bg-background/90 z-50 backdrop-blur-xl border-b border-white/5 select-none touch-none',
      props.class
    )"
  >
    <div class="flex items-center gap-2 min-h-0">
      <slot />
    </div>
    <div class="flex items-center gap-1.5" v-if="$slots.actions">
      <slot name="actions" />
    </div>
  </header>
</template>
