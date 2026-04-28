<script setup lang="ts">
import { cn } from "@/lib/utils";

interface Props {
  as?: string;
  class?: any;
  /** 'list' — preset for grouped list containers (bg-card/40, divide-y, overflow-hidden) */
  variant?: "list";
}

const props = withDefaults(defineProps<Props>(), {
  as: "div",
});
</script>

<template>
  <component
    :is="as"
    :class="cn(
      'group relative overflow-hidden rounded-2xl border border-white/5 shadow-sm transition-all duration-300 isolate',
      props.variant === 'list' && 'flex flex-col bg-card/40 border-white/5 divide-y divide-white/5',
      props.class
    )"
  >
    <!-- Base opaque layer to block what's behind from bleeding through -->
    <div class="absolute inset-0 bg-background pointer-events-none -z-20"></div>
    
    <!-- Gradient styling -->
    <div 
      class="absolute inset-0 bg-linear-to-r from-card/60 to-card/20 pointer-events-none -z-10 transition-colors duration-300"
      :class="{ 'group-hover:from-card/80': as === 'button' || as === 'a' }"
    ></div>

    <slot />
  </component>
</template>
