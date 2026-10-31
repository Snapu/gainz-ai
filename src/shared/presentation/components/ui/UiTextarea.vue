<script setup lang="ts">
import { useTextareaAutosize } from "@vueuse/core";
import type { HTMLAttributes } from "vue";
import { computed, ref } from "vue";
import { uiFieldClass, uiFieldErrorClass } from "@/shared/presentation/components/ui/styles";
import { cn } from "@/shared/presentation/lib/utils";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes["class"];
    error?: string;
    autoResize?: boolean;
  }>(),
  {
    autoResize: false,
  },
);

const modelValue = defineModel<string | number>();
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const inputString = computed<string>({
  get: () => (modelValue.value != null ? String(modelValue.value) : ""),
  set: (val: string) => {
    modelValue.value = val;
  },
});

const targetElement = computed(() => (props.autoResize ? textareaRef.value : undefined));

useTextareaAutosize({
  element: targetElement,
  input: inputString,
});

defineExpose({
  textarea: textareaRef,
});
</script>

<template>
  <div class="relative w-full">
    <textarea
      ref="textareaRef"
      v-bind="$attrs"
      v-model="modelValue"
      :class="cn(
        uiFieldClass,
        props.autoResize
          ? 'resize-none overflow-y-auto transition-colors'
          : 'min-h-[120px] resize-none',
        error && uiFieldErrorClass,
        props.class
      )"
    ></textarea>
    <p v-if="error" class="mt-2 text-sm font-medium text-destructive px-2">
      {{ error }}
    </p>
  </div>
</template>
