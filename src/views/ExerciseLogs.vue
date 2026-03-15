<script setup lang="ts">
import { useIntervalFn } from "@vueuse/core";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Info,
  Menu,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash,
  Trophy,
} from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import AICoachingPanel from "@/components/AICoachingPanel.vue";
import ExerciseLogItem from "@/components/ExerciseLogItem.vue";
import MomentumFlames from "@/components/MomentumFlames.vue";
import RankDetailsOverlay from "@/components/RankDetailsOverlay.vue";
import BottomSheet from "@/components/ui/BottomSheet.vue";
import Button from "@/components/ui/Button.vue";
import DropdownMenu from "@/components/ui/DropdownMenu.vue";
import DropdownMenuItem from "@/components/ui/DropdownMenuItem.vue";
import ExerciseSelector from "@/components/ui/ExerciseSelector.vue";
import NumberField from "@/components/ui/NumberField.vue";
import Progress from "@/components/ui/Progress.vue";
import Sparkline from "@/components/ui/Sparkline.vue";
import { useToast } from "@/components/ui/useToast";
import { WIZARD_STEPS } from "@/constants/wizard";
import type { ExerciseLog } from "@/services/exerciseLogs";
import { calculateUserProgress } from "@/services/leveling";
import { summaryToWorkoutDates } from "@/services/trainingSummary";
import { localeDateString } from "@/services/utils/date";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";
import { useExercisesStore } from "@/stores/exercises";
import { useSpreadsheetStore } from "@/stores/spreadsheet";
import { useTrainingSummaryStore } from "@/stores/trainingSummary";
import { useUserProfileStore } from "@/stores/userProfile";

const profileStore = useUserProfileStore();
const logsStore = useExerciseLogsStore();
const exercisesStore = useExercisesStore();
const summaryStore = useTrainingSummaryStore();
const spreadsheetStore = useSpreadsheetStore();
const { toast } = useToast();

const { userProfile } = storeToRefs(profileStore);
const { exerciseLogs } = storeToRefs(logsStore);

const isAIPanelOpen = ref(false);
const isRankOverlayOpen = ref(false);

// --- Leveling ---
const userProgress = computed(() => {
  const historicalDates = summaryToWorkoutDates(summaryStore.summaries);
  const currentDates = exerciseLogs.value.map((l) => l.loggedAt);
  const allDates = [...historicalDates, ...currentDates];
  return calculateUserProgress(allDates, userProfile.value.workoutDaysPerWeek || 3);
});

// --- Group Logs ---
interface GroupedSession {
  date: string;
  logs: ExerciseLog[];
  stats: {
    sets: number;
    volume: number;
    durationMinutes: number;
    exerciseCount: number;
  };
}

const collapsedSessions = ref<Record<string, boolean>>({});

