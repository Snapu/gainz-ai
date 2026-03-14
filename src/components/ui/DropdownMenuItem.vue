<script setup lang="ts">
import { DropdownMenuItem } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<{
  class?: any;
  inset?: boolean;
}>();
</script>

<template>
  <DropdownMenuItem
    :class="cn(
      'relative flex cursor-default select-none items-center rounded-xl px-4 py-3 text-sm font-semibold outline-none transition-colors focus:bg-white/10 focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      inset && 'pl-8',
      props.class
    )"
  >
    <slot />
  </DropdownMenuItem>
</template>
