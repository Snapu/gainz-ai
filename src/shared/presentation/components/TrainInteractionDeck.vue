<script setup lang="ts">
import { ArrowLeftRight, Play, Plus, RotateCcw, SkipForward } from "@lucide/vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiRadialProgress from "@/shared/presentation/components/ui/UiRadialProgress.vue";

interface DeckExercise {
  exerciseName: string;
  targetSets: number;
  targetReps?: string;
  targetDurationSeconds?: number;
  targetWeight?: string;
  targetRpe?: number;
  targetDistanceMeters?: number;
}

interface DeckProgress {
  done: number;
  isCompleted: boolean;
}

const props = defineProps<{
  currentExercise?: DeckExercise | null;
  currentProgress?: DeckProgress | null;
  supersetAlternatives?: DeckExercise[];
  isResting: boolean;
  restFormattedTime: string;
  isOvertime?: boolean;
  targetRestSeconds?: number | null;
  restElapsed?: number;
  isWorkoutComplete?: boolean;
  isRestDay?: boolean;
}>();

const emit = defineEmits<{
  (e: "logCurrent"): void;
  (e: "logCustom"): void;
  (e: "skipRest"): void;
  (e: "selectSupersetExercise", exerciseName: string): void;
}>();

// --- Exercise Duration Timer Logic ---
const isDurationExercise = computed(() => {
  return props.currentExercise?.targetDurationSeconds != null;
});

const parsedDurationSeconds = computed(() => {
  return props.currentExercise?.targetDurationSeconds ?? 0;
});

const timerRemaining = ref(0);
const isTimerRunning = ref(false);
let timerInterval: ReturnType<typeof setInterval> | null = null;
let endTime = 0;
let lastTickRemaining = 0;

watch(
  parsedDurationSeconds,
  (newVal, oldVal) => {
    if (!isTimerRunning.value && (timerRemaining.value === 0 || timerRemaining.value === oldVal)) {
      timerRemaining.value = newVal;
    }
  },
  { immediate: true },
);

// Reset exercise timer when swiping to another exercise or logging a set
watch([() => props.currentExercise?.exerciseName, () => props.currentProgress?.done], resetTimer);

// Reset exercise timer when resting begins (set was logged)
watch(
  () => props.isResting,
  (resting) => {
    if (resting) resetTimer();
  },
);

const isTimerActiveOrDirty = computed(() => {
  return isTimerRunning.value || timerRemaining.value < parsedDurationSeconds.value;
});

