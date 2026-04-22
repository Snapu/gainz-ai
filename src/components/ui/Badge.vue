<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import { cn } from "@/lib/utils";

interface Props {
  variant?: "default" | "outline" | "ghost" | "secondary";
  class?: HTMLAttributes["class"];
}

const props = withDefaults(defineProps<Props>(), {
  variant: "default",
});

const variantClasses = computed(() => {
  switch (props.variant) {
    case "outline":
      return "border border-border text-foreground";
    case "secondary":
      return "bg-secondary text-secondary-foreground hover:bg-secondary/80";
    case "ghost":
      return "hover:bg-accent hover:text-accent-foreground text-foreground";
    case "default":
    default:
      return "bg-primary text-primary-foreground hover:bg-primary/90";
  }
});
</script>

<template>
  <div
    :class="cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
      variantClasses,
      props.class
    )"
  >
    <slot />
  </div>
</template>
