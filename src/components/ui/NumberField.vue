<script setup lang="ts">
import { Minus, Plus } from "lucide-vue-next";
import {
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldRoot,
  type NumberFieldRootProps,
} from "reka-ui";
import { cn } from "@/lib/utils";

interface Props extends NumberFieldRootProps {
  class?: any;
  label?: string;
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
    <div class="flex items-center justify-between w-full h-14 rounded-2xl border border-input/50 bg-white/5 overflow-hidden shadow-inner focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all backdrop-blur-md">
      <NumberFieldDecrement class="h-full px-4 flex items-center justify-center text-muted-foreground hover:bg-white/5 hover:text-foreground active:bg-white/10 transition-colors disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed z-10">
        <Minus class="w-5 h-5" />
      </NumberFieldDecrement>
      <NumberFieldInput 
        inputmode="decimal"
        class="flex-1 w-full min-w-0 p-0 text-center bg-transparent border-none text-2xl font-bold focus:outline-none text-foreground z-0" 
      />
      <NumberFieldIncrement class="h-full px-4 flex items-center justify-center text-muted-foreground hover:bg-white/5 hover:text-foreground active:bg-white/10 transition-colors disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed z-10">
        <Plus class="w-5 h-5" />
      </NumberFieldIncrement>
    </div>
  </NumberFieldRoot>
</template>
