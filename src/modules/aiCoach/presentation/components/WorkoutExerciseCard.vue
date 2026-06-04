<script setup lang="ts">
import { ChevronRight, Play, RotateCcw, Search, Square } from "@lucide/vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
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

const isDurationExercise = computed(() => isDuration(props.exercise.targetReps));

const parsedDurationSeconds = computed(() => {
  if (!isDurationExercise.value || !props.exercise.targetReps) return 0;
  const repsInfo = splitReps(props.exercise.targetReps);
  const val = parseInt(repsInfo.value, 10);
  if (Number.isNaN(val)) return 0;

  const unit = (repsInfo.unit || "").toLowerCase();
  if (unit.includes("min")) return val * 60;
  return val;
});

const timerRemaining = ref(0);
const isTimerRunning = ref(false);
let timerInterval: ReturnType<typeof setInterval> | null = null;
let endTime = 0;
let lastTickRemaining = 0;

watch(
  parsedDurationSeconds,
  (newVal) => {
    if (!isTimerRunning.value && timerRemaining.value === 0) {
      timerRemaining.value = newVal;
    }
  },
  { immediate: true },
);

function toggleTimer() {
  if (isTimerRunning.value) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  if (timerRemaining.value <= 0) {
    timerRemaining.value = parsedDurationSeconds.value;
  }
  isTimerRunning.value = true;
  endTime = Date.now() + timerRemaining.value * 1000;
  lastTickRemaining = timerRemaining.value;

  timerInterval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    if (remaining !== lastTickRemaining) {
      lastTickRemaining = remaining;
      timerRemaining.value = remaining;
      if (remaining <= 0) {
        pauseTimer();
        import("ios-haptics").then(({ haptic }) => haptic.confirm()).catch(() => {});
      }
    }
  }, 200);
}

function pauseTimer() {
  isTimerRunning.value = false;
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function resetTimer() {
  pauseTimer();
  timerRemaining.value = parsedDurationSeconds.value;
}

onBeforeUnmount(() => {
  if (timerInterval) clearInterval(timerInterval);
});

const timerFormatted = computed(() => {
  const m = Math.floor(timerRemaining.value / 60);
  const s = timerRemaining.value % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
});

const timerProgressPercent = computed(() => {
  if (parsedDurationSeconds.value === 0) return 0;
  return 100 - (timerRemaining.value / parsedDurationSeconds.value) * 100;
});
</script>

<template>
  <UiCard
    as="div"
    role="button"
    :aria-disabled="isCompleted"
    :tabindex="isCompleted ? undefined : 0"
    @click="!isCompleted && emit('log', exercise)"
    @keydown.enter="!isCompleted && emit('log', exercise)"
    @keydown.space.prevent="!isCompleted && emit('log', exercise)"
    :class="[
      'relative w-full text-left p-4 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary duration-200 transition-all shadow-sm',
      isHighlighted ? 'border-primary/40 bg-primary/[0.02]' : 'border-border/40',
      isCompleted
        ? 'opacity-50 cursor-not-allowed pointer-events-none'
        : 'hover:bg-white/5 active:scale-95 cursor-pointer',
    ]"
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
          <button
            @click.stop="emit('search', exercise.exerciseName)"
            class="ml-2 rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95 flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Search images"
            title="Images"
          >
            <Search class="w-3.5 h-3.5 text-primary" />
          </button>
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
      
      <!-- Duration Timer Component -->
      <div 
        v-if="isDurationExercise && !isCompleted" 
        class="mt-1 w-full rounded-xl border p-3 flex items-center justify-between gap-3 bg-primary/[0.02] border-primary/20 shadow-sm transition-colors duration-300"
        :class="isTimerRunning ? 'border-primary/40 bg-primary/[0.04]' : ''"
      >
        <div class="flex items-center gap-3 min-w-0">
          <div class="relative w-12 h-12 shrink-0 flex items-center justify-center">
            <svg class="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
             <circle cx="50" cy="50" r="45" class="stroke-muted/20" stroke-width="8" fill="none" />
             <circle
              cx="50"
              cy="50"
              r="45"
              class="transition-all duration-1000 ease-linear stroke-primary"
              stroke-width="8"
              fill="none"
              stroke-linecap="round"
              :stroke-dasharray="283"
              :stroke-dashoffset="283 - (283 * Math.max(0, 100 - timerProgressPercent)) / 100"
             />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
             <span class="text-xs font-bold tabular-nums tracking-tight text-primary">
              {{ timerFormatted }}
             </span>
            </div>
          </div>
          
          <div class="flex flex-col min-w-0 gap-0.5">
            <span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 leading-none">Exercise Timer</span>
            <span class="text-sm font-bold text-foreground truncate mt-0.5 transition-colors duration-300" :class="isTimerRunning ? 'text-primary' : ''">
              {{ isTimerRunning ? 'In Progress' : (timerRemaining > 0 && timerRemaining < parsedDurationSeconds ? 'Paused' : 'Ready') }}
            </span>
          </div>
        </div>
        
        <div class="flex items-center gap-2 shrink-0">
          <button
            v-if="timerRemaining < parsedDurationSeconds && !isTimerRunning"
            @click.stop="resetTimer"
            class="h-10 w-10 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-foreground transition-colors cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Reset Timer"
          >
            <RotateCcw class="w-4 h-4" />
          </button>
          <button 
            @click.stop="toggleTimer"
            class="h-10 w-10 rounded-full flex items-center justify-center transition-colors cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            :class="isTimerRunning ? 'bg-destructive/10 text-destructive hover:bg-destructive/20' : 'bg-primary/10 text-primary hover:bg-primary/20'"
            :aria-label="isTimerRunning ? 'Pause Timer' : 'Start Timer'"
          >
            <Play v-if="!isTimerRunning" class="w-4 h-4 ml-0.5" fill="currentColor" />
            <Square v-else class="w-4 h-4" fill="currentColor" />
          </button>
        </div>
      </div>
    </div>
  </UiCard>
</template>

