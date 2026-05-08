<script setup lang="ts">
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: any;
}>();
</script>

<template>
  <header
    :class="cn(
      'flex items-center p-4 sticky top-0 bg-background/90 z-50 backdrop-blur-xl border-b border-white/5',
      props.class
    )"
  >
    <slot />
  </header>
</template>
