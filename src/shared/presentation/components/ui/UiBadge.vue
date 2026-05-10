<script setup lang="ts">
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/shared/presentation/lib/utils";
import { badgeVariants } from "./styles";

type BadgeVariants = VariantProps<typeof badgeVariants>;

interface Props {
  variant?: BadgeVariants["variant"];
  class?: any;
}

const props = withDefaults(defineProps<Props>(), {
  variant: "default",
});
</script>

<template>
  <div :class="cn(badgeVariants({ variant }), props.class)">
    <slot />
  </div>
</template>
