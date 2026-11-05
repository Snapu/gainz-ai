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
import type { CSSProperties, HTMLAttributes } from "vue";
import { uiIconButtonClass } from "@/shared/presentation/components/ui/styles";
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
</script>

<template>
  <DialogRoot v-bind="forwarded">
    <slot name="trigger" />
    <DialogPortal>
      <DialogOverlay v-if="!hideOverlay" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <DialogContent 
        :class="cn(
          'fixed bottom-0 left-0 right-0 z-50 flex max-h-[90vh] max-h-[90dvh] flex-col gap-4 rounded-t-[2.5rem] border-t border-white/5 bg-background/95 backdrop-blur-xl p-6 sm:p-8 pb-sheet shadow-2xl data-[state=open]:animate-slide-in-from-bottom data-[state=closed]:animate-slide-out-to-bottom outline-none overflow-y-auto no-scrollbar',
          props.contentClass
        )"
        :style="props.contentStyle"
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
