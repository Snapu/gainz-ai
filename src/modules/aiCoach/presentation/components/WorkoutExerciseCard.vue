<script setup lang="ts">
import { ChevronRight, Search } from "@lucide/vue";
import { uiChevronCircleClass } from "@/shared/presentation/components/ui/styles";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import type { DisplayExercise } from "../helpers/aiCoachPageHelpers";
import {
  isDuration,
  setSegments,
  splitReps,
  splitWeight,
  titleClass,
} from "../helpers/aiCoachPageHelpers";

interface ExerciseProgress {
  done: number;
  isCompleted: boolean;
  progressPercent: number;
}

const props = defineProps<{
  exercise: DisplayExercise;
  isCompleted: boolean;
  isHighlighted: boolean;
  progress: ExerciseProgress;
  /** Used as `h3` for standalone exercises, `h4` for exercises inside a superset group. */
  headingLevel?: "h3" | "h4";
}>();

const emit = defineEmits<{
  (e: "log", exercise: DisplayExercise): void;
  (e: "search", exerciseName: string): void;
}>();
</script>

<template>
  <UiCard
    as="button"
    @click="!isCompleted && emit('log', exercise)"
    :class="[
      'relative w-full text-left p-4 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary duration-200 transition-all shadow-sm',
      isHighlighted ? 'border-primary/40 bg-primary/[0.02]' : 'border-border/40',
      isCompleted
        ? 'opacity-60 cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed'
        : 'hover:bg-white/5 active:scale-95 cursor-pointer',
    ]"
    :disabled="isCompleted"
  >
    <!-- Animated highlight layer -->
    <div v-if="isHighlighted" class="absolute inset-0 rounded-xl border-2 border-primary/60 ring-4 ring-primary/20 animate-pulse pointer-events-none" />

    <div class="relative flex flex-col gap-4 w-full z-10">
      <!-- Title row -->
      <div class="flex items-start justify-between gap-3 w-full">
        <div class="flex items-center gap-2 min-w-0 pr-4">
          <component
            :is="headingLevel ?? 'h3'"
            :class="titleClass(isCompleted)"
          >
            {{ exercise.exerciseName }}
          </component>
          <span
            @click.stop="emit('search', exercise.exerciseName)"
            class="ml-2 rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95 flex items-center justify-center cursor-pointer shrink-0"
            tabindex="0"
            aria-label="Search images"
            title="Images"
          >
            <Search class="w-3.5 h-3.5 text-primary" />
          </span>
        </div>
      </div>

      <!-- Coach notes (only shown when highlighted) -->
      <div
        v-if="exercise.notes && isHighlighted"
        class="text-xs text-muted-foreground font-medium italic leading-relaxed bg-muted/10 border border-muted/10 px-3 py-2 rounded-xl w-full"
      >
        <span>{{ exercise.notes }}</span>
      </div>

      <!-- Metrics Dashboard Grid & Action -->
      <div class="flex items-end justify-between w-full gap-4">
        <!-- 3-Column Micro-grid -->
        <div class="grid grid-cols-3 gap-3 flex-1">
          <!-- Sets × Reps/Duration -->
          <div class="flex flex-col gap-0.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              {{ isDuration(exercise.targetReps) ? 'Sets × Duration' : 'Sets × Reps' }}
            </span>
            <div class="flex items-baseline">
              <span class="text-lg font-bold tabular-nums text-foreground">{{ exercise.targetSets }}</span>
              <span class="text-xs font-medium text-muted-foreground/50 mx-1">×</span>
              <span class="text-lg font-bold tabular-nums text-foreground">{{ splitReps(exercise.targetReps).value }}</span>
              <span v-if="splitReps(exercise.targetReps).unit" class="text-xs font-medium text-muted-foreground/50 ml-0.5">
                {{ splitReps(exercise.targetReps).unit }}
              </span>
            </div>
          </div>
          
          <!-- Weight -->
          <div v-if="exercise.targetWeight" class="flex flex-col gap-0.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Weight</span>
            <div class="flex items-baseline">
              <span class="text-lg font-bold tabular-nums text-primary/90">{{ splitWeight(exercise.targetWeight).value }}</span>
              <span class="text-xs font-medium text-muted-foreground/50 ml-0.5">{{ splitWeight(exercise.targetWeight).unit }}</span>
            </div>
          </div>
          <div v-else class="flex flex-col gap-0.5 opacity-0 pointer-events-none select-none">
             <!-- Placeholder to keep grid stable -->
             <span class="text-xs font-semibold">Weight</span>
             <span class="text-lg font-bold">0</span>
          </div>
          
          <!-- RPE -->
          <div v-if="exercise.targetRpe" class="flex flex-col gap-0.5">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">RPE</span>
            <div class="flex items-baseline">
              <span class="text-lg font-bold tabular-nums text-amber-500/90">{{ exercise.targetRpe }}</span>
            </div>
          </div>
          <div v-else class="flex flex-col gap-0.5 opacity-0 pointer-events-none select-none">
             <!-- Placeholder to keep grid stable -->
             <span class="text-xs font-semibold">RPE</span>
             <span class="text-lg font-bold">0</span>
          </div>
        </div>

        <!-- Action Chevron -->
        <div :class="[uiChevronCircleClass, 'group-hover:bg-primary/10 group-hover:text-primary']">
          <ChevronRight class="w-4 h-4" />
        </div>
      </div>
      
      <!-- Segmented set progress bar -->
      <div v-if="!isCompleted" class="w-full pt-1 flex gap-1.5">
        <div
          v-for="(_, i) in setSegments(exercise.targetSets)"
          :key="i"
          class="flex-1 h-1.5 rounded-full overflow-hidden bg-muted/20"
        >
          <div :class="i < progress.done ? 'bg-primary h-full' : 'bg-transparent h-full'" />
        </div>
      </div>
    </div>
  </UiCard>
</template>