function toggleTimer() {
  if (isTimerActiveOrDirty.value) {
    resetTimer();
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

const isSkippingRest = ref(false);

function handleSkipRest() {
  if (isSkippingRest.value) return;
  isSkippingRest.value = true;
  emit("skipRest");
  setTimeout(() => {
    isSkippingRest.value = false;
  }, 300);
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

const currentSetNumber = computed(() => {
  return (props.currentProgress?.done ?? 0) + 1;
});

const exerciseActionLabel = computed(() => {
  if (!props.currentExercise) return "";
  const prefix = props.currentProgress?.isCompleted ? "Log extra" : "Log";
  return `${prefix} ${props.currentExercise.exerciseName}`;
});

const restProgressPercent = computed(() => {
  if (!props.targetRestSeconds || props.targetRestSeconds <= 0) return 0;
  if (props.isOvertime) return 0;
  const elapsed = props.restElapsed ?? 0;
  return Math.min(100, Math.max(0, (elapsed / props.targetRestSeconds) * 100));
});

const emptyOrCompleteLabel = computed(() => {
  if (props.isWorkoutComplete) return "Workout Complete";
  if (props.isRestDay) return "Rest Day";
  return "No Active Workout";
});
</script>

<template>
  <div class="shrink-0 border-t border-white/5 bg-background/95 backdrop-blur-xl px-4 py-3 z-20 transition-all duration-200">
    <div class="w-full max-w-2xl mx-auto flex flex-col gap-3">
      
      <!-- Tier 1: Action Chips / Modifiers (Sized identically to CoachTab Quick Prompts) -->
      <div
        v-if="!isWorkoutComplete && !isRestDay && Boolean(currentExercise)"
        class="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 w-full transition-all duration-200"
      >
        <!-- Superset Alternative Exercise Selector Chips -->
        <UiButton
          v-for="alt in supersetAlternatives"
          :key="alt.exerciseName"
          variant="chip"
          size="xs"
          data-testid="deck-superset-chip"
          class="shrink-0"
          @click="emit('selectSupersetExercise', alt.exerciseName)"
        >
          <ArrowLeftRight class="w-3.5 h-3.5 text-primary shrink-0" />
          <span>{{ alt.exerciseName }}</span>
        </UiButton>

        <!-- Arbitrary Exercise Button (Shown when not in a full-width completion/rest state) -->
        <UiButton
          variant="chip"
          size="xs"
          data-testid="deck-custom-exercise"
          class="shrink-0"
          @click="emit('logCustom')"
        >
          <Plus class="w-3.5 h-3.5 text-primary shrink-0" />
          <span>Log Custom Exercise</span>
        </UiButton>
      </div>

      <!-- Tier 2: Main Container (Visually matched to CoachTab Input Container) -->
      <div
        data-testid="deck-main-container"
        class="flex items-center justify-between gap-3 w-full min-h-[52px] rounded-xl border border-input/50 bg-white/5 pl-4 pr-1.5 py-1.5 shadow-sm backdrop-blur-md transition-all duration-200"
      >
        
        <!-- State A: Resting (Fixed Left Title + Right Timer & Action Cluster) -->
        <template v-if="isResting">
          <span class="text-sm font-bold text-foreground truncate min-w-0">
            {{ isWorkoutComplete ? 'Workout Complete' : (currentExercise ? exerciseActionLabel : 'Rest Timer') }}
          </span>

          <!-- Right Cluster: Radial Countdown Ring + Skip Icon Button + Primary Action -->
          <div class="flex items-center gap-2 shrink-0">
            <UiRadialProgress
              data-testid="deck-timer-ring"
              :size="40"
              :stroke-width="3.2"
              :progress="100 - restProgressPercent"
              track-class="text-white/10"
              :progress-class="isOvertime ? 'text-destructive stroke-destructive ease-linear' : 'text-primary stroke-primary ease-linear'"
            >
              <span
                class="text-micro font-black tabular-nums tracking-tight"
                :class="isOvertime ? 'text-destructive' : 'text-primary'"
              >
                {{ restFormattedTime }}
              </span>
            </UiRadialProgress>

            <UiButton
              v-if="!isWorkoutComplete"
              variant="secondary"
              size="icon"
              data-testid="deck-skip-rest"
              aria-label="Skip Rest"
              @click="handleSkipRest"
            >
              <SkipForward class="w-4 h-4" />
            </UiButton>

            <UiButton
              type="button"
              data-testid="deck-primary-action"
              size="icon"
              variant="default"
              class="h-10 w-10 rounded-full active:scale-95 transition-all shadow-sm shrink-0"
              :aria-label="isWorkoutComplete ? 'Finish Rest' : `Log Set ${currentSetNumber}`"
              @click="isWorkoutComplete ? handleSkipRest() : emit('logCurrent')"
            >
              <SkipForward v-if="isWorkoutComplete" class="w-5 h-5" />
              <Plus v-else class="w-5 h-5" />
            </UiButton>
          </div>
        </template>

        <!-- State D / F / G: Whole Workout Complete, Rest Day, or No Active Workout -->
        <template v-else-if="isWorkoutComplete || isRestDay || !currentExercise">
          <span class="text-sm font-bold text-foreground truncate min-w-0">
            {{ emptyOrCompleteLabel }}
          </span>

          <UiButton
            type="button"
            data-testid="deck-log-exercise"
            size="icon"
            variant="default"
            class="h-10 w-10 rounded-full active:scale-95 transition-all shadow-sm shrink-0"
            aria-label="Log Exercise"
            @click="emit('logCustom')"
          >
            <Plus class="w-5 h-5" />
          </UiButton>
        </template>

        <!-- State E: Single Exercise Completed (when other exercises remain in workout) -->
        <template v-else-if="currentProgress?.isCompleted">
          <span class="text-sm font-bold text-foreground truncate min-w-0">
            {{ exerciseActionLabel }}
          </span>

          <UiButton
            type="button"
            data-testid="deck-primary-action"
            size="icon"
            variant="default"
            class="h-10 w-10 rounded-full active:scale-95 transition-all shadow-sm shrink-0"
            aria-label="Add Extra Set"
            @click="emit('logCurrent')"
          >
            <Plus class="w-5 h-5" />
          </UiButton>
        </template>

        <!-- State B: Timed Exercise (Fixed Left Title + Right Timer & Action Cluster) -->
        <template v-else-if="isDurationExercise">
          <span class="text-sm font-bold text-foreground truncate min-w-0">
            {{ exerciseActionLabel }}
          </span>

          <!-- Right Cluster: Radial Countdown Ring + Play/Reset + Primary Action -->
          <div class="flex items-center gap-2 shrink-0">
            <UiRadialProgress
              data-testid="deck-timer-ring"
              :size="40"
              :stroke-width="3.2"
              :progress="100 - timerProgressPercent"
              track-class="text-white/10"
              :progress-class="isTimerRunning ? 'text-primary stroke-primary opacity-100 ease-linear' : 'text-primary stroke-primary opacity-40 ease-linear'"
            >
              <span
                class="text-micro font-black tabular-nums tracking-tight"
                :class="isTimerRunning ? 'text-primary' : 'text-foreground'"
              >
                {{ timerFormatted }}
              </span>
            </UiRadialProgress>

            <UiButton
              variant="secondary"
              size="icon"
              data-testid="deck-timer-toggle"
              :aria-label="isTimerActiveOrDirty ? 'Reset Timer' : 'Start Timer'"
              @click="toggleTimer"
            >
              <Play v-if="!isTimerActiveOrDirty" class="w-4 h-4 ml-0.5" fill="currentColor" />
              <RotateCcw v-else class="w-4 h-4" />
            </UiButton>

            <UiButton
              type="button"
              data-testid="deck-primary-action"
              size="icon"
              variant="default"
              class="h-10 w-10 rounded-full active:scale-95 transition-all shadow-sm shrink-0"
              :aria-label="`Log Set ${currentSetNumber}`"
              @click="emit('logCurrent')"
            >
              <Plus class="w-5 h-5" />
            </UiButton>
          </div>
        </template>

        <!-- State C: Standard Reps/Weight Lift -->
        <template v-else>
          <span class="text-sm font-bold text-foreground truncate min-w-0">
            {{ exerciseActionLabel }}
          </span>

          <UiButton
            type="button"
            data-testid="deck-primary-action"
            size="icon"
            variant="default"
            class="h-10 w-10 rounded-full active:scale-95 transition-all shadow-sm shrink-0"
            :aria-label="`Log Set ${currentSetNumber}`"
            @click="emit('logCurrent')"
          >
            <Plus class="w-5 h-5" />
          </UiButton>
        </template>

      </div>

    </div>
  </div>
</template>
