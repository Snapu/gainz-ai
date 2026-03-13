<script setup lang="ts">
import { Search, X } from "lucide-vue-next";
import {
  AutocompleteAnchor,
  AutocompleteCancel,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompletePortal,
  AutocompleteRoot,
  AutocompleteViewport,
  useFilter,
} from "reka-ui";
import { ref } from "vue";
import { cn } from "@/lib/utils";

interface Props {
  options: string[];
  placeholder?: string;
  class?: any;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: "Search...",
});

const modelValue = defineModel<string>();
const emit = defineEmits<(e: "select-option", value: string) => void>();

const { contains } = useFilter({ sensitivity: "base" });
const isOpen = ref(false);
</script>

<template>
  <AutocompleteRoot
    v-model="modelValue"
    v-model:open="isOpen"
    :filter-function="(val: string, term: string) => contains(val, term)"
    class="w-full relative"
  >
    <AutocompleteAnchor class="relative w-full flex items-center">
      <Search class="absolute left-4 w-5 h-5 text-muted-foreground z-10" />
      <AutocompleteInput
        @focus="isOpen = true"
        @click="isOpen = true"
        :placeholder="props.placeholder"
        :class="cn(
          'flex h-14 w-full rounded-2xl border border-input/50 backdrop-blur-md bg-card/60 pl-12 pr-12 py-3 text-base font-medium ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-inner',
          props.class
        )"
      />
      <AutocompleteCancel class="absolute right-4 p-1 rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors outline-none focus:ring-2 focus:ring-primary z-10">
        <X class="w-4 h-4" />
      </AutocompleteCancel>
    </AutocompleteAnchor>
    
    <AutocompletePortal>
      <AutocompleteContent
        position="popper"
        :side-offset="8"
        hide-when-empty
        class="z-[100] w-[var(--reka-autocomplete-trigger-width)] max-h-[40vh] overflow-y-auto rounded-2xl border border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl p-2 data-[state=open]:animate-in data-[state=closed]:animate-out"
      >
        <AutocompleteViewport>
          <AutocompleteEmpty class="p-6 text-center text-sm font-medium text-muted-foreground">
            No matches found
          </AutocompleteEmpty>
          <AutocompleteItem
            v-for="option in options"
            :key="option"
            :value="option"
            class="relative flex w-full select-none justify-between items-center space-x-3 rounded-xl px-4 py-3 text-base outline-none data-[highlighted]:bg-white/10 data-[highlighted]:text-primary cursor-pointer transition-colors"
            @select="emit('select-option', option)"
            @click="emit('select-option', option)"
            @keydown.enter="emit('select-option', option)"
          >
            <span class="flex-1 truncate">{{ option }}</span>
            <slot name="item-action" :option="option" />
          </AutocompleteItem>
        </AutocompleteViewport>
      </AutocompleteContent>
    </AutocompletePortal>
  </AutocompleteRoot>
</template>
