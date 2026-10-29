<script setup lang="ts">
import { DropdownMenuItem } from "reka-ui";
import type { HTMLAttributes } from "vue";
import { cn } from "@/shared/presentation/lib/utils";
import { dropdownMenuItemVariants } from "./styles";

const props = defineProps<{
  class?: HTMLAttributes["class"];
  inset?: boolean;
}>();
</script>

<template>
  <DropdownMenuItem
    :class="cn(dropdownMenuItemVariants({ inset: props.inset ?? false }), props.class)"
  >
    <slot />
  </DropdownMenuItem>
</template>
