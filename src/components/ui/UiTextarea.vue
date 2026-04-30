<script setup lang="ts">
import { uiFieldClass, uiFieldErrorClass } from "@/components/ui/styles";
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
    <textarea
      v-bind="$attrs"
      v-model="modelValue"
      :class="cn(
        uiFieldClass,
        'min-h-[120px] resize-none',
        error && uiFieldErrorClass,
        props.class
      )"
    ></textarea>
    <p v-if="error" class="mt-2 text-sm font-medium text-destructive px-2">
      {{ error }}
    </p>
  </div>
</template>
