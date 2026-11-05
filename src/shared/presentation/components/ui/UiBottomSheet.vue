<script setup lang="ts">
import { X } from "@lucide/vue";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  type DialogRootEmits,
  type DialogRootProps,
  DialogTitle,
  useForwardPropsEmits,
} from "reka-ui";
import { type CSSProperties, computed, type HTMLAttributes, nextTick, watch } from "vue";
import { uiIconButtonClass } from "@/shared/presentation/components/ui/styles";
import { useKeyboardHeight } from "@/shared/presentation/composables/useKeyboardHeight";
import { cn } from "@/shared/presentation/lib/utils";

const props = defineProps<
  DialogRootProps & {
    title?: string;
    contentClass?: HTMLAttributes["class"];
    contentStyle?: CSSProperties;
    hideOverlay?: boolean;
  }
>();
const emits = defineEmits<DialogRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);

// Global Keyboard Handling
const { keyboardHeight, visibleHeight, startTracking, stopTracking } = useKeyboardHeight();

const dialogStyle = computed(() => ({
  bottom: `${keyboardHeight.value}px`,
  maxHeight: `${visibleHeight.value * 0.9}px`,
  ...props.contentStyle,
}));

function scrollFocusedInputIntoView(): void {
  const activeEl = document.activeElement;
  if (!(activeEl instanceof HTMLElement)) return;
  const dialogEl = activeEl.closest("[role='dialog']");
  if (!(dialogEl instanceof HTMLElement)) return;

  let scroller: HTMLElement | null = activeEl.parentElement;
  while (scroller && scroller !== dialogEl) {
    if (scroller.scrollHeight > scroller.clientHeight) {
      break;
    }
    scroller = scroller.parentElement;
  }
  const targetScroller = scroller ?? dialogEl;
  if (targetScroller.scrollHeight <= targetScroller.clientHeight) return;

  const elRect = activeEl.getBoundingClientRect();
  const scrollerRect = targetScroller.getBoundingClientRect();
  const topMargin = 44;
  const bottomMargin = 28;

  if (elRect.bottom + bottomMargin > scrollerRect.bottom) {
    targetScroller.scrollTop += elRect.bottom + bottomMargin - scrollerRect.bottom;
  } else if (elRect.top - topMargin < scrollerRect.top) {
    targetScroller.scrollTop -= scrollerRect.top - (elRect.top - topMargin);
  }
}

function handleOpenChange(isOpen: boolean) {
  if (isOpen) {
    nextTick().then(startTracking);
  } else {
    stopTracking();
  }
}

watch(visibleHeight, (newHeight, oldHeight) => {
  if (newHeight < oldHeight) {
    nextTick().then(scrollFocusedInputIntoView);
  }
});

// Ensure keyboard tracking starts when programmatic opens occur (v-model updates from parent)
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen !== undefined) {
      handleOpenChange(isOpen);
    }
  },
  { immediate: true },
);
</script>

<template>
  <DialogRoot v-bind="forwarded" @update:open="handleOpenChange">
    <slot name="trigger" />
    <DialogPortal>
      <DialogOverlay v-if="!hideOverlay" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <DialogContent 
        :class="cn(
          'fixed left-0 right-0 z-50 flex flex-col gap-4 rounded-t-[2.5rem] border-t border-white/5 bg-background/95 backdrop-blur-xl p-6 sm:p-8 pb-sheet shadow-2xl data-[state=open]:animate-slide-in-from-bottom data-[state=closed]:animate-slide-out-to-bottom outline-none overflow-y-auto no-scrollbar',
          props.contentClass
        )"
        :style="dialogStyle"
        @focusin="() => nextTick().then(scrollFocusedInputIntoView)"
        @close-auto-focus="(e: Event) => e.preventDefault()"
      >
        
        <DialogDescription class="sr-only">{{ title ?? 'Dialog' }}</DialogDescription>

        <slot name="header">
          <div class="flex items-center justify-between mb-2">
            <DialogTitle v-if="title" class="text-2xl font-bold tracking-tight">
              {{ title }}
            </DialogTitle>
            <div v-else class="flex-1" />
            
            <DialogClose :class="uiIconButtonClass">
              <X class="w-5 h-5 text-muted-foreground" />
              <span class="sr-only">Close</span>
            </DialogClose>
          </div>
        </slot>
        
        <slot />
        
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
