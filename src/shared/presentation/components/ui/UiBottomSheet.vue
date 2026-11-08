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
import { useKeyboard } from "@/shared/presentation/composables/useKeyboard";
import { useKeyboardHeight } from "@/shared/presentation/composables/useKeyboardHeight";
import { cn } from "@/shared/presentation/lib/utils";

const props = defineProps<
  DialogRootProps & {
    title?: string;
    subtitle?: string;
    titleClass?: HTMLAttributes["class"];
    headerBorder?: boolean;
    contentClass?: HTMLAttributes["class"];
    footerClass?: HTMLAttributes["class"];
    contentStyle?: CSSProperties;
    hideOverlay?: boolean;
  }
>();
const emits = defineEmits<DialogRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);

// Global Keyboard Handling
const { keyboardHeight, visibleHeight, startTracking, stopTracking } = useKeyboardHeight();
const { isKeyboardVisible } = useKeyboard();

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
          'fixed left-0 right-0 z-50 flex flex-col p-0 gap-0 rounded-t-[2.5rem] border-t border-white/5 bg-background/95 backdrop-blur-xl shadow-2xl data-[state=open]:animate-slide-in-from-bottom data-[state=closed]:animate-slide-out-to-bottom outline-none overflow-y-auto no-scrollbar',
          props.contentClass
        )"
        :style="dialogStyle"
        @focusin="() => nextTick().then(scrollFocusedInputIntoView)"
        @close-auto-focus="(e: Event) => e.preventDefault()"
      >
        
        <DialogDescription class="sr-only">{{ title ?? 'Dialog' }}</DialogDescription>

        <slot name="header">
          <div
            :class="cn(
              'flex items-center justify-between gap-3 px-6 shrink-0',
              isKeyboardVisible ? 'pt-3' : 'pt-6',
              headerBorder
                ? 'pb-4 border-b border-white/5 bg-background/95 backdrop-blur-xl z-10 sticky top-0'
                : 'pb-2'
            )"
          >
            <div class="min-w-0 flex-1">
              <DialogTitle
                :class="
                  title || $slots.title
                    ? cn('text-2xl font-bold tracking-tight text-foreground', props.titleClass)
                    : 'sr-only'
                "
              >
                <slot name="title">{{ title ?? "Dialog" }}</slot>
              </DialogTitle>
              <p v-if="subtitle" class="text-xs text-muted-foreground mt-0.5">
                {{ subtitle }}
              </p>
            </div>
            <slot name="header-actions" />
            <DialogClose :class="uiIconButtonClass">
              <X class="w-5 h-5 text-muted-foreground" />
              <span class="sr-only">Close</span>
            </DialogClose>
          </div>
        </slot>
        
        <slot />

        <div
          v-if="$slots.footer"
          :class="cn(
            'px-6 pt-3 shrink-0 bg-background/95 backdrop-blur z-10 border-t border-white/5',
            isKeyboardVisible ? 'pb-3' : 'pb-safe',
            props.footerClass
          )"
        >
          <div :class="isKeyboardVisible ? '' : 'mb-4'">
            <slot name="footer" />
          </div>
        </div>
        
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
