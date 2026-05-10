<script setup lang="ts">
import { uiFieldClass, uiFieldErrorClass } from "@/shared/presentation/components/ui/styles";
import { cn } from "@/shared/presentation/lib/utils";

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
        uiFieldClass,
        'h-14',
        error && uiFieldErrorClass,
        props.class
      )"
    />
    <p v-if="error" class="mt-2 text-sm font-medium text-destructive px-2">
      {{ error }}
    </p>
  </div>
</template>
