<script setup lang="ts">
import { Plus, Search, X } from "@lucide/vue";
import { DialogClose, DialogTitle } from "reka-ui";
import { computed, ref, watch } from "vue";
import {
  uiFieldClass,
  uiIconButtonClass,
  uiPressClass,
} from "@/shared/presentation/components/ui/styles";
import { cn } from "@/shared/presentation/lib/utils";
import ClickableList, {
  type ClickableListItem,
  type ClickableListItemMeta,
} from "./ClickableList.vue";
import UiBottomSheet from "./ui/UiBottomSheet.vue";

export interface ExerciseSelectorOptionDetails {
  description?: string;
  meta?: ClickableListItemMeta[];
}

interface Props {
  options: string[];
  optionDetails?: Record<string, ExerciseSelectorOptionDetails>;
  placeholder?: string;
  class?: any;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: "Select exercise...",
});

const modelValue = defineModel<string>();
const emit = defineEmits<(e: "select-option", value: string) => void>();

const isOpen = ref(false);
const searchQuery = ref("");

const filteredOptions = computed(() => {
  if (!searchQuery.value) return props.options;
  return props.options.filter((option) =>
    option.toLowerCase().includes(searchQuery.value.toLowerCase()),
  );
});

const listItems = computed<ClickableListItem[]>(() => {
  return filteredOptions.value.map((option) => ({
    id: option,
    title: option,
    description: props.optionDetails?.[option]?.description,
    meta: props.optionDetails?.[option]?.meta,
  }));
});

const showCreateOption = computed(() => {
  return (
    searchQuery.value &&
    !props.options.some((opt) => opt.toLowerCase() === searchQuery.value.toLowerCase())
  );
});

function handleSelect(option: string) {
  modelValue.value = option;
  emit("select-option", option);
  isOpen.value = false;
  searchQuery.value = "";
}

function handleCreate() {
  if (!searchQuery.value) return;
  handleSelect(searchQuery.value);
}

watch(isOpen, (val) => {
  if (!val) {
    searchQuery.value = "";
  }
});
</script>

<template>
  <UiBottomSheet v-model:open="isOpen" content-class="p-0 gap-0">
    <!-- Trigger -->
    <template #trigger>
      <button
        type="button"
        @click="isOpen = true"
        :class="cn(
          uiFieldClass,
          uiPressClass,
          'h-14 items-center justify-between bg-card/60 text-left',
          !modelValue && 'text-muted-foreground',
          props.class
        )"
      >
        <span class="truncate">{{ modelValue || props.placeholder }}</span>
        <Search class="w-5 h-5 text-muted-foreground/50" />
      </button>
    </template>

    <template #header>
      <!-- Header -->
      <div class="flex items-center justify-between p-6 pb-2">
        <DialogTitle class="text-2xl font-bold italic tracking-tight">
          Choose <span class="text-primary">Exercise</span>
        </DialogTitle>
        <DialogClose :class="uiIconButtonClass">
          <X class="w-5 h-5 text-muted-foreground" />
          <span class="sr-only">Close</span>
        </DialogClose>
      </div>
    </template>

    <!-- Search Input (Not focused by default) -->
    <div class="px-6 py-4">
      <div class="relative flex items-center">
        <Search class="absolute left-4 w-5 h-5 text-muted-foreground/50 z-10" />
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          placeholder="Search or add new..."
          :class="cn(
            uiFieldClass,
            uiPressClass,
            'h-14 pl-12 pr-4 placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          )"
        />
      </div>
    </div>

    <!-- Scrollable List -->
    <div class="flex-1 overflow-y-auto px-6 pb-8 space-y-2 no-scrollbar">
      <!-- Create New Option -->
      <button
        type="button"
        v-if="showCreateOption"
        @click="handleCreate"
        :class="cn(
          'flex w-full items-center gap-4 rounded-xl border border-primary/20 bg-primary/10 p-4 text-primary animate-in fade-in slide-in-from-top-2',
          uiPressClass
        )"
      >
        <div class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
          <Plus class="w-6 h-6" />
        </div>
        <div class="flex-1 text-left">
          <span class="block text-sm font-bold uppercase tracking-widest opacity-60">Create New</span>
          <span class="block text-lg font-bold leading-tight">{{ searchQuery }}</span>
        </div>
      </button>

      <!-- Empty State -->
      <div v-if="filteredOptions.length === 0 && !showCreateOption" class="py-12 text-center text-muted-foreground">
        <p class="text-lg font-medium">No exercises found</p>
        <p class="text-sm">Type to create a new one</p>
      </div>

      <!-- List Items -->
      <ClickableList
        v-if="listItems.length > 0"
        :items="listItems"
        item-class="select-none"
        @select="handleSelect($event.title)"
      />
    </div>
  </UiBottomSheet>
</template>