const groupedLogs = computed(() => {
  const groups: Record<string, ExerciseLog[]> = {};

  const sorted = [...exerciseLogs.value].sort(
    (a, b) => b.loggedAt.getTime() - a.loggedAt.getTime(),
  );

  for (const log of sorted) {
    const dateStr = localeDateString(log.loggedAt);
    if (!groups[dateStr]) groups[dateStr] = [];
    groups[dateStr].push(log);
  }

  return Object.entries(groups).map(([date, logs]): GroupedSession => {
    const volume = logs.reduce((acc, log) => acc + (log.weight || 0) * (log.reps || 0), 0);
    const exerciseCount = new Set(logs.map((l) => l.exerciseName)).size;

    // Calculate duration: difference between earliest and latest log in the session
    const times = logs.map((l) => l.loggedAt.getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const durationMinutes = Math.round((maxTime - minTime) / 60000);

    return {
      date,
      logs,
      stats: {
        sets: logs.length,
        volume,
        durationMinutes,
        exerciseCount,
      },
    };
  });
});

// Initialize collapsed state: only first (most recent) is expanded by default
watch(
  groupedLogs,
  (newGroups) => {
    if (newGroups.length > 0) {
      for (let i = 1; i < newGroups.length; i++) {
        const session = newGroups[i];
        if (session) {
          const date = session.date;
          if (collapsedSessions.value[date] === undefined) {
            collapsedSessions.value[date] = true;
          }
        }
      }
    }
  },
  { immediate: true },
);

function toggleSession(date: string) {
  collapsedSessions.value[date] = !collapsedSessions.value[date];
}

// --- Delete Exercise Catalog ---
const confirmingDelete = ref<string | null>(null);

async function confirmDeleteExercise(name: string) {
  await exercisesStore.removeExerciseByName(name);
  confirmingDelete.value = null;
  toast({ title: "Exercise removed from catalog", duration: 2000 });
}

// --- Bottom Sheet Log Form State ---
const isLogFormOpen = ref(false);
const formExerciseName = ref("");
const formReps = ref<number | null>(null);
const formWeight = ref<number | null>(null);
const formDistance = ref<number | null>(null);
const formDuration = ref<number | null>(null);

function openLogForm() {
  formExerciseName.value = "";
  formReps.value = null;
  formWeight.value = null;
  formDistance.value = null;
  formDuration.value = null;
  isLogFormOpen.value = true;
}

// Auto-fill when an existing exercise is selected
watch(formExerciseName, (name) => {
  if (!name) return;
  const lastLog = logsStore.lastLogForExercise(name);
  if (lastLog) {
    if (lastLog.reps) formReps.value = lastLog.reps;
    if (lastLog.weight) formWeight.value = lastLog.weight;
    if (lastLog.distance) formDistance.value = lastLog.distance;
    if (lastLog.duration) formDuration.value = lastLog.duration;
  }
});

// --- Exercise Stats ---
const exerciseStats = computed(() => {
  const name = formExerciseName.value;
  if (!name) return null;

  const logs = exerciseLogs.value
    .filter((l) => l.exerciseName === name)
    .sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime());

  if (logs.length === 0) return null;

  const recent = logs.slice(0, 10);

  function max(arr: typeof logs, key: keyof (typeof logs)[0]): number | null {
    const vals = arr.map((l) => l[key]).filter((v): v is number => typeof v === "number");
    return vals.length ? Math.max(...vals) : null;
  }

  return {
    count: logs.length,
    max: {
      weight: max(logs, "weight"),
      reps: max(logs, "reps"),
    },
    // Chronological order (oldest → newest) for sparkline
    weightHistory: recent
      .map((l) => l.weight)
      .filter((v): v is number => typeof v === "number")
      .reverse(),
    repsHistory: recent
      .map((l) => l.reps)
      .filter((v): v is number => typeof v === "number")
      .reverse(),
  };
});

async function saveLog() {
  if (!formExerciseName.value) {
    toast({ title: "Exercise Name Required", variant: "destructive" });
    return;
  }

  const log: ExerciseLog = {
    id: crypto.randomUUID(),
    exerciseName: formExerciseName.value,
    reps: formReps.value ?? undefined,
    weight: formWeight.value ?? undefined,
    distance: formDistance.value ?? undefined,
    duration: formDuration.value ?? undefined,
    loggedAt: new Date(),
  };

  await logsStore.addExerciseLog(log);

  // Also add to exercises store if new
  await exercisesStore.addExercise({ name: log.exerciseName });

  // Vibrate / Haptic missing but simulated with UX
  toast({ title: "Logged successfully!", duration: 2000 });
  isLogFormOpen.value = false;
}

// --- Stopwatch Timer ---
const elapsedSeconds = ref(0);
const { pause, resume, isActive } = useIntervalFn(
  () => {
    elapsedSeconds.value++;
  },
  1000,
  { immediate: false },
);

function toggleTimer() {
  if (isActive.value) pause();
  else resume();
}

function resetTimer() {
  pause();
  elapsedSeconds.value = 0;
}

