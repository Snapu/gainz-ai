<script setup lang="ts">
import { cva, type VariantProps } from "class-variance-authority";
import { ToggleGroupItem, type ToggleGroupItemProps } from "reka-ui";
import { cn } from "@/lib/utils";

const toggleGroupItemVariants = cva(
  "flex items-center w-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95",
  {
    variants: {
      variant: {
        default:
          "justify-between rounded-xl border-2 border-border/40 bg-card/50 text-card-foreground shadow-sm hover:border-primary/50 hover:bg-card data-[state=on]:bg-primary/10 data-[state=on]:border-primary data-[state=on]:text-white data-[state=on]:shadow-lg data-[state=on]:shadow-lg/20",
        ghost:
          "justify-center rounded-xl border border-white/5 bg-white/5 font-bold hover:bg-white/10 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
      },
      size: {
        default: "px-5 py-4",
        sm: "h-12 px-4 py-0 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ToggleGroupItemVariants = VariantProps<typeof toggleGroupItemVariants>;

interface Props extends Omit<ToggleGroupItemProps, "value"> {
  // Accept string or number values for ToggleGroupItem
  value?: string | number;
  variant?: ToggleGroupItemVariants["variant"];
  size?: ToggleGroupItemVariants["size"];
  class?: any;
}

const props = defineProps<Props>();
</script>

<template>
  <ToggleGroupItem
    v-bind="props"
    :value="props.value == null ? '' : String(props.value)"
    :class="cn(toggleGroupItemVariants({ variant, size }), props.class)"
  >
    <slot />
  </ToggleGroupItem>
</template>
