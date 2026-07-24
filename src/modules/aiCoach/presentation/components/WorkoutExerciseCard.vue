<script setup lang="ts">
import { ChevronRight, MessageSquareText, Play, RotateCcw, Search, Square } from "@lucide/vue";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import UiBarGraph from "@/shared/presentation/components/ui/UiBarGraph.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
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
  progressionData?: Array<{
    items?: Array<{ value: number; groupKey?: string }>;
    values?: number[];
    label: string;
    color: string;
  }> | null;
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
    class="flex flex-col w-full p-5 transition-colors duration-300"
  >
    <!-- Card Content -->
    <div class="relative flex flex-col gap-6 w-full z-10">
      
      <!-- 1. Exercise Name (Header) -->
      <div class="flex items-start justify-between gap-3 w-full">
        <component
          :is="headingLevel ?? 'h3'"
          class="text-lg font-bold text-foreground truncate transition-colors duration-300"
        >
          {{ exercise.exerciseName }}
        </component>
        
        <button
          @click.stop="emit('search', exercise.exerciseName)"
          class="p-2 -mr-2 -mt-2 text-muted-foreground/50 hover:text-primary transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full shrink-0"
          aria-label="Search images"
          title="Images"
        >
          <Search class="w-4 h-4" />
        </button>
      </div>

      <!-- 2. Progression (Sub Header) -->
      <div v-if="progressionData && progressionData.length > 0" class="flex flex-col w-full mt-2">
        <h4 class="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Progression</h4>
        <div class="flex flex-col w-full" :class="progressionData.length === 2 ? 'gap-0' : 'gap-3'">
          <template v-for="(metric, idx) in progressionData" :key="idx">
            <div 
              v-if="(metric.items && metric.items.length > 0) || (metric.values && metric.values.length > 0)"
              class="w-full h-16 opacity-90"
            >
              <UiBarGraph 
                :items="metric.items"
                :values="metric.values" 
                :label="metric.label"
                :color="metric.color" 
                :direction="idx === 1 && progressionData.length === 2 ? 'down' : 'up'"
                :format-value="metric.label === 'TIME' ? (v) => Number(v).toFixed(2) : undefined"
              />
            </div>
          </template>
        </div>
      </div>

      <!-- 3. Target Today (Sub Header) -->
      <div class="flex flex-col gap-3 w-full">
        <h4 class="text-xs font-bold text-muted-foreground uppercase tracking-widest">Target Today</h4>
        
        <div class="flex items-start justify-between w-full mt-1 gap-2">
          <div class="flex items-start gap-8 sm:gap-10">
            <!-- Sets × Reps/Time -->
            <div class="flex flex-col shrink-0">
              <span class="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
                {{ displayTarget.label }}
              </span>
              <div class="flex items-baseline">
                <span class="text-2xl font-bold tabular-nums text-foreground shrink-0">{{ exercise.targetSets }}</span>
                <span class="text-sm font-bold text-muted-foreground/40 mx-1 shrink-0">×</span>
                <span class="text-2xl font-bold tabular-nums text-foreground">{{ displayTarget.value }}</span>
              </div>
            </div>
            
            <!-- Weight -->
            <div class="flex flex-col shrink-0">
              <span class="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Weight</span>
              <div v-if="exercise.targetWeight && splitWeight(exercise.targetWeight).value !== 'BW'" class="flex items-baseline">
                <span class="text-2xl font-bold tabular-nums text-primary/90">{{ splitWeight(exercise.targetWeight).value }}</span>
                <span class="text-xs font-bold text-muted-foreground/50 ml-1 shrink-0">{{ splitWeight(exercise.targetWeight).unit }}</span>
              </div>
              <div v-else class="text-2xl font-bold text-muted-foreground/30">-</div>
            </div>
          </div>
          
          <!-- RPE -->
          <div class="flex flex-col items-end shrink-0">
            <span class="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider text-right whitespace-nowrap">RPE</span>
            <div v-if="exercise.targetRpe" class="flex items-center gap-2 justify-end">
              <UiRadialProgress 
                :progress="(exercise.targetRpe / 10) * 100" 
                :size="18" 
                :stroke-width="2.5" 
                progress-class="text-amber-500/80" 
                track-class="text-amber-500/15" 
              />
              <span class="text-2xl font-bold tabular-nums text-amber-500/90 leading-none">{{ exercise.targetRpe }}</span>
            </div>
            <div v-else class="text-2xl font-bold text-muted-foreground/30 text-right leading-none">-</div>
          </div>
        </div>
      </div>
      
      <!-- 4. Coach message -->
      <div
        v-if="exercise.notes"
        class="flex items-start gap-2.5 w-full bg-primary/[0.05] p-3.5 rounded-xl border border-primary/20 shadow-sm"
      >
        <MessageSquareText class="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <span class="text-sm text-foreground/90 font-medium italic leading-relaxed">{{ exercise.notes }}</span>
      </div>

      <!-- 5. Progress (Sub Header) -->
      <div class="flex flex-col gap-3 w-full animate-in fade-in duration-300">
        <h4 class="text-xs font-bold text-muted-foreground uppercase tracking-widest">Progress</h4>
        
        <div class="flex flex-col gap-2 w-full">
          <!-- Render existing logs -->
          <div
            v-for="(log, idx) in loggedSets" 
            :key="log.id"
            class="-mx-4 px-4 py-1.5 hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors rounded-none"
            @click.stop="emit('editLog', log)"
          >
            <div 
              class="grid grid-cols-[95px_70px_1fr] sm:grid-cols-[105px_80px_1fr] gap-4 items-center w-full cursor-pointer transition-opacity active:opacity-70 group"
            >
              <!-- Column 1: Reps -->
              <div class="flex items-center gap-3 min-w-0">
                <span class="text-[10px] font-bold text-muted-foreground/40 w-4 leading-none tracking-tight">#{{ idx + 1 }}</span>
                <div v-if="log.reps" class="flex items-baseline gap-0.5">
                   <span class="text-sm font-bold text-foreground">{{ log.reps }}</span>
                   <span class="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">reps</span>
                </div>
                <div v-else-if="log.duration" class="flex items-baseline gap-0.5">
                   <span class="text-sm font-bold text-foreground">{{ log.duration }}</span>
                   <span class="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">min</span>
                </div>
              </div>
              
              <!-- Column 2: Weight -->
              <div class="flex items-baseline gap-0.5 min-w-0">
                <template v-if="log.weight">
                   <span class="text-sm font-bold text-primary">{{ log.weight }}</span>
                   <span class="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">kg</span>
                </template>
                <template v-else>
                   <span class="text-sm font-bold text-muted-foreground/30">-</span>
                </template>
              </div>

              <!-- Column 3: RPE & Chevron -->
              <div class="flex items-center justify-end gap-3 w-full min-w-0">
                <span v-if="log.rpe" class="text-xs font-semibold text-amber-500/80 text-right whitespace-nowrap">
                  RPE {{ log.rpe }}
                </span>
                <span v-else class="text-xs font-semibold text-muted-foreground/30 text-right whitespace-nowrap">-</span>
                
                <ChevronRight class="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
              </div>
            </div>
          </div>

          <!-- Log Next Set Action -->
          <button 
            @click.stop="emit('log', exercise)"
            class="w-full py-3 rounded-xl font-bold transition-all duration-300 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary flex items-center justify-center gap-2"
            :class="isCompleted ? 'text-xs bg-transparent text-muted-foreground/50 hover:text-muted-foreground border border-dashed border-white/10 hover:bg-white/5' : (isHighlighted && !isResting ? 'text-sm bg-primary text-primary-foreground shadow-sm' : 'text-sm bg-primary/10 text-primary hover:bg-primary/20')"
          >
            <span>{{ isCompleted ? '➕ Add Extra Set' : (isResting ? `Resting... (Log Set ${progress.done + 1})` : `Log Set ${progress.done + 1}`) }}</span>
            <ChevronRight v-if="!isCompleted" class="w-4 h-4 opacity-70" />
          </button>
        </div>
        
        <!-- Duration Timer Component -->
        <div 
          v-if="isDurationExercise" 
          class="w-full rounded-xl border p-3 flex items-center justify-between gap-3 bg-primary/[0.02] border-primary/20 shadow-sm transition-colors duration-300 animate-in fade-in duration-300"
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
              <span class="text-xs font-bold uppercase tracking-wider text-muted-foreground/60 leading-none">Exercise Timer</span>
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
    </div>
  </UiCard>
</template>
