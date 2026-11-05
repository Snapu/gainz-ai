<script setup lang="ts">
import { ChevronRight, Info, Play, RotateCcw, Sparkles, Square } from "@lucide/vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiProgressionLine, {
  type ProgressionSessionItem,
} from "@/shared/presentation/components/ui/UiProgressionLine.vue";
import UiRadialProgress from "@/shared/presentation/components/ui/UiRadialProgress.vue";
import type { DisplayExercise } from "../helpers/aiCoachPageHelpers";
import { splitReps, splitWeight } from "../helpers/aiCoachPageHelpers";

const props = defineProps<{
  exercise: DisplayExercise;
  isCompleted: boolean;
  isHighlighted: boolean;
  progress: { done: number; isCompleted: boolean };
  headingLevel?: "h3" | "h4";
  lastSessionSummary?: string | null;
  progressionData?: ProgressionSessionItem[] | null;
  loggedSets?: ExerciseLog[];
  isResting?: boolean;
}>();

const emit = defineEmits<{
  (e: "log", exercise: DisplayExercise): void;
  (e: "search", exerciseName: string): void;
  (e: "editLog", log: ExerciseLog): void;
}>();

const isDurationExercise = computed(() => {
  return props.exercise.targetDurationSeconds != null;
});

const parsedDurationSeconds = computed(() => {
  return props.exercise.targetDurationSeconds ?? 0;
});

const displayTarget = computed(() => {
  if (props.exercise.targetDistanceMeters != null) {
    return { label: "Sets × Distance", value: props.exercise.targetDistanceMeters, unit: "m" };
  }
  if (props.exercise.targetDurationSeconds != null) {
    const s = props.exercise.targetDurationSeconds;
    if (s >= 60 && s % 60 === 0) {
      return { label: "Sets × Time", value: s / 60, unit: "min" };
    }
    return { label: "Sets × Time", value: s, unit: "s" };
  }

  const repsInfo = splitReps(props.exercise.targetReps);
  return { label: "Sets × Reps", value: repsInfo.value, unit: repsInfo.unit };
});

