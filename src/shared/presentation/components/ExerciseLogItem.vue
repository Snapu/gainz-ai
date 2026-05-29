<script setup lang="ts">
import type { ExerciseLog } from "@/modules/trainingLogs/presentation";
import UiSwipeToDeleteItem from "@/shared/presentation/components/ui/UiSwipeToDeleteItem.vue";

const props = defineProps<{
  log: ExerciseLog;
  variant?: "card" | "inset";
}>();

const emit = defineEmits<{
  (e: "delete", log: ExerciseLog): void;
  (e: "edit", log: ExerciseLog): void;
}>();
</script>

<template>
  <UiSwipeToDeleteItem :variant="props.variant ?? 'card'" @delete="emit('delete', props.log)">
    <div 
      class="flex justify-between items-center w-full cursor-pointer transition-opacity active:opacity-70"
      @click="emit('edit', props.log)"
    >
      <h3 class="font-semibold text-sm text-foreground tracking-tight leading-none">{{ log.exerciseName }}</h3>
      <div class="flex gap-4 items-center">
        <div v-if="log.weight" class="flex items-baseline gap-0.5">
           <span class="text-sm font-bold text-primary">{{ log.weight }}</span>
           <span class="text-xs uppercase font-semibold text-muted-foreground tracking-wider">kg</span>
        </div>
        <div v-if="log.reps" class="flex items-baseline gap-0.5">
           <span class="text-sm font-bold text-foreground">{{ log.reps }}</span>
           <span class="text-xs uppercase font-semibold text-muted-foreground tracking-wider">reps</span>
        </div>
        <div v-if="log.distance" class="flex items-baseline gap-0.5">
           <span class="text-sm font-bold text-foreground">{{ log.distance }}</span>
           <span class="text-xs uppercase font-semibold text-muted-foreground tracking-wider">m</span>
        </div>
        <div v-if="log.duration" class="flex items-baseline gap-0.5">
           <span class="text-sm font-bold text-foreground">{{ log.duration }}</span>
           <span class="text-xs uppercase font-semibold text-muted-foreground tracking-wider">min</span>
        </div>
      </div>
    </div>
  </UiSwipeToDeleteItem>
</template>
