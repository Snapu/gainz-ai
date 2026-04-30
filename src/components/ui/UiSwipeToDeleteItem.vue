<script setup lang="ts">
import { Trash } from "lucide-vue-next";
import UiSwipeableItem from "./UiSwipeableItem.vue";

const props = withDefaults(defineProps<{ variant?: "card" | "inset" }>(), { variant: "card" });
const emit = defineEmits<(e: "delete") => void>();
</script>

<template>
  <UiSwipeableItem :variant="props.variant" @action="emit('delete')">
    <template #background>
      <Trash class="w-5 h-5 text-destructive" />
    </template>
    <slot />
  </UiSwipeableItem>
</template>
