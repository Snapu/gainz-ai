<script setup lang="ts">
import { ChevronRight, Dumbbell, Gauge, Repeat, Search } from "@lucide/vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import type { DisplayExercise } from "../helpers/aiCoachPageHelpers";
import { setSegments, splitWeight, titleClass } from "../helpers/aiCoachPageHelpers";

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
      'relative w-full overflow-hidden text-left p-4 flex flex-col gap-3 border border-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary duration-200 transition-all',
      isHighlighted ? 'ring-2 ring-primary/20 border-primary' : '',
      isCompleted
        ? 'opacity-60 cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed'
        : 'hover:bg-white/5 active:scale-95 cursor-pointer',
    ]"
    :disabled="isCompleted"
  >
    <div class="flex flex-col gap-3 w-full">
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

      <!-- Metric badges + chevron -->
      <div class="flex items-center justify-between">
        <div class="flex flex-wrap items-center gap-2">
          <UiBadge
            variant="outline"
            class="gap-2 px-3 py-1 bg-muted/10 border-muted/10 text-xs text-foreground/90 shrink-0"
          >
            <Repeat class="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
            <span>
              <span class="text-lg font-bold tabular-nums">{{ exercise.targetSets }}</span>
              <span class="text-muted-foreground/50 font-medium mx-0.5">×</span>
              <span class="text-lg font-bold tabular-nums">{{ exercise.targetReps }}</span>
              <span class="text-muted-foreground/50 font-medium ml-1">reps</span>
            </span>
          </UiBadge>

          <UiBadge
            v-if="exercise.targetWeight"
            variant="outline"
            class="gap-2 px-3 py-1 bg-muted/10 border-muted/10 text-xs text-foreground/90 shrink-0"
          >
            <Dumbbell class="w-3.5 h-3.5 text-primary/70 shrink-0" />
            <span>
              <span class="text-lg font-bold tabular-nums">{{ splitWeight(exercise.targetWeight).value }}</span>
              <span class="text-muted-foreground/50 font-medium ml-0.5">
                {{ splitWeight(exercise.targetWeight).unit }}
              </span>
            </span>
          </UiBadge>

          <UiBadge
            v-if="exercise.targetRpe"
            variant="outline"
            class="gap-2 px-3 py-1 bg-muted/10 border-muted/10 text-xs text-foreground/90 shrink-0"
          >
            <Gauge class="w-3.5 h-3.5 text-amber-500/70 shrink-0" />
            <span>
              <span class="text-muted-foreground/50 font-medium mr-1">RPE</span>
              <span class="text-lg font-bold tabular-nums">{{ exercise.targetRpe }}</span>
            </span>
          </UiBadge>
        </div>

        <div class="flex items-center gap-2">
          <ChevronRight class="w-4 h-4 text-muted-foreground hover:text-primary transition-all duration-200 transform" />
        </div>
      </div>
    </div>

    <!-- Coach notes (only shown when highlighted) -->
    <div
      v-if="exercise.notes && isHighlighted"
      class="text-xs text-muted-foreground font-medium italic leading-relaxed bg-muted/10 border border-muted/10 px-3 py-2 rounded-xl w-full"
    >
      <span>{{ exercise.notes }}</span>
    </div>

    <!-- Segmented set progress bar -->
    <div v-if="!isCompleted" class="w-full mt-3 flex gap-1">
      <div
        v-for="(_, i) in setSegments(exercise.targetSets)"
        :key="i"
        class="flex-1 h-1 rounded-full overflow-hidden bg-muted/10"
      >
        <div :class="i < progress.done ? 'bg-primary h-full' : 'bg-muted/10 h-full'" />
      </div>
    </div>
  </UiCard>
</template>
