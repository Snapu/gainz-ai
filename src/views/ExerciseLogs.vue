<script setup lang="ts">
import { haptic } from "ios-haptics";
import { ChevronRight, ExternalLink, Menu, Moon, Plus, Sparkles } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import AICoachingPanel from "@/components/AICoachingPanel.vue";
import AppHeader from "@/components/AppHeader.vue";
import EmptyState from "@/components/EmptyState.vue";
import type { ExerciseSelectorOptionDetails } from "@/components/ExerciseSelector.vue";
import ExerciseSelector from "@/components/ExerciseSelector.vue";
import RestTimerToast from "@/components/RestTimerToast.vue";
import SessionLogGroup from "@/components/SessionLogGroup.vue";
import UserProgressCard from "@/components/UserProgressCard.vue";
import UiBottomSheet from "@/components/ui/UiBottomSheet.vue";
import UiButton from "@/components/ui/UiButton.vue";
import UiDropdownMenu from "@/components/ui/UiDropdownMenu.vue";
import UiDropdownMenuItem from "@/components/ui/UiDropdownMenuItem.vue";
import UiNumberField from "@/components/ui/UiNumberField.vue";
import UiSparkline from "@/components/ui/UiSparkline.vue";
import { useToast } from "@/composables/useToast";
import { WIZARD_STEPS } from "@/constants/wizard";
import type { ExerciseLog } from "@/services/exerciseLogs";
import { calculateUserProgress } from "@/services/leveling";
import { summaryToExerciseLogs, summaryToWorkoutDates } from "@/services/trainingSummary";
import { localeDateString } from "@/services/utils/date";
import { useDeloadStore } from "@/stores/deload";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";
import { useRestTimerStore } from "@/stores/restTimer";
import { useSpreadsheetStore } from "@/stores/spreadsheet";
import { useTrainingInsightsStore } from "@/stores/trainingInsights";
import { useTrainingSummaryStore } from "@/stores/trainingSummary";
import { useUserProfileStore } from "@/stores/userProfile";

const profileStore = useUserProfileStore();
const deloadStore = useDeloadStore();
const trainingInsightsStore = useTrainingInsightsStore();
const logsStore = useExerciseLogsStore();
const summaryStore = useTrainingSummaryStore();
const spreadsheetStore = useSpreadsheetStore();
const restTimerStore = useRestTimerStore();
const { toast } = useToast();

// --- Rest Timer ---
const { isResting, formattedTime: formattedRestTime } = storeToRefs(restTimerStore);

const { userProfile } = storeToRefs(profileStore);
const { exerciseLogs } = storeToRefs(logsStore);

const isAIPanelOpen = ref(false);

// --- Exercise Options ---
// Derived from exercise log names. Learned map keys are normalized lowercase
// and not suitable for display, so the selector uses names as entered in the logs.
const latestExerciseLogs = computed(() => {
  const latestByExercise = new Map<string, ExerciseLog>();

  for (const log of [...exerciseLogs.value].sort(
    (a, b) => b.loggedAt.getTime() - a.loggedAt.getTime(),
  )) {
    if (!latestByExercise.has(log.exerciseName)) {
      latestByExercise.set(log.exerciseName, log);
    }
  }

  return latestByExercise;
});
const exerciseOptions = computed(() => {
  return [...latestExerciseLogs.value.entries()]
    .sort((left, right) => {
      const loggedAtDiff = right[1].loggedAt.getTime() - left[1].loggedAt.getTime();
      return loggedAtDiff !== 0 ? loggedAtDiff : left[0].localeCompare(right[0]);
    })
    .map(([exerciseName]) => exerciseName);
});

function formatMetric(value: number | undefined, suffix: string): string | null {
  if (typeof value !== "number") return null;
  return `${value}${suffix}`;
}

