<script setup lang="ts">
import { Trash } from "lucide-vue-next";
import SwipeableItem from "./SwipeableItem.vue";

const emit = defineEmits<(e: "delete") => void>();
</script>

<template>
  <SwipeableItem @action="emit('delete')">
    <template #background>
      <Trash class="w-5 h-5 text-destructive" />
    </template>
    <slot />
  </SwipeableItem>
</template>
