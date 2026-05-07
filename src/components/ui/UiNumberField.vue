<script setup lang="ts">
import { Minus, Plus } from "lucide-vue-next";
import {
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldRoot,
  type NumberFieldRootProps,
} from "reka-ui";
import { uiPressClass } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

interface Props extends NumberFieldRootProps {
  class?: any;
  label?: string;
  description?: string;
}

const props = defineProps<Props>();
const modelValue = defineModel<number | null>();

const defaultLocale = typeof navigator !== "undefined" ? navigator.language : "en-US";
</script>

<template>
  <NumberFieldRoot
    v-bind="props"
    v-model="modelValue"
    :locale="props.locale || defaultLocale"
    :class="cn('flex flex-col gap-2 w-full', props.class)"
  >
    <label v-if="label" class="text-sm font-semibold text-muted-foreground ml-1">{{ label }}</label>
    <div class="flex h-14 w-full items-center justify-between overflow-hidden rounded-2xl border border-input/50 bg-white/5 shadow-inner backdrop-blur-md transition-all duration-200 hover:border-primary/50 focus-within:ring-2 focus-within:ring-primary focus-within:border-primary">
      <NumberFieldDecrement
        :class="cn(
          'z-10 flex h-full cursor-pointer items-center justify-center px-4 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-20',
          uiPressClass
        )"
      >
        <Minus class="w-5 h-5" />
      </NumberFieldDecrement>
      <NumberFieldInput 
        inputmode="decimal"
        class="flex-1 w-full min-w-0 p-0 text-center bg-transparent border-none text-2xl font-bold focus:outline-none text-foreground z-0" 
      />
      <NumberFieldIncrement
        :class="cn(
          'z-10 flex h-full cursor-pointer items-center justify-center px-4 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground active:bg-white/10 disabled:cursor-not-allowed disabled:opacity-20',
          uiPressClass
        )"
      >
        <Plus class="w-5 h-5" />
      </NumberFieldIncrement>
    </div>
    <p v-if="description" class="text-xs text-muted-foreground ml-1">{{ description }}</p>
  </NumberFieldRoot>
</template>
