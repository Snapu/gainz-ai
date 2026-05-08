<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps<{
  align?: "start" | "center" | "end";
}>();
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        :align="align || 'end'"
        :side-offset="8"
        :class="cn(
          'z-50 min-w-[12rem] overflow-hidden rounded-xl border border-white/10 bg-background/95 p-2 text-foreground shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200',
        )"
      >
        <slot />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
