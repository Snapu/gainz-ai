<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/shared/presentation/lib/utils";

const props = defineProps<{
  title: string;
  subtitle?: string;
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <div :class="cn('flex items-center justify-between gap-3 mb-3', props.class)">
    <div class="flex flex-col min-w-0">
      <h3 class="text-sm font-bold text-foreground truncate">{{ title }}</h3>
      <p v-if="subtitle" class="text-xs text-muted-foreground font-medium mt-0.5 line-clamp-1">
        {{ subtitle }}
      </p>
    </div>
    <div v-if="$slots.action" class="flex items-center gap-2 shrink-0">
      <slot name="action" />
    </div>
  </div>
</template>
