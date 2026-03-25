<script setup lang="ts">
import { X } from "lucide-vue-next";
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  type DialogRootEmits,
  type DialogRootProps,
  DialogTitle,
  useForwardPropsEmits,
} from "reka-ui";
import { computed, nextTick, watch } from "vue";
import { useKeyboardHeight } from "@/composables/useKeyboardHeight";
import { cn } from "@/lib/utils";

const props = defineProps<DialogRootProps & { title?: string; contentClass?: any }>();
const emits = defineEmits<DialogRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);

// Global Keyboard Handling
const { keyboardHeight, visibleHeight, startTracking, stopTracking } = useKeyboardHeight();

const dialogStyle = computed(() => ({
  bottom: `${keyboardHeight.value}px`,
  maxHeight: `${visibleHeight.value * 0.9}px`,
}));

function handleOpenChange(isOpen: boolean) {
  if (isOpen) {
    nextTick(startTracking);
  } else {
    stopTracking();
  }
}

// Ensure keyboard tracking starts when programmatic opens occur (v-model updates from parent)
watch(() => props.open, (isOpen) => {
  if (isOpen !== undefined) {
    handleOpenChange(isOpen);
  }
});
</script>

<template>
  <DialogRoot v-bind="forwarded" @update:open="handleOpenChange">
    <slot name="trigger" />
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <DialogContent 
        :class="cn(
          'fixed left-0 right-0 z-50 flex flex-col gap-4 rounded-t-[2.5rem] border-t border-white/5 bg-background/95 backdrop-blur-xl p-8 pb-safe shadow-2xl data-[state=open]:animate-slide-in-from-bottom data-[state=closed]:animate-slide-out-to-bottom outline-none overflow-y-auto no-scrollbar transition-[bottom,max-height] duration-200',
          props.contentClass
        )"
        :style="dialogStyle"
      >
        
        <slot name="header">
          <div class="flex items-center justify-between mb-2">
            <DialogTitle v-if="title" class="text-2xl font-bold tracking-tight">
              {{ title }}
            </DialogTitle>
            <div v-else class="flex-1" />
            
            <DialogClose class="rounded-full p-2.5 bg-white/5 hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary active:scale-95">
              <X class="w-5 h-5 text-muted-foreground hover:text-foreground" />
              <span class="sr-only">Close</span>
            </DialogClose>
          </div>
        </slot>
        
        <slot />
        
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
