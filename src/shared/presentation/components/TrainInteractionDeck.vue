<script setup lang="ts">
import { ArrowLeftRight, Check, Play, Plus, RotateCcw, SkipForward } from "@lucide/vue";
import { useWakeLock } from "@vueuse/core";
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
const wakeLock = useWakeLock();
let isUnmounted = false;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let endTime = 0;
let lastTickRemaining = 0;

watch(isTimerRunning, (running) => {
  if (running) {
    void wakeLock
      .request("screen")
      .then(() => {
        if (!isTimerRunning.value || isUnmounted) {
          void wakeLock.release().catch(() => {});
        }
      })
      .catch(() => {
        // Silently degrade when Wake Lock is unsupported or denied (e.g. iOS Low Power Mode NotAllowedError)
      });
  } else {
    void wakeLock.release().catch(() => {});
  }
});

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
  isUnmounted = true;
  if (timerInterval) clearInterval(timerInterval);
  void wakeLock.release().catch(() => {});
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

const hasRestTarget = computed(() => {
  return (props.targetRestSeconds ?? 0) > 0;
});

const restRingProgress = computed(() => {
  if (props.isOvertime) return 100;
  if (!hasRestTarget.value) return 0;
  const elapsed = props.restElapsed ?? 0;
  return Math.min(100, Math.max(0, 100 - (elapsed / (props.targetRestSeconds ?? 1)) * 100));
});

const restRingTrackClass = computed(() => {
  if (props.isOvertime) return "text-red-500/20";
  if (!hasRestTarget.value) return "text-emerald-400/30";
  return "text-white/10";
});

const restRingProgressClass = computed(() => {
  if (props.isOvertime) return "text-red-400 stroke-red-400 animate-pulse ease-linear";
  if (restRingProgress.value === 0) {
    return "text-emerald-400 stroke-emerald-400 opacity-0 ease-linear";
  }
  return "text-emerald-400 stroke-emerald-400 ease-linear";
});

const restRingDisplayTime = computed(() => {
  if (props.restFormattedTime.length > 5) {
    const match = /^(\+?)(\d+):/.exec(props.restFormattedTime);
    if (match) return `${match[1]}${match[2]}m`;
  }
  return props.restFormattedTime;
});

const isHoldComplete = computed(() => {
  return parsedDurationSeconds.value > 0 && timerRemaining.value === 0 && !isTimerRunning.value;
});

const isHoldDeckActive = computed(() => {
  return (
    !props.isResting &&
    !props.isWorkoutComplete &&
    !props.isRestDay &&
    Boolean(props.currentExercise) &&
    !props.currentProgress?.isCompleted &&
    isDurationExercise.value
  );
});

const deckContainerClasses = computed(() => {
  if (props.isResting) {
    return props.isOvertime
      ? "border-red-500/20 bg-red-500/10"
      : "border-emerald-500/20 bg-emerald-500/10";
  }
  if (isHoldDeckActive.value) {
    if (isHoldComplete.value) return "border-emerald-500/20 bg-emerald-500/10";
    if (isTimerRunning.value) return "border-primary/20 bg-primary/10";
  }
  return "border-input/50 bg-white/5";
});

const holdEyebrowLabel = computed(() => {
  if (isHoldComplete.value) return "Hold Complete";
  if (isTimerRunning.value) return "Holding";
  return "Hold";
});

const holdEyebrowClass = computed(() => {
  if (isHoldComplete.value) return "text-emerald-400";
  if (isTimerRunning.value) return "text-primary";
  return "text-muted-foreground";
});

const holdRingProgressClass = computed(() => {
  if (isHoldComplete.value) return "text-emerald-400 stroke-emerald-400 ease-linear";
  if (isTimerRunning.value) return "text-primary stroke-primary ease-linear";
  return "text-primary stroke-primary opacity-0 ease-linear";
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
        class="flex items-center justify-between gap-3 w-full min-h-[52px] rounded-xl border pl-4 pr-1.5 py-1.5 shadow-sm backdrop-blur-md transition-all duration-200"
        :class="deckContainerClasses"
      >
        
        <!-- State A: Resting (Fixed Left Title + Right Timer & Action Cluster) -->
        <template v-if="isResting">
          <div class="flex flex-col min-w-0">
            <span
              data-testid="deck-mode-eyebrow"
              class="text-micro leading-tight"
              :class="isOvertime ? 'text-red-400' : 'text-emerald-400'"
            >
              {{ isOvertime ? "Rest Overtime" : "Rest" }}
            </span>
            <span class="text-sm font-bold text-foreground truncate min-w-0 leading-tight">
              {{ isWorkoutComplete ? 'Workout Complete' : (currentExercise?.exerciseName ?? 'Rest Timer') }}
            </span>
          </div>

          <!-- Right Cluster: Radial Ring + Skip Icon Button + Primary Action -->
          <div class="flex items-center gap-2 shrink-0">
            <UiRadialProgress
              data-testid="deck-rest-ring"
              :size="40"
              :stroke-width="2.5"
              :progress="restRingProgress"
              :track-class="restRingTrackClass"
              :progress-class="restRingProgressClass"
            >
              <span
                class="text-micro font-black tabular-nums tracking-tight normal-case"
                :class="isOvertime ? 'text-red-400' : 'text-emerald-400'"
              >
                {{ restRingDisplayTime }}
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
          <div class="flex flex-col min-w-0">
            <span
              data-testid="deck-mode-eyebrow"
              class="text-micro leading-tight text-muted-foreground"
            >
              Log Extra
            </span>
            <span class="text-sm font-bold text-foreground truncate min-w-0 leading-tight">
              {{ currentExercise.exerciseName }}
            </span>
          </div>

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
          <div class="flex flex-col min-w-0">
            <span
              data-testid="deck-mode-eyebrow"
              class="text-micro leading-tight"
              :class="holdEyebrowClass"
            >
              {{ holdEyebrowLabel }}
            </span>
            <span class="text-sm font-bold text-foreground truncate min-w-0 leading-tight">
              {{ currentExercise.exerciseName }}
            </span>
          </div>

          <!-- Right Cluster: Filling Radial Ring + Play/Reset + Primary Action -->
          <div class="flex items-center gap-2 shrink-0">
            <UiRadialProgress
              data-testid="deck-hold-ring"
              :size="40"
              :stroke-width="2.5"
              :progress="timerProgressPercent"
              track-class="text-white/10"
              :progress-class="holdRingProgressClass"
            >
              <Check v-if="isHoldComplete" data-testid="deck-hold-complete-icon" class="w-4 h-4 text-emerald-400" />
              <span
                v-else
                class="text-micro font-black tabular-nums tracking-tight"
                :class="isTimerRunning ? 'text-primary' : 'text-foreground'"
              >
                {{ timerFormatted }}
              </span>
            </UiRadialProgress>

            <UiButton
              :variant="isTimerActiveOrDirty ? 'secondary' : 'tonal'"
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
          <div class="flex flex-col min-w-0">
            <span
              data-testid="deck-mode-eyebrow"
              class="text-micro leading-tight text-muted-foreground"
            >
              Log
            </span>
            <span class="text-sm font-bold text-foreground truncate min-w-0 leading-tight">
              {{ currentExercise.exerciseName }}
            </span>
          </div>

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
