<script setup lang="ts">
import { cn } from "@/lib/utils";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  class?: any;
  error?: string;
}>();

const modelValue = defineModel<string | number>();
</script>

<template>
  <div class="relative w-full">
    <input
      v-bind="$attrs"
      v-model="modelValue"
      :class="cn(
        'flex h-14 w-full rounded-2xl border border-input/50 backdrop-blur-md bg-white/5 px-4 py-3 text-base font-medium ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-inner',
        error && 'border-destructive focus-visible:ring-destructive',
        props.class
      )"
    />
    <p v-if="error" class="mt-2 text-sm font-medium text-destructive px-2">
      {{ error }}
    </p>
  </div>
</template>
