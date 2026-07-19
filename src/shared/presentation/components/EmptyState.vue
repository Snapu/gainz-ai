<script setup lang="ts">
import type { Component } from "vue";
import { cn } from "@/shared/presentation/lib/utils";

const props = defineProps<{
  icon?: Component;
  title: string;
  description?: string;
  class?: any;
}>();
</script>

<template>
  <div :class="cn('flex flex-col items-center justify-center py-10 px-4 text-center bg-card rounded-xl border border-white/5 shadow-sm', props.class)">
    <div v-if="icon" class="mb-4 text-primary opacity-80">
      <component :is="icon" class="w-10 h-10" />
    </div>
    <p class="font-bold text-base text-foreground/90">{{ title }}</p>
    <p v-if="description" class="text-sm mt-1.5 text-muted-foreground max-w-[260px]">{{ description }}</p>
    <div v-if="$slots.default" class="mt-5">
      <slot />
    </div>
  </div>
</template>
