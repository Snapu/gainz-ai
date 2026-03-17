<script setup lang="ts">
import SwipeToDeleteItem from "@/components/ui/SwipeToDeleteItem.vue";
import type { ExerciseLog } from "@/services/exerciseLogs";

const props = defineProps<{
  log: ExerciseLog;
}>();

const emit = defineEmits<(e: "delete", log: ExerciseLog) => void>();
</script>

<template>
  <SwipeToDeleteItem @delete="emit('delete', props.log)">
    <div class="flex justify-between items-center">
      <h3 class="font-bold text-sm text-foreground tracking-tight">{{ log.exerciseName }}</h3>
      <div class="flex gap-3 text-xs text-muted-foreground font-semibold">
        <span v-if="log.weight" class="text-primary">{{ log.weight }}<span class="text-[10px] opacity-70 ml-0.5">kg</span></span>
        <span v-if="log.reps">{{ log.reps }}<span class="text-[10px] opacity-70 ml-0.5">reps</span></span>
        <span v-if="log.distance">{{ log.distance }}<span class="text-[10px] opacity-70 ml-0.5">m</span></span>
        <span v-if="log.duration">{{ log.duration }}<span class="text-[10px] opacity-70 ml-0.5">min</span></span>
      </div>
    </div>
  </SwipeToDeleteItem>
</template>
