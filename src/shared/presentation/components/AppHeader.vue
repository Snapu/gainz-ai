<script setup lang="ts">
import { ArrowLeft } from "@lucide/vue";
import type { HTMLAttributes } from "vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import { cn } from "@/shared/presentation/lib/utils";

const props = defineProps<{
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  class?: HTMLAttributes["class"];
}>();

const emit = defineEmits<(e: "back") => void>();
</script>

<template>
  <header
    :class="cn(
      'flex items-center justify-between h-13 px-4 sticky top-0 bg-background/90 z-50 backdrop-blur-xl border-b border-white/5 select-none touch-none',
      props.class
    )"
  >
    <div class="flex items-center gap-2 min-h-0 min-w-0 flex-1">
      <UiButton
        v-if="showBack"
        variant="ghost"
        size="icon"
        aria-label="Go Back"
        class="-ml-1 shrink-0"
        @click="emit('back')"
      >
        <ArrowLeft class="w-5 h-5" />
      </UiButton>
      <div v-if="title" class="min-w-0 flex-1">
        <h1 class="text-xl font-bold tracking-tight text-foreground truncate">{{ title }}</h1>
        <p v-if="subtitle" class="text-xs text-muted-foreground/70 truncate">{{ subtitle }}</p>
      </div>
      <slot />
    </div>
    <div class="flex items-center gap-1.5 shrink-0" v-if="$slots.actions">
      <slot name="actions" />
    </div>
  </header>
</template>
