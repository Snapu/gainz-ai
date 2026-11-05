<script setup lang="ts">
import { Trash, X } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed, nextTick, ref, watch } from "vue";
import { useDeloadStore } from "@/modules/deload/presentation";
import { useRestTimerStore } from "@/modules/platform/presentation";
import type { ExerciseLog } from "@/modules/trainingLogs/presentation";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import type { ExerciseSelectorOptionDetails } from "@/shared/presentation/components/ExerciseSelector.vue";
import ExerciseSelector from "@/shared/presentation/components/ExerciseSelector.vue";
import { uiIconButtonClass } from "@/shared/presentation/components/ui/styles";
import UiBottomSheet from "@/shared/presentation/components/ui/UiBottomSheet.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiNumberField from "@/shared/presentation/components/ui/UiNumberField.vue";
import UiSparkline from "@/shared/presentation/components/ui/UiSparkline.vue";
import { useKeyboard } from "@/shared/presentation/composables/useKeyboard";
import { useToast } from "@/shared/presentation/composables/useToast";

const props = defineProps<{
  open: boolean;
  prefillData?: {
    exerciseName: string;
    reps?: number;
    weight?: number;
    distance?: number;
    duration?: number;
    rpe?: number;
  } | null;
  logToEdit?: ExerciseLog | null;
  /** Rest duration in seconds to start after saving a set. Provided by the caller. */
  restSeconds?: number | null;
}>();

const emit = defineEmits<{
  (e: "update:open", val: boolean): void;
  (e: "saved"): void;
}>();

const deloadStore = useDeloadStore();
const logsStore = useExerciseLogsStore();
const restTimerStore = useRestTimerStore();
const { toast } = useToast();
const { isKeyboardVisible } = useKeyboard();

const { exerciseLogs } = storeToRefs(logsStore);

const internalOpen = computed({
  get: () => props.open,
  set: (val) => emit("update:open", val),
});

const formExerciseName = ref("");
const formReps = ref<number | null>(null);
const formWeight = ref<number | null>(null);
const formDistance = ref<number | null>(null);
const formDuration = ref<number | null>(null);
const formRpe = ref<number>(deloadStore.active ? 6 : 8.5);
const isRpeEnabled = ref(false);
const isApplyingPrefill = ref(false);

const isDumbbellExercise = computed(() => /kurzhantel|dumbbell/i.test(formExerciseName.value));

interface ExerciseFormData {
  exerciseName: string;
  reps?: number | null;
  weight?: number | null;
  distance?: number | null;
  duration?: number | null;
  rpe?: number | null;
}

function applyFormData(data: ExerciseFormData | null | undefined) {
  isApplyingPrefill.value = true;
  if (data) {
    formExerciseName.value = data.exerciseName;
    formReps.value = data.reps ?? null;
    formWeight.value = data.weight ?? null;
    formDistance.value = data.distance ?? null;
    formDuration.value = data.duration ?? null;
    formRpe.value = data.rpe ?? (deloadStore.active ? 6 : 8.5);
    isRpeEnabled.value = data.rpe != null;
  } else {
    formExerciseName.value = "";
    formReps.value = null;
    formWeight.value = null;
    formDistance.value = null;
    formDuration.value = null;
    formRpe.value = deloadStore.active ? 6 : 8.5;
    isRpeEnabled.value = false;
  }
  nextTick().then(() => {
    isApplyingPrefill.value = false;
  });
}

// Monitor when the sheet is opened, and either reset or apply prefill data
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      formExerciseName.value = "";
      isApplyingPrefill.value = false;
      return;
    }

    applyFormData(props.logToEdit ?? props.prefillData);
  },
  { immediate: true },
);

// Auto-fill from historical metrics when name is selected unless skipped (prefilled from AI)
watch(formExerciseName, (name) => {
  if (!name || isApplyingPrefill.value) return;

  const lastLog = logsStore.lastLogForExercise(name);
  formReps.value = lastLog?.reps ?? null;
  formWeight.value = lastLog?.weight ?? null;
  formDistance.value = lastLog?.distance ?? null;
  formDuration.value = lastLog?.duration ?? null;
  formRpe.value = lastLog?.rpe ?? (deloadStore.active ? 6 : 8.5);
  isRpeEnabled.value = lastLog?.rpe != null;
});

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

async function saveLog() {
  if (!formExerciseName.value) {
    toast({ title: "Exercise Name Required", variant: "destructive" });
    return;
  }

  const log: ExerciseLog = {
    id: props.logToEdit?.id || crypto.randomUUID(),
    exerciseName: formExerciseName.value,
    reps: formReps.value ?? undefined,
    weight: formWeight.value ?? undefined,
    distance: formDistance.value ?? undefined,
    duration: formDuration.value ?? undefined,
    rpe: isRpeEnabled.value ? formRpe.value : undefined,
    loggedAt: props.logToEdit?.loggedAt || new Date(),
  };

  if (props.logToEdit) {
    logsStore.updateExerciseLog(log);
  } else {
    logsStore.addExerciseLog(log);
    const DEFAULT_REST_SECONDS = 120; // 2 minutes generic fallback
    restTimerStore.reset();
    restTimerStore.start(props.restSeconds ?? DEFAULT_REST_SECONDS);
  }

  internalOpen.value = false;
  emit("saved");
}

