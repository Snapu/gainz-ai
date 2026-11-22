<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from "reka-ui";
import type { HTMLAttributes } from "vue";
import { cn } from "@/shared/presentation/lib/utils";

const props = withDefaults(
  defineProps<{
    align?: "start" | "center" | "end";
    sideOffset?: number;
    collisionPadding?: number | Partial<Record<"top" | "right" | "bottom" | "left", number>>;
    class?: HTMLAttributes["class"];
  }>(),
  {
    align: "end",
    sideOffset: 8,
    collisionPadding: 16,
  },
);
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        :align="props.align"
        :side-offset="props.sideOffset"
        :collision-padding="props.collisionPadding"
        :class="cn(
          'z-50 min-w-[12rem] max-h-[var(--reka-dropdown-menu-content-available-height,calc(100dvh-2rem))] overflow-x-hidden overflow-y-auto overscroll-y-contain no-scrollbar rounded-xl border border-white/10 bg-background/95 p-2 text-foreground shadow-lg backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200',
          props.class,
        )"
      >
        <slot />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
