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
  <div :class="cn('flex flex-col items-center justify-center h-40 text-center text-muted-foreground/50', props.class)">
    <component :is="icon" v-if="icon" class="w-12 h-12 mb-4 opacity-50" />
    <p class="font-medium text-lg text-foreground/80">{{ title }}</p>
    <p v-if="description" class="text-sm mt-1 opacity-70">{{ description }}</p>
    <slot />
  </div>
</template>