const formattedTime = computed(() => {
  const m = Math.floor(elapsedSeconds.value / 60)
    .toString()
    .padStart(2, "0");
  const s = (elapsedSeconds.value % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
});
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col pt-safe relative">
    
    <!-- Top Nav -->
    <header class="flex items-center justify-between p-4 sticky top-0 bg-background/90 z-10 backdrop-blur-xl border-b border-white/5">
      <h1 class="text-2xl font-black italic tracking-tighter">Gainz<span class="text-primary">AI</span></h1>
      <div class="flex gap-2">
        <Button variant="ghost" size="icon" @click="isAIPanelOpen = true">
          <Sparkles class="w-5 h-5 text-primary" />
        </Button>
        <Button variant="ghost" size="icon" @click="$router.push('/rest-recovery')">
          <Moon class="w-5 h-5 text-muted-foreground" />
        </Button>
        <DropdownMenu>
          <template #trigger>
            <Button variant="ghost" size="icon">
              <Menu class="w-5 h-5" />
            </Button>
          </template>
          
          <div class="px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
            Quick Edit
          </div>
          
          <DropdownMenuItem 
            v-for="step in WIZARD_STEPS" 
            :key="step.id"
            @select="$router.push(`/wizard/${step.id}?mode=edit`)"
            class="group"
          >
            <span>{{ step.title }}</span>
            <ChevronRight class="w-4 h-4 ml-auto opacity-0 group-focus:opacity-20 transition-opacity" />
          </DropdownMenuItem>

          <div class="h-px bg-white/5 my-1 mx-3"></div>
          
          <div class="px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
            Data
          </div>

          <DropdownMenuItem 
            @select="spreadsheetStore.openInBrowser()"
            class="group"
          >
            <span>Open Spreadsheet</span>
            <ExternalLink class="w-4 h-4 ml-auto opacity-40 group-hover:text-primary transition-colors" />
          </DropdownMenuItem>
        </DropdownMenu>
      </div>
    </header>

    <!-- Consistency & Leveling (Horizontal Row - Clean HUD) -->
    <button 
      @click="isRankOverlayOpen = true"
      class="w-[calc(100%-2rem)] text-left px-5 py-5 mb-4 relative overflow-hidden rounded-[1.5rem] mx-4 mt-4 group transition-all active:scale-[0.98] duration-300 outline-none border border-white/5 bg-card/30"
    >
      <!-- Original Gradient Background -->
      <div class="absolute inset-0 bg-linear-to-br from-primary/10 via-background to-background z-0"></div>
      <div class="absolute -top-16 -right-16 w-32 h-32 bg-primary/10 blur-[80px] rounded-full"></div>
      
      <!-- Content Row -->
      <div class="relative z-10 flex items-center gap-5">
        <!-- Avatar Section -->
        <div class="relative flex-shrink-0">
          <div class="relative w-[4.5rem] h-[4.5rem] rounded-2xl overflow-hidden border border-white/10">
            <img :src="userProgress.avatar" :alt="userProgress.title" class="w-full h-full object-cover" />
          </div>
        </div>

        <!-- Info Column -->
        <div class="flex-1 min-w-0 flex flex-col gap-2.5">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-xl font-black italic tracking-tighter text-foreground truncate leading-none">
              {{ userProgress.title }}
            </h2>
            
            <!-- Compact Rank Badge -->
            <div class="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-linear-to-b from-white/10 to-transparent border border-white/5">
              <span class="text-[8px] font-black uppercase tracking-widest text-muted-foreground">LVL</span>
              <span class="text-[11px] font-black italic text-primary leading-none">{{ userProgress.level }}</span>
            </div>
          </div>
          
          <!-- Simple Progress Bar -->
          <Progress :model-value="userProgress.progressPercent" class="bg-white/5 rounded-full" />

          <!-- Mini Status Footer -->
          <div class="flex items-center justify-between">
            <MomentumFlames :momentum="userProgress.momentum" />
          </div>
        </div>
      </div>
    </button>

    <!-- Logs List -->
    <main class="flex-1 px-4 pb-32 overflow-y-auto no-scrollbar">
      <div v-for="session in groupedLogs" :key="session.date" class="mt-8 overflow-hidden">
        <!-- Session Header -->
        <button 
          @click="toggleSession(session.date)"
          class="w-full flex items-center justify-between p-4 mb-3 rounded-2xl bg-linear-to-r from-card/60 to-card/20 border border-white/5 hover:border-primary/20 hover:from-card/80 transition-all duration-300 group relative overflow-hidden"
        >
          <!-- Subtle Glow effect on hover -->
          <div class="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          
          <div class="flex flex-col items-start px-1 relative z-10">
            <h3 class="text-[10px] font-black tracking-[0.2em] text-muted-foreground/60 uppercase group-hover:text-primary/60 transition-colors">{{ session.date }}</h3>
            <div class="flex items-center gap-3 mt-1.5">
              <div class="flex flex-col items-start">
                <span class="text-lg font-black italic tracking-tighter text-foreground group-hover:text-primary transition-colors">{{ session.stats.volume.toLocaleString() }}<span class="text-[10px] ml-0.5 not-italic text-muted-foreground">KG</span></span>
              </div>
              
              <div class="h-4 w-px bg-white/10 mx-1"></div>
              
              <div class="flex items-center gap-3">
                <div class="flex flex-col">
                  <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Sets</span>
                  <span class="text-xs font-black text-foreground">{{ session.stats.sets }}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Exercises</span>
                  <span class="text-xs font-black text-foreground">{{ session.stats.exerciseCount }}</span>
                </div>
                <div v-if="session.stats.durationMinutes > 0" class="flex flex-col">
                  <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Time</span>
                  <span class="text-xs font-black text-foreground">{{ session.stats.durationMinutes }}m</span>
                </div>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2 relative z-10">
            <div class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <ChevronDown 
                class="w-4 h-4 text-muted-foreground group-hover:text-primary transition-all duration-300"
                :class="{ '-rotate-180': !collapsedSessions[session.date] }"
              />
            </div>
          </div>
        </button>

        <!-- Session Content -->
        <div 
          v-show="!collapsedSessions[session.date]"
          class="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-300"
        >
          <ExerciseLogItem 
            v-for="log in session.logs" 
            :key="log.id" 
            :log="log"
            @delete="logsStore.removeExerciseLog($event)"
          />
        </div>
      </div>
      
      <div v-if="groupedLogs.length === 0" class="flex flex-col items-center justify-center mt-20 text-center opacity-50">
        <p class="text-lg font-bold mb-2">No exercises yet.</p>
        <p class="text-sm">Tap the + button to log your first set.</p>
      </div>
    </main>

    <!-- FAB -->
    <div class="fixed bottom-6 right-6 z-20 pb-safe">
      <Button 
        class="w-16 h-16 rounded-3xl shadow-2xl shadow-primary/30 active:scale-95 transition-transform" 
        size="icon" 
        @click="openLogForm"
      >
        <Plus class="w-8 h-8" />
      </Button>
    </div>

    <!-- Bottom Sheet Form -->
    <BottomSheet v-model:open="isLogFormOpen" title="Log Exercise">
      <div class="flex flex-col gap-6 w-full">
        <!-- Optimized Exercise Selection -->
        <ExerciseSelector
          v-model="formExerciseName"
          :options="exercisesStore.exercises.map(e => e.name)"
          placeholder="Select or Search Exercise..."
          class="bg-card"
        >
          <template #item-action="{ option }">
            <div v-if="confirmingDelete === option" class="flex gap-2 animate-in slide-in-from-right-2 fade-in">
              <span class="text-xs text-destructive flex items-center pr-2 font-bold uppercase tracking-widest">Delete?</span>
              <Button
                variant="outline"
                size="sm"
                class="h-8 rounded-lg px-3 bg-card border-white/5"
                @click.stop.prevent="confirmingDelete = null"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                class="h-8 rounded-lg px-3"
                @click.stop.prevent="confirmDeleteExercise(option)"
              >
                Yes
              </Button>
            </div>
            
            <Button
              v-else
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 transition-opacity"
              @click.stop.prevent="confirmingDelete = option"
            >
              <Trash class="w-4 h-4" />
            </Button>
          </template>
        </ExerciseSelector>

        <!-- Exercise Stats -->
        <div
          v-if="exerciseStats && (exerciseStats.weightHistory.length >= 2 || exerciseStats.repsHistory.length >= 2)"
          class="flex gap-3 p-3 rounded-2xl bg-card/40 border border-white/5 backdrop-blur-sm"
        >
          <Sparkline
            v-if="exerciseStats.weightHistory.length >= 2"
            :values="exerciseStats.weightHistory"
            :max-value="exerciseStats.max.weight"
            label="Weight (kg)"
            :width="140"
            :height="48"
            class="flex-1"
          />
          <Sparkline
            v-if="exerciseStats.repsHistory.length >= 2"
            :values="exerciseStats.repsHistory"
            :max-value="exerciseStats.max.reps"
            label="Reps"
            :width="140"
            :height="48"
            color="oklch(0.7 0.15 250)"
            fill-color="oklch(0.7 0.15 250 / 0.1)"
            class="flex-1"
          />
        </div>
        
        <!-- Metrics -->
        <div class="grid grid-cols-2 gap-4">
          <NumberField v-model="formReps" label="Reps" :min="0" :step="1" />
          <NumberField v-model="formWeight" label="Weight (kg)" :min="0" :step="0.5" />
          <NumberField v-model="formDistance" label="Distance (m)" :min="0" :step="10" />
          <NumberField v-model="formDuration" label="Duration (min)" :min="0" :step="0.5" />
        </div>

        <!-- Stopwatch -->
        <div class="flex items-center justify-between bg-card/50 p-4 rounded-2xl border border-white/5 mt-2">
          <div class="font-mono text-3xl font-bold tracking-tight text-primary">{{ formattedTime }}</div>
          <div class="flex gap-2">
            <Button variant="secondary" size="icon" @click="resetTimer" class="h-12 w-12 rounded-xl">
              <RotateCcw class="w-5 h-5" />
            </Button>
            <Button variant="secondary" size="icon" @click="toggleTimer" class="h-12 w-12 rounded-xl">
              <Pause v-if="isActive" class="w-5 h-5" />
              <Play v-else class="w-5 h-5 ml-1" />
            </Button>
          </div>
        </div>

        <Button class="w-full h-16 rounded-2xl text-lg mt-2" @click="saveLog">
          Save Set
        </Button>
      </div>
    </BottomSheet>

    <AICoachingPanel v-model:open="isAIPanelOpen" />
    <RankDetailsOverlay v-model:open="isRankOverlayOpen" :progress="userProgress" />

  </div>
</template>
