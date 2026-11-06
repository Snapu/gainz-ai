<script setup lang="ts">
import { cva, type VariantProps } from "class-variance-authority";
import { hapticTrigger } from "ios-haptics";
import { type ComponentPublicInstance, type HTMLAttributes, ref, watchEffect } from "vue";
import { cn } from "@/shared/presentation/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm active:scale-95",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm active:scale-95",
        outline:
          "border border-white/10 bg-transparent hover:bg-white/5 hover:border-white/20 active:scale-95 hover:text-foreground",
        secondary:
          "bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 text-foreground active:scale-95 shadow-sm",
        ghost: "hover:bg-white/5 hover:text-foreground active:scale-95",
        link: "text-primary underline-offset-4 hover:underline flex",
      },
      size: {
        default: "h-14 px-6 py-3 text-base",
        sm: "h-10 rounded-lg px-4 text-sm",
        xs: "h-8 rounded-lg px-3 text-xs",
        lg: "h-16 rounded-xl px-6 text-lg",
        icon: "h-10 w-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonVariants = VariantProps<typeof buttonVariants>;

interface Props {
  variant?: ButtonVariants["variant"];
  size?: ButtonVariants["size"];
  type?: "button" | "submit" | "reset";
  class?: HTMLAttributes["class"];
  haptic?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  type: "button",
  haptic: false,
});

const buttonRef = ref<HTMLButtonElement | null>(null);

watchEffect(() => {
  if (props.haptic && buttonRef.value) {
    hapticTrigger(buttonRef.value);
  }
});

function setButtonRef(el: Element | ComponentPublicInstance | null) {
  buttonRef.value = el instanceof HTMLButtonElement ? el : null;
}
</script>

<template>
  <button
    :ref="setButtonRef"
    :type="props.type"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <slot />
  </button>
</template>
