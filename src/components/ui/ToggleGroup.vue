<script setup lang="ts">
import { ToggleGroupRoot, type ToggleGroupRootProps } from "reka-ui";
import { cn } from "@/lib/utils";

interface Props extends ToggleGroupRootProps {
  class?: any;
}

const props = defineProps<Props>();
const modelValue = defineModel<string | string[]>();
</script>

<template>
  <ToggleGroupRoot
    v-bind="props"
    v-model="modelValue"
    :class="cn('flex flex-col gap-3 w-full', props.class)"
  >
    <slot />
  </ToggleGroupRoot>
</template>
