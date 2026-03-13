<script setup lang="ts">
import { ToggleGroupItem, type ToggleGroupItemProps } from "reka-ui";
import { cn } from "@/lib/utils";

interface Props extends Omit<ToggleGroupItemProps, "value"> {
  // Accept string or number values for ToggleGroupItem
  value?: string | number;
  class?: any;
}

const props = defineProps<Props>();
</script>

<template>
  <ToggleGroupItem
    v-bind="props"
    :value="props.value == null ? '' : String(props.value)"
    :class="cn(
      'flex items-center justify-between w-full px-5 py-4 rounded-2xl border-2 border-border/40 bg-card/50 text-card-foreground shadow-sm transition-all focus:outline-none',
      'hover:border-primary/50 hover:bg-card active:scale-[0.98]',
      'focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary focus-visible:outline-none',
      'data-[state=on]:bg-primary/10 data-[state=on]:border-primary data-[state=on]:text-white data-[state=on]:shadow-lg data-[state=on]:shadow-primary/20',
      props.class
    )"
  >
    <slot />
  </ToggleGroupItem>
</template>