async function deleteLog() {
  if (!props.logToEdit) return;
  logsStore.removeExerciseLog(props.logToEdit);
  internalOpen.value = false;
  emit("saved");
}
</script>

<template>
  <UiBottomSheet 
    v-model:open="internalOpen" 
    :title="props.logToEdit ? 'Edit Exercise' : 'Log Exercise'"
    content-class="p-0 gap-0"
  >
    <template #header>
      <div
        class="flex items-center justify-between px-6 pb-2 shrink-0"
        :class="isKeyboardVisible ? 'pt-3' : 'pt-6'"
      >
        <h2 class="text-2xl font-bold tracking-tight">
          {{ props.logToEdit ? 'Edit Exercise' : 'Log Exercise' }}
        </h2>
        <button type="button" @click="internalOpen = false" :class="uiIconButtonClass">
          <X class="w-5 h-5 text-muted-foreground" />
          <span class="sr-only">Close</span>
        </button>
      </div>
    </template>

    <!-- Scrollable Form Content -->
    <div class="flex flex-col gap-5 overflow-y-auto px-6 py-4 no-scrollbar flex-1">
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
        class="flex gap-3 p-3 rounded-xl bg-card/40 border border-white/5 backdrop-blur-sm"
      >
        <UiSparkline
          v-if="exerciseStats.weightHistory.length >= 2"
          :values="exerciseStats.weightHistory"
          :reference-value="exerciseStats.max.weight"
          reference-label="MAX"
          label="Weight (kg)"
          :width="140"
          :height="48"
          class="flex-1"
        />
        <UiSparkline
          v-if="exerciseStats.repsHistory.length >= 2"
          :values="exerciseStats.repsHistory"
          :reference-value="exerciseStats.max.reps"
          reference-label="MAX"
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
        <UiNumberField v-model="formWeight" label="Weight (kg)" :min="0" :step="0.5" :description="isDumbbellExercise ? 'Total (both hands)' : undefined" />
        <UiNumberField v-model="formDistance" label="Distance (m)" :min="0" :step="10" />
        <UiNumberField v-model="formDuration" label="Duration (min)" :min="0" :step="0.5" />
      </div>

      <!-- RPE Slider -->
      <div class="space-y-3 px-1 mt-1">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Effort (RPE)</span>
          <span class="text-xs font-bold transition-opacity duration-200" :class="isRpeEnabled ? 'text-primary' : 'text-primary/50 opacity-50'">
            {{ rpeLabel }}
          </span>
        </div>
        
        <div class="h-6 flex items-center gap-4">
          <label class="relative inline-flex items-center cursor-pointer min-w-[36px] w-[36px] h-[20px]">
            <input type="checkbox" v-model="isRpeEnabled" class="sr-only peer" />
            <div class="w-full h-full bg-white/10 rounded-full peer peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-[16px] shadow-sm"></div>
          </label>
          
          <input 
            type="range" 
            min="6" 
            max="10" 
            step="0.5" 
            :disabled="!isRpeEnabled"
            v-model.number="formRpe"
            @pointerdown.stop
            @touchstart.stop
            @touchmove.stop
            class="w-full h-2 bg-white/5 rounded-lg appearance-none accent-primary transition-opacity duration-200"
            :class="isRpeEnabled ? 'cursor-pointer opacity-100' : 'cursor-not-allowed opacity-30'"
          />
        </div>
      </div>
    </div>

    <!-- Docked Footer Action -->
    <div
      class="px-6 pt-3 shrink-0 bg-background/95 backdrop-blur z-10 border-t border-white/5"
      :class="isKeyboardVisible ? 'pb-3' : 'pb-safe'"
    >
      <div class="flex gap-3" :class="isKeyboardVisible ? '' : 'mb-4'">
        <UiButton 
          v-if="props.logToEdit" 
          haptic
          variant="outline" 
          class="h-14 rounded-xl px-5 border-destructive/20 text-destructive hover:bg-destructive/10 active:scale-95 transition-transform" 
          @click="deleteLog"
          aria-label="Delete Set"
        >
          <Trash class="w-5 h-5" />
        </UiButton>
        <UiButton haptic class="flex-1 h-14 rounded-xl text-base font-bold shadow-lg shadow-primary/10 active:scale-95 transition-transform" @click="saveLog">
          {{ props.logToEdit ? 'Save Changes' : 'Save Set' }}
        </UiButton>
      </div>
    </div>
  </UiBottomSheet>
</template>
