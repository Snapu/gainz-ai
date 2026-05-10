<script setup lang="ts">
import { DropdownMenuItem } from "reka-ui";
import { cn } from "@/shared/presentation/lib/utils";
import { dropdownMenuItemVariants } from "./styles";

const props = defineProps<{
  class?: any;
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
