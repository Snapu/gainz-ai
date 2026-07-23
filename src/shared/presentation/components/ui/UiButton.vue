<script setup lang="ts">
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/presentation/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg active:scale-95",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg active:scale-95",
        outline:
          "border-2 border-border bg-transparent hover:bg-accent hover:border-accent active:scale-95 hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-95",
        ghost: "hover:bg-accent hover:text-accent-foreground active:scale-95",
        link: "text-primary underline-offset-4 hover:underline flex",
      },
      size: {
        default: "h-14 px-6 py-3 text-base",
        sm: "h-10 rounded-lg px-4 text-sm",
        xs: "h-8 rounded-lg px-3 text-xs",
        lg: "h-16 rounded-xl px-6 text-lg",
        icon: "h-14 w-14",
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
  class?: any;
}

const props = withDefaults(defineProps<Props>(), {
  type: "button",
});
</script>

<template>
  <button :type="props.type" :class="cn(buttonVariants({ variant, size }), props.class)">
    <slot />
  </button>
</template>
