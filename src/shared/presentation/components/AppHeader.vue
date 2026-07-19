<script setup lang="ts">
import { cn } from "@/shared/presentation/lib/utils";

const props = defineProps<{
  class?: any;
}>();
</script>

<template>
  <header
    :class="cn(
      'flex items-center justify-between p-4 sticky top-0 bg-background/90 z-50 backdrop-blur-xl border-b border-white/5',
      props.class
    )"
  >
    <div class="flex items-center gap-2">
      <slot />
    </div>
    <div class="flex items-center gap-2" v-if="$slots.actions">
      <slot name="actions" />
    </div>
  </header>
</template>
