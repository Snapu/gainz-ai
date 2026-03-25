<script setup lang="ts">
import { Plus, Search, X } from "lucide-vue-next";
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import { computed, nextTick, ref, watch } from "vue";
import { useKeyboardHeight } from "@/composables/useKeyboardHeight";
import { cn } from "@/lib/utils";
import SwipeToDeleteItem from "./SwipeToDeleteItem.vue";

interface Props {
  options: string[];
  placeholder?: string;
  class?: any;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: "Select exercise...",
});

const modelValue = defineModel<string>();
const emit = defineEmits<{
  (e: "select-option", value: string): void;
  (e: "delete", value: string): void;
}>();

const isOpen = ref(false);
const searchQuery = ref("");
const { keyboardHeight, visibleHeight, startTracking, stopTracking } = useKeyboardHeight();

const dialogStyle = computed(() => ({
  bottom: `${keyboardHeight.value}px`,
  maxHeight: `${visibleHeight.value * 0.9}px`,
}));

const filteredOptions = computed(() => {
  if (!searchQuery.value) return props.options;
  return props.options.filter((option) =>
    option.toLowerCase().includes(searchQuery.value.toLowerCase()),
  );
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
    stopTracking();
  } else {
    nextTick(startTracking);
  }
});
</script>

<template>
  <DialogRoot v-model:open="isOpen">
    <!-- Trigger -->
    <button
      type="button"
      @click="isOpen = true"
      :class="cn(
        'flex h-14 w-full items-center justify-between rounded-2xl border border-input/50 backdrop-blur-md bg-card/60 px-4 py-3 text-base font-medium ring-offset-background transition-all shadow-inner text-left active:scale-[0.98]',
        !modelValue && 'text-muted-foreground',
        props.class
      )"
    >
      <span class="truncate">{{ modelValue || props.placeholder }}</span>
      <Search class="w-5 h-5 text-muted-foreground/50" />
    </button>

    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <DialogContent
        class="fixed left-0 right-0 z-50 flex flex-col gap-0 rounded-t-[2.5rem] border-t border-white/5 bg-background/95 backdrop-blur-xl pb-safe shadow-2xl data-[state=open]:animate-slide-in-from-bottom data-[state=closed]:animate-slide-out-to-bottom outline-none transition-[bottom,max-height] duration-200"
        :style="dialogStyle"
      >
        
        <!-- Header -->
        <div class="flex items-center justify-between p-6 pb-2">
          <DialogTitle class="text-2xl font-black italic tracking-tight">
            Choose <span class="text-primary">Exercise</span>
          </DialogTitle>
          <DialogClose class="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors">
            <X class="w-5 h-5 text-muted-foreground" />
          </DialogClose>
        </div>

        <!-- Search Input (Not focused by default) -->
        <div class="px-6 py-4">
          <div class="relative flex items-center">
            <Search class="absolute left-4 w-5 h-5 text-muted-foreground/50 z-10" />
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              placeholder="Search or add new..."
              class="flex h-14 w-full rounded-2xl border border-white/5 bg-white/5 pl-12 pr-4 py-3 text-base font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all shadow-inner"
            />
          </div>
        </div>

        <!-- Scrollable List -->
        <div class="flex-1 overflow-y-auto px-6 pb-8 space-y-2 no-scrollbar">
          <!-- Create New Option -->
          <button
            v-if="showCreateOption"
            @click="handleCreate"
            class="flex w-full items-center gap-4 p-4 rounded-xl bg-primary/10 border border-primary/20 text-primary animate-in fade-in slide-in-from-top-2"
          >
            <div class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Plus class="w-6 h-6" />
            </div>
            <div class="flex-1 text-left">
              <span class="block text-sm font-black uppercase tracking-widest opacity-60">Create New</span>
              <span class="block text-lg font-bold leading-tight">{{ searchQuery }}</span>
            </div>
          </button>

          <!-- Empty State -->
          <div v-if="filteredOptions.length === 0 && !showCreateOption" class="py-12 text-center text-muted-foreground">
            <p class="text-lg font-medium">No exercises found</p>
            <p class="text-sm">Type to create a new one</p>
          </div>

          <!-- List Items -->
          <div class="flex flex-col gap-2">
            <SwipeToDeleteItem
              v-for="option in filteredOptions"
              :key="option"
              @delete="emit('delete', option)"
            >
              <div
                class="group relative flex w-full items-center justify-between bg-transparent p-1 active:scale-[0.99] transition-all cursor-pointer"
                @click="handleSelect(option)"
              >
                <div class="flex-1 min-w-0 pr-4">
                  <span class="text-lg font-bold truncate block">{{ option }}</span>
                </div>
                
                <!-- Actions (Delete, etc.) -->
                <div @click.stop class="flex items-center">
                  <slot name="item-action" :option="option" />
                </div>
              </div>
            </SwipeToDeleteItem>
          </div>
        </div>
        
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