function formatLastUsed(loggedAt: Date): string {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfLoggedDay = new Date(
    loggedAt.getFullYear(),
    loggedAt.getMonth(),
    loggedAt.getDate(),
  );
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfLoggedDay.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (dayDiff <= 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return `${dayDiff}d ago`;

  const weekDiff = Math.round(dayDiff / 7);
  if (weekDiff < 5) return `${weekDiff}w ago`;

  const monthDiff =
    (today.getFullYear() - loggedAt.getFullYear()) * 12 + today.getMonth() - loggedAt.getMonth();
  if (monthDiff < 12) return `${monthDiff}mo ago`;

  const yearDiff = today.getFullYear() - loggedAt.getFullYear();
  return `${yearDiff}y ago`;
}

const exerciseOptionDetails = computed<Record<string, ExerciseSelectorOptionDetails>>(() => {
  return Object.fromEntries(
    exerciseOptions.value.map((exerciseName) => {
      const lastLog = latestExerciseLogs.value.get(exerciseName);
      const meta = [
        formatMetric(lastLog?.weight, "kg"),
        formatMetric(lastLog?.reps, " reps"),
        formatMetric(lastLog?.distance, "m"),
        formatMetric(lastLog?.duration, " min"),
      ]
        .filter((label): label is string => Boolean(label))
        .map((label, index) => ({
          label,
          tone: index === 0 && lastLog?.weight ? ("primary" as const) : ("default" as const),
        }));

      return [
        exerciseName,
        {
          description: lastLog ? formatLastUsed(lastLog.loggedAt) : undefined,
          meta,
        },
      ];
    }),
  );
});

// --- Leveling ---
const userProgress = computed(() => {
  const historicalLogs = summaryToExerciseLogs(summaryStore.summaries);
  const currentLogs = exerciseLogs.value;
  const allLogs = [...historicalLogs, ...currentLogs];

  return calculateUserProgress(allLogs, userProfile.value.workoutDaysPerWeek || 3);
});

// --- Training Science ---
const trainingInsights = computed(() => trainingInsightsStore.insights);

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

const todayLogs = computed(() => {
  const todayStr = localeDateString(new Date());
  const todaySession = groupedLogs.value.find((s) => s.date === todayStr);
  return todaySession ? todaySession.logs : [];
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

// --- Bottom Sheet Log Form State ---
const isLogFormOpen = ref(false);
const formExerciseName = ref("");
const formReps = ref<number | null>(null);
const formWeight = ref<number | null>(null);
const formDistance = ref<number | null>(null);
const formDuration = ref<number | null>(null);
const formRpe = ref<number>(10);
const skipHistoryAutoFill = ref(false);

const rpeLabel = computed(() => {
  if (formRpe.value === 10) return "10 - Absolute Max (0 RIR)";
  if (formRpe.value === 9.5) return "9.5 - Maybe 1 more (0-1 RIR)";
  if (formRpe.value === 9) return "9 - 1 Rep Left (1 RIR)";
  if (formRpe.value === 8.5) return "8.5 - Definitely 1, maybe 2";
  if (formRpe.value === 8) return "8 - 2 Reps Left (2 RIR)";
  if (formRpe.value === 7.5) return "7.5 - Definitely 2, maybe 3";
  if (formRpe.value === 7) return "7 - 3 Reps Left (3 RIR)";
  return `${formRpe.value} - Lower Intensity`;
});

function openLogForm() {
  formExerciseName.value = "";
  formReps.value = null;
  formWeight.value = null;
  formDistance.value = null;
  formDuration.value = null;
  formRpe.value = 10;
  isLogFormOpen.value = true;
}

function handleFabClick() {
  if (isResting.value) {
    restTimerStore.reset();
  }
  openLogForm();
}

function prefillFromAi(data: { exerciseName: string; reps?: number; weight?: number }) {
  skipHistoryAutoFill.value = true;
  formExerciseName.value = data.exerciseName;
  formReps.value = data.reps ?? null;
  formWeight.value = data.weight ?? null;
  formDistance.value = null;
  formDuration.value = null;
  isLogFormOpen.value = true;
}

// Auto-fill when an existing exercise is selected
watch(formExerciseName, (name) => {
  if (!name) return;

  if (skipHistoryAutoFill.value) {
    skipHistoryAutoFill.value = false;
    return;
  }

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

  // Trigger haptic synchronously before any async operations
  haptic.confirm();

  const log: ExerciseLog = {
    id: crypto.randomUUID(),
    exerciseName: formExerciseName.value,
    reps: formReps.value ?? undefined,
    weight: formWeight.value ?? undefined,
    distance: formDistance.value ?? undefined,
    duration: formDuration.value ?? undefined,
    rpe: formRpe.value,
    loggedAt: new Date(),
  };

  await logsStore.addExerciseLog(log);

  // Auto-start rest timer
  restTimerStore.reset();
  restTimerStore.start();

  isLogFormOpen.value = false;
}
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col pt-safe relative">
    
    <!-- Top Nav -->
    <AppHeader class="justify-between">
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-black italic tracking-tighter">Gainz<span class="text-primary">AI</span></h1>
      </div>
      <div class="flex gap-2">
        <UiButton variant="ghost" size="icon" @click="isAIPanelOpen = true">
          <Sparkles class="w-5 h-5 text-primary" />
        </UiButton>
        <UiButton variant="ghost" size="icon" @click="$router.push('/rest-recovery')">
          <Moon class="w-5 h-5 text-muted-foreground" />
        </UiButton>
        <UiDropdownMenu>
          <template #trigger>
            <UiButton variant="ghost" size="icon">
              <Menu class="w-5 h-5" />
            </UiButton>
          </template>
          
          <div class="px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
            Quick Edit
          </div>
          
          <UiDropdownMenuItem 
            v-for="step in WIZARD_STEPS" 
            :key="step.id"
            @select="$router.push(`/wizard/${step.id}?mode=edit`)"
            class="group"
          >
            <span>{{ step.title }}</span>
            <ChevronRight class="w-4 h-4 ml-auto opacity-0 group-focus:opacity-20 transition-opacity" />
          </UiDropdownMenuItem>

          <div class="h-px bg-white/5 my-1 mx-3"></div>
          
          <div class="px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
            Data
          </div>

          <UiDropdownMenuItem 
            @select="spreadsheetStore.openInBrowser()"
            class="group"
          >
            <span>Open Spreadsheet</span>
            <ExternalLink class="w-4 h-4 ml-auto opacity-40 group-hover:text-primary transition-colors" />
          </UiDropdownMenuItem>
        </UiDropdownMenu>
      </div>
    </AppHeader>

    <!-- Unified Journey HUD -->
    <UserProgressCard 
      :progress="userProgress" 
      :insights="trainingInsights" 
      @click="$router.push('/training-insights')" 
    />

    <!-- Logs List -->
    <main class="flex-1 px-4 pb-32 overflow-y-auto no-scrollbar">
      <SessionLogGroup
        v-for="session in groupedLogs"
        :key="session.date"
        :date="session.date"
        :logs="session.logs"
        :stats="session.stats"
        :is-collapsed="!!collapsedSessions[session.date]"
        @toggle="toggleSession(session.date)"
        @delete-log="logsStore.removeExerciseLog"
      />
      
      <EmptyState 
        v-if="groupedLogs.length === 0"
        title="No exercises yet."
        description="Tap the + button to log your first set."
        class="mt-20"
      />
    </main>

    <!-- Rest Timer Toast (Independent Fixed Layer) -->
    <Transition name="fade-slide">
      <div v-if="isResting" class="fixed bottom-10 right-28 z-40 mb-safe pointer-events-auto">
        <RestTimerToast
          :formatted-time="formattedRestTime"
          @dismiss="restTimerStore.reset()"
        />
      </div>
    </Transition>

    <!-- Primary FAB -->
    <div class="fixed bottom-10 right-10 z-30 pb-safe pointer-events-auto">
      <UiButton 
        class="relative w-16 h-16 rounded-full shadow-2xl active:scale-95 transition-all z-10" 
        size="icon" 
        @click="handleFabClick"
      >
        <Plus class="w-8 h-8" />
      </UiButton>
    </div>

    <!-- Bottom Sheet Form -->
    <UiBottomSheet v-model:open="isLogFormOpen" title="Log Exercise">
      <div class="flex flex-col gap-6 w-full">
        <!-- Optimized Exercise Selection -->
        <ExerciseSelector
          v-model="formExerciseName"
          :options="exerciseOptions"
          :option-details="exerciseOptionDetails"
          placeholder="Select or Search Exercise..."
          class="bg-card"
        />

        <!-- Exercise Stats -->
        <div
          v-if="exerciseStats && (exerciseStats.weightHistory.length >= 2 || exerciseStats.repsHistory.length >= 2)"
          class="flex gap-3 p-3 rounded-2xl bg-card/40 border border-white/5 backdrop-blur-sm"
        >
          <UiSparkline
            v-if="exerciseStats.weightHistory.length >= 2"
            :values="exerciseStats.weightHistory"
            :max-value="exerciseStats.max.weight"
            label="Weight (kg)"
            :width="140"
            :height="48"
            class="flex-1"
          />
          <UiSparkline
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
          <UiNumberField v-model="formReps" label="Reps" :min="0" :step="1" />
          <UiNumberField v-model="formWeight" label="Weight (kg)" :min="0" :step="0.5" />
          <UiNumberField v-model="formDistance" label="Distance (m)" :min="0" :step="10" />
          <UiNumberField v-model="formDuration" label="Duration (min)" :min="0" :step="0.5" />
        </div>

        <!-- Stopwatch -->
        <!-- RPE Slider -->
        <div class="space-y-3 px-1 mt-2">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Effort (RPE)</span>
            <span class="text-xs font-bold text-primary">{{ rpeLabel }}</span>
          </div>
          <input 
            type="range" 
            min="6" 
            max="10" 
            step="0.5" 
            v-model.number="formRpe"
            class="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-primary"
          />
        </div>

        <UiButton class="w-full h-16 rounded-2xl text-lg mt-4" @click="saveLog">
          Save Set
        </UiButton>
      </div>
    </UiBottomSheet>

    <AICoachingPanel v-model:open="isAIPanelOpen" @log-exercise="prefillFromAi" />
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  transform: translateX(10px);
  opacity: 0;
}

</style>
