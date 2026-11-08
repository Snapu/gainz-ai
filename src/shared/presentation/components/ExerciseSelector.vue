<script setup lang="ts">
import { Plus, Search } from "@lucide/vue";
import { computed, type HTMLAttributes, ref, watch } from "vue";
import { uiFieldClass, uiPressClass } from "@/shared/presentation/components/ui/styles";
import { cn } from "@/shared/presentation/lib/utils";
import UiBadge from "./ui/UiBadge.vue";
import UiBottomSheet from "./ui/UiBottomSheet.vue";
import UiToggleGroup from "./ui/UiToggleGroup.vue";
import UiToggleGroupItem from "./ui/UiToggleGroupItem.vue";

interface ExerciseSelectorOptionMeta {
  label: string;
  tone?: "default" | "primary";
}

export interface ExerciseSelectorOptionDetails {
  description?: string;
  meta?: ExerciseSelectorOptionMeta[];
}

interface Props {
  options: string[];
  optionDetails?: Record<string, ExerciseSelectorOptionDetails>;
  placeholder?: string;
  class?: HTMLAttributes["class"];
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
  <UiBottomSheet v-model:open="isOpen" title="Choose Exercise" title-class="italic">
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

    <template #title>
      Choose <span class="text-primary">Exercise</span>
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
      <UiToggleGroup
        v-if="filteredOptions.length > 0"
        type="single"
        :model-value="modelValue"
        class="gap-2"
      >
        <UiToggleGroupItem
          v-for="option in filteredOptions"
          :key="option"
          :value="option"
          @click="handleSelect(option)"
          class="flex flex-col items-start gap-1 p-4 text-left select-none"
        >
          <div class="flex w-full items-center justify-between gap-3">
            <span class="truncate pr-4 text-sm font-bold tracking-tight text-foreground">
              {{ option }}
            </span>
            <div
              v-if="optionDetails?.[option]?.meta?.length"
              class="flex shrink-0 flex-wrap justify-end gap-1.5"
            >
              <UiBadge
                v-for="meta in optionDetails[option].meta"
                :key="meta.label"
                :variant="meta.tone === 'primary' ? 'info' : 'surface'"
              >
                {{ meta.label }}
              </UiBadge>
            </div>
          </div>
          <div
            v-if="optionDetails?.[option]?.description"
            class="text-left text-xs italic text-muted-foreground/70"
          >
            {{ optionDetails[option].description }}
          </div>
        </UiToggleGroupItem>
      </UiToggleGroup>
    </div>
  </UiBottomSheet>
</template>