const displayWeight = computed(() => {
  if (!props.exercise.targetWeight) return null;
  return splitWeight(props.exercise.targetWeight);
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
    class="flex flex-col w-full p-5 transition-colors duration-300"
  >
    <!-- Card Content -->
    <div class="relative flex flex-col gap-6 w-full z-10">
      
      <!-- 1. Exercise Name (Header) -->
      <div class="flex items-start justify-between gap-3 w-full">
        <component
          :is="headingLevel ?? 'h3'"
          class="text-lg font-bold text-foreground leading-snug transition-colors duration-300 min-w-0"
        >
          {{ exercise.exerciseName }}
        </component>
        
        <button
          @click.stop="emit('search', exercise.exerciseName)"
          class="p-2 -mr-2 -mt-2 text-muted-foreground/50 hover:text-primary transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full shrink-0"
          aria-label="Exercise guide"
          title="Exercise guide"
        >
          <Info class="w-4 h-4" />
        </button>
      </div>

      <!-- 2. Progression (Sub Header) -->
      <div v-if="progressionData && progressionData.length > 0" class="flex flex-col w-full mt-1">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-xs font-bold text-muted-foreground uppercase tracking-widest">Progression</h4>
          <span class="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">
            History
          </span>
        </div>
        <div class="w-full bg-white/5 border border-white/5 rounded-xl py-2 px-1">
          <UiProgressionLine :sessions="progressionData" />
        </div>
      </div>

      <!-- 3. Target Today (Unified Telemetry Strip) -->
      <div class="flex flex-col gap-1.5 w-full">
        <h4 class="text-xs font-bold text-muted-foreground uppercase tracking-widest">Target Today</h4>
        
        <div class="rounded-xl bg-white/5 border border-white/5 divide-x divide-white/5 grid grid-cols-3 w-full mt-0.5 overflow-hidden">
          <!-- Column 1: Sets × Reps/Time -->
          <div class="flex flex-col justify-between p-2.5 sm:p-3 min-w-0">
            <span class="text-micro font-bold text-muted-foreground/70 uppercase tracking-wider truncate">
              {{ displayTarget.label }}
            </span>
            <div class="flex items-baseline mt-1.5 min-w-0 h-7">
              <span class="text-lg font-black tabular-nums tracking-tight text-foreground shrink-0">{{ exercise.targetSets }}</span>
              <span class="text-xs font-bold text-muted-foreground/40 mx-0.5 shrink-0">×</span>
              <span class="text-lg font-black tabular-nums tracking-tight text-foreground truncate">{{ displayTarget.value }}</span>
            </div>
          </div>
          
          <!-- Column 2: Weight -->
          <div class="flex flex-col justify-between p-2.5 sm:p-3 min-w-0">
            <span class="text-micro font-bold text-muted-foreground/70 uppercase tracking-wider truncate">
              Weight
            </span>
            <div v-if="displayWeight" class="flex items-baseline mt-1.5 min-w-0 h-7">
              <span v-if="displayWeight.value === 'BW'" class="text-lg font-black tracking-tight text-foreground">
                BW
              </span>
              <template v-else>
                <span class="text-lg font-black tabular-nums tracking-tight text-primary truncate">{{ displayWeight.value }}</span>
                <span class="text-xs font-bold text-muted-foreground/60 ml-1 shrink-0">{{ displayWeight.unit }}</span>
              </template>
            </div>
            <div v-else class="text-lg font-black text-muted-foreground/30 mt-1.5 h-7 flex items-baseline">-</div>
          </div>
          
          <!-- Column 3: RPE -->
          <div class="flex flex-col justify-between p-2.5 sm:p-3 min-w-0">
            <span class="text-micro font-bold text-muted-foreground/70 uppercase tracking-wider truncate">
              RPE
            </span>
            <div v-if="exercise.targetRpe" class="flex items-baseline gap-1.5 mt-1.5 min-w-0 h-7">
              <UiRadialProgress 
                :progress="(exercise.targetRpe / 10) * 100" 
                :size="14" 
                :stroke-width="2" 
                progress-class="text-orange-400" 
                track-class="text-orange-500/20" 
                class="self-center shrink-0"
              />
              <span class="text-lg font-black tabular-nums tracking-tight text-orange-400">{{ exercise.targetRpe }}</span>
            </div>
            <div v-else class="text-lg font-black text-muted-foreground/30 mt-1.5 h-7 flex items-baseline">-</div>
          </div>
        </div>
      </div>
      
      <!-- 4. Coach Cue (Frameless) -->
      <div
        v-if="exercise.notes"
        class="flex items-start gap-2.5 w-full border-l-2 border-primary/40 pl-3 py-0.5"
      >
        <Sparkles class="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
        <p class="text-xs sm:text-sm text-foreground/80 font-medium leading-relaxed">
          {{ exercise.notes }}
        </p>
      </div>

      <!-- 5. Progress (Sub Header) -->
      <div class="flex flex-col gap-3 w-full animate-in fade-in duration-300">
        <h4 class="text-xs font-bold text-muted-foreground uppercase tracking-widest">Progress</h4>
        
        <div class="flex flex-col gap-2 w-full">
          <!-- Render existing logs -->
          <div
            v-for="(log, idx) in loggedSets" 
            :key="log.id"
            class="rounded-xl px-2.5 py-1.5 hover:bg-white/5 active:bg-white/10 transition-colors"
            @click.stop="emit('editLog', log)"
          >
            <div 
              class="grid grid-cols-[95px_70px_1fr] sm:grid-cols-[105px_80px_1fr] gap-4 items-center w-full cursor-pointer transition-opacity active:opacity-70 group"
            >
              <!-- Column 1: Reps / Duration / Distance -->
              <div class="flex items-center gap-3 min-w-0">
                <span class="text-[10px] font-bold text-muted-foreground/40 w-4 leading-none tracking-tight">#{{ idx + 1 }}</span>
                <div v-if="log.reps != null" class="flex items-baseline gap-0.5">
                   <span class="text-sm font-bold text-foreground">{{ log.reps }}</span>
                   <span class="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">reps</span>
                </div>
                <div v-else-if="log.duration != null" class="flex items-baseline gap-0.5">
                   <span class="text-sm font-bold text-foreground">{{ log.duration }}</span>
                   <span class="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">min</span>
                </div>
                <div v-else-if="log.distance != null" class="flex items-baseline gap-0.5">
                   <span class="text-sm font-bold text-foreground">{{ log.distance }}</span>
                   <span class="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">m</span>
                </div>
                <div v-else class="flex items-baseline gap-0.5">
                   <span class="text-sm font-bold text-muted-foreground/30">-</span>
                </div>
              </div>
              
              <!-- Column 2: Weight -->
              <div class="flex items-baseline gap-0.5 min-w-0">
                <template v-if="log.weight != null">
                   <span class="text-sm font-bold text-primary">{{ log.weight }}</span>
                   <span class="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">kg</span>
                </template>
                <template v-else>
                   <span class="text-sm font-bold text-muted-foreground/30">-</span>
                </template>
              </div>

              <!-- Column 3: RPE & Chevron -->
              <div class="flex items-center justify-end gap-3 w-full min-w-0">
                <span v-if="log.rpe" class="text-xs font-semibold text-orange-400 text-right whitespace-nowrap">
                  RPE {{ log.rpe }}
                </span>
                <span v-else class="text-xs font-semibold text-muted-foreground/30 text-right whitespace-nowrap">-</span>
                
                <ChevronRight class="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
              </div>
            </div>
          </div>

          <!-- Duration Timer Component (Integrated & Placed Above Log Button for Natural Flow) -->
          <div 
            v-if="isDurationExercise" 
            class="w-full rounded-xl border p-2.5 sm:p-3 flex items-center justify-between gap-3 shadow-xs transition-all duration-300 animate-in fade-in"
            :class="isTimerRunning 
              ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20' 
              : 'border-white/5 bg-white/5'"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="relative w-10 h-10 shrink-0 flex items-center justify-center">
                <svg class="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                 <circle cx="50" cy="50" r="44" class="stroke-white/10" stroke-width="7" fill="none" />
                 <circle
                  cx="50"
                  cy="50"
                  r="44"
                  class="transition-all duration-1000 ease-linear stroke-primary"
                  :class="isTimerRunning ? 'opacity-100' : 'opacity-40'"
                  stroke-width="7"
                  fill="none"
                  stroke-linecap="round"
                  :stroke-dasharray="276"
                  :stroke-dashoffset="276 - (276 * Math.max(0, 100 - timerProgressPercent)) / 100"
                 />
                </svg>
                <div class="absolute inset-0 flex items-center justify-center">
                 <span 
                   class="text-[11px] font-bold tabular-nums tracking-tight transition-colors"
                   :class="isTimerRunning ? 'text-primary' : 'text-foreground'"
                 >
                  {{ timerFormatted }}
                 </span>
                </div>
              </div>
              
              <div class="flex flex-col min-w-0 gap-0.5">
                <span class="text-micro font-bold text-muted-foreground/60 leading-none">Exercise Timer</span>
                <span 
                  class="text-xs sm:text-sm font-bold truncate mt-0.5 transition-colors duration-300" 
                  :class="isTimerRunning ? 'text-primary' : (timerRemaining === 0 ? 'text-emerald-400' : 'text-foreground')"
                >
                  {{ isTimerRunning ? 'In Progress' : (timerRemaining > 0 && timerRemaining < parsedDurationSeconds ? 'Paused' : (timerRemaining === 0 ? 'Completed' : 'Ready')) }}
                </span>
              </div>
            </div>
            
            <div class="flex items-center gap-1.5 shrink-0">
              <button
                v-if="timerRemaining < parsedDurationSeconds && !isTimerRunning"
                @click.stop="resetTimer"
                class="h-8 w-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Reset Timer"
              >
                <RotateCcw class="w-3.5 h-3.5" />
              </button>
              <button 
                @click.stop="toggleTimer"
                class="h-8 w-8 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                :class="isTimerRunning 
                  ? 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/15 border border-orange-500/20' 
                  : 'bg-white/10 text-foreground hover:bg-primary/20 hover:text-primary border border-white/5'"
                :aria-label="isTimerRunning ? 'Pause Timer' : 'Start Timer'"
              >
                <Play v-if="!isTimerRunning" class="w-3.5 h-3.5 ml-0.5" fill="currentColor" />
                <Square v-else class="w-3 h-3" fill="currentColor" />
              </button>
            </div>
          </div>

          <!-- Log Next Set Action -->
          <button 
            @click.stop="emit('log', exercise)"
            class="w-full py-3 rounded-xl font-bold transition-all duration-300 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary flex items-center justify-center gap-2"
            :class="isCompleted ? 'text-xs bg-transparent text-muted-foreground/50 hover:text-muted-foreground border border-dashed border-white/10 hover:bg-white/5' : (isHighlighted && !isResting ? 'text-sm bg-primary text-primary-foreground shadow-sm' : 'text-sm bg-primary/10 text-primary hover:bg-primary/20')"
          >
            <span>{{ isCompleted ? '+ Add Extra Set' : (isResting ? `Resting... (Log Set ${progress.done + 1})` : `Log Set ${progress.done + 1}`) }}</span>
          </button>
        </div>
      </div>
    </div>
  </UiCard>
</template>
