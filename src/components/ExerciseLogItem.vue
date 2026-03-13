<script setup lang="ts">
import { usePointerSwipe } from "@vueuse/core";
import { Trash } from "lucide-vue-next";
import { ref } from "vue";
import type { ExerciseLog } from "@/services/exerciseLogs";

const props = defineProps<{
  log: ExerciseLog;
}>();

const emit = defineEmits<(e: "delete", log: ExerciseLog) => void>();

const itemRef = ref<HTMLElement | null>(null);
const { distanceX, isSwiping } = usePointerSwipe(itemRef, {
  onSwipeEnd(e, direction) {
    if (direction === "left" && distanceX.value > 80) {
      emit("delete", props.log);
    }
  },
});
</script>

<template>
  <div class="relative w-full overflow-hidden rounded-2xl bg-destructive/20 border border-destructive/20">
    <!-- Background delete action -->
    <div class="absolute inset-y-0 right-0 flex items-center justify-end px-6 text-destructive">
      <Trash class="w-6 h-6" />
    </div>
    
    <!-- Foreground content -->
    <div 
      ref="itemRef"
      class="relative w-full bg-card/80 backdrop-blur-md p-5 rounded-2xl border border-white/5 shadow-sm transition-transform touch-pan-y"
      :style="{ transform: isSwiping && distanceX > 0 ? `translateX(-${distanceX}px)` : '' }"
    >
      <div class="flex justify-between items-start mb-2">
        <h3 class="font-bold text-lg text-foreground tracking-tight">{{ log.exerciseName }}</h3>
      </div>
      <div class="flex flex-wrap gap-4 text-sm text-muted-foreground font-semibold">
        <span v-if="log.weight" class="text-primary">{{ log.weight }} kg</span>
        <span v-if="log.reps">{{ log.reps }} reps</span>
        <span v-if="log.distance">{{ log.distance }} m</span>
        <span v-if="log.duration">{{ log.duration }} min</span>
      </div>
    </div>
  </div>
</template>
