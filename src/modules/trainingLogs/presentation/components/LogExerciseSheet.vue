<script setup lang="ts">
import { ChevronDown, Plus, Trash } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed, nextTick, ref, watch } from "vue";
import { useDeloadStore } from "@/modules/deload/presentation";
import { useRestTimerStore } from "@/modules/platform/presentation";
import type { ExerciseLog } from "@/modules/trainingLogs/presentation";
import {
  buildExerciseProgression,
  computeExercisePr,
  useExerciseLogsStore,
} from "@/modules/trainingLogs/presentation";
import type { ExerciseSelectorOptionDetails } from "@/shared/presentation/components/ExerciseSelector.vue";
import ExerciseSelector from "@/shared/presentation/components/ExerciseSelector.vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiBottomSheet from "@/shared/presentation/components/ui/UiBottomSheet.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiNumberField from "@/shared/presentation/components/ui/UiNumberField.vue";
import UiProgressionLine from "@/shared/presentation/components/ui/UiProgressionLine.vue";
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

const { exerciseLogs } = storeToRefs(logsStore);

const internalOpen = computed({
  get: () => props.open,
  set: (val) => emit("update:open", val),
});

const WEIGHT_STEPS = [2.5, 5, 0.5] as const;

const formExerciseName = ref("");
const formReps = ref<number | null>(null);
const formWeight = ref<number | null>(null);
const formDistance = ref<number | null>(null);
const formDuration = ref<number | null>(null);
const formRpe = ref<number>(deloadStore.active ? 6 : 8.5);
const isRpeEnabled = ref(false);
const isApplyingPrefill = ref(false);
const isProgressionExpanded = ref(false);

const weightStep = ref<number>(2.5);
const distanceUnit = ref<"m" | "km">("m");
const durationUnit = ref<"min" | "sec">("min");
const showExtraMetrics = ref(false);
const lastConfiguredExerciseName = ref("");

const distanceStep = computed(() => (distanceUnit.value === "m" ? 50 : 0.5));
const durationStep = computed(() => (durationUnit.value === "min" ? 1 : 5));

const isDumbbellExercise = computed(() => /kurzhantel|dumbbell/i.test(formExerciseName.value));

interface ExerciseFormData {
  exerciseName: string;
  reps?: number | null;
  weight?: number | null;
  distance?: number | null;
  duration?: number | null;
  rpe?: number | null;
}

function applyDistanceAndDuration(
  rawDistance: number | null | undefined,
  rawDuration: number | null | undefined,
  preserveUnits = false,
) {
  if (!preserveUnits) {
    distanceUnit.value =
      rawDistance != null && rawDistance >= 1000 && rawDistance % 100 === 0 ? "km" : "m";
    durationUnit.value = rawDuration != null && rawDuration > 0 && rawDuration < 1 ? "sec" : "min";
  }

  formDistance.value =
    rawDistance != null
      ? distanceUnit.value === "km"
        ? Math.round(rawDistance) / 1000
        : rawDistance
      : null;

  formDuration.value =
    rawDuration != null
      ? durationUnit.value === "sec"
        ? Math.round(rawDuration * 60)
        : rawDuration
      : null;

  showExtraMetrics.value = rawDistance != null || rawDuration != null;
}

function cycleWeightStep() {
  const currentIdx = WEIGHT_STEPS.indexOf(weightStep.value as (typeof WEIGHT_STEPS)[number]);
  weightStep.value = WEIGHT_STEPS[(currentIdx + 1) % WEIGHT_STEPS.length] ?? 2.5;
}

function toggleDistanceUnit() {
  if (distanceUnit.value === "m") {
    distanceUnit.value = "km";
    if (formDistance.value != null) {
      formDistance.value = Math.round(formDistance.value) / 1000;
    }
  } else {
    distanceUnit.value = "m";
    if (formDistance.value != null) {
      formDistance.value = Math.round(formDistance.value * 1000);
    }
  }
}

function toggleDurationUnit() {
  if (durationUnit.value === "min") {
    durationUnit.value = "sec";
    if (formDuration.value != null) {
      formDuration.value = Math.round(formDuration.value * 60);
    }
  } else {
    durationUnit.value = "min";
    if (formDuration.value != null) {
      formDuration.value = Math.round((formDuration.value / 60) * 100) / 100;
    }
  }
}

function applyFormData(data: ExerciseFormData | null | undefined) {
  isApplyingPrefill.value = true;
  const normalizedName = data?.exerciseName?.trim().toLowerCase() ?? "";
  const isSameExercise = Boolean(
    normalizedName && normalizedName === lastConfiguredExerciseName.value,
  );
  if (normalizedName) {
    lastConfiguredExerciseName.value = normalizedName;
  }

  if (!isSameExercise) {
    weightStep.value = 2.5;
  }

  if (data) {
    formExerciseName.value = data.exerciseName;
    formReps.value = data.reps ?? null;
    formWeight.value = data.weight ?? null;
    applyDistanceAndDuration(
      data.distance,
      data.duration,
      isSameExercise && showExtraMetrics.value,
    );
    formRpe.value = data.rpe ?? (deloadStore.active ? 6 : 8.5);
    isRpeEnabled.value = data.rpe != null;
  } else {
    formExerciseName.value = "";
    formReps.value = null;
    formWeight.value = null;
    applyDistanceAndDuration(null, null, false);
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
    isProgressionExpanded.value = false;
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
  isProgressionExpanded.value = false;
  if (!name || isApplyingPrefill.value) return;

  const normalizedName = name.trim().toLowerCase();
  const isSameExercise = Boolean(
    normalizedName && normalizedName === lastConfiguredExerciseName.value,
  );
  if (normalizedName) {
    lastConfiguredExerciseName.value = normalizedName;
  }

  if (!isSameExercise) {
    weightStep.value = 2.5;
  }

  const lastLog = logsStore.lastLogForExercise(name);
  formReps.value = lastLog?.reps ?? null;
  formWeight.value = lastLog?.weight ?? null;
  applyDistanceAndDuration(
    lastLog?.distance,
    lastLog?.duration,
    isSameExercise && showExtraMetrics.value,
  );
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

const exerciseLogsForCurrentName = computed(() => {
  const name = formExerciseName.value.trim().toLowerCase();
  if (!name) return [];
  return exerciseLogs.value.filter((l) => l.exerciseName.trim().toLowerCase() === name);
});

const exerciseProgression = computed(() => {
  return buildExerciseProgression(exerciseLogsForCurrentName.value);
});

const exercisePrSummary = computed(() => {
  return computeExercisePr(exerciseLogsForCurrentName.value);
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

  const canonicalDistance =
    formDistance.value != null
      ? distanceUnit.value === "km"
        ? Math.round(formDistance.value * 1000)
        : formDistance.value
      : undefined;

  const canonicalDuration =
    formDuration.value != null
      ? durationUnit.value === "sec"
        ? Math.round((formDuration.value / 60) * 100) / 100
        : formDuration.value
      : undefined;

  const log: ExerciseLog = {
    id: props.logToEdit?.id || crypto.randomUUID(),
    exerciseName: formExerciseName.value,
    reps: formReps.value ?? undefined,
    weight: formWeight.value ?? undefined,
    distance: canonicalDistance,
    duration: canonicalDuration,
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
    title-class="text-xl font-black"
  >
    <!-- Scrollable Form Content -->
    <div class="flex flex-col gap-5 overflow-y-auto px-6 py-4 no-scrollbar flex-1 min-h-0">
      <!-- Optimized Exercise Selection -->
      <ExerciseSelector
        v-model="formExerciseName"
        :options="exerciseOptions"
        :option-details="exerciseOptionDetails"
        placeholder="Select or Search Exercise..."
        class="bg-card shrink-0"
      />

      <!-- Collapsible Progression History -->
      <div
        v-if="exerciseProgression && exerciseProgression.length > 0"
        class="rounded-xl border border-white/5 bg-card/40 backdrop-blur-sm overflow-hidden shrink-0"
      >
        <button
          type="button"
          :aria-expanded="isProgressionExpanded"
          aria-controls="exercise-progression-history"
          @click="isProgressionExpanded = !isProgressionExpanded"
          class="w-full flex items-center justify-between p-3.5 hover:bg-white/5 active:scale-95 transition-all text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="text-micro font-bold uppercase tracking-wider text-muted-foreground/80">
              Progression
            </span>
            <UiBadge
              v-if="exercisePrSummary"
              variant="outline"
              class="text-micro font-bold uppercase tracking-wider text-primary border-primary/20 bg-primary/10 px-2 py-0.5 truncate"
            >
              {{ exercisePrSummary }}
            </UiBadge>
          </div>

          <div class="flex items-center gap-1.5 shrink-0 ml-2">
            <span class="text-micro font-bold uppercase tracking-wider text-muted-foreground/50">
              History
            </span>
            <ChevronDown
              class="w-4 h-4 text-muted-foreground/60 transition-transform duration-200"
              :class="isProgressionExpanded ? 'rotate-180 text-primary' : ''"
            />
          </div>
        </button>

        <div
          v-show="isProgressionExpanded"
          id="exercise-progression-history"
          class="px-3 pb-3 pt-2 border-t border-white/5 shrink-0 animate-in fade-in duration-200"
        >
          <UiProgressionLine :sessions="exerciseProgression" class="w-full shrink-0" />
        </div>
      </div>
      
      <!-- Metrics -->
      <div class="flex flex-col gap-3 shrink-0">
        <div class="grid grid-cols-2 gap-4">
          <UiNumberField v-model="formReps" label="Reps" :min="0" :step="1" />
          <UiNumberField
            v-model="formWeight"
            label="Weight (kg)"
            :min="0"
            :step="weightStep"
            :description="isDumbbellExercise ? 'Total (both hands)' : undefined"
          >
            <template #label-trailing>
              <UiButton
                variant="tonal"
                size="micro"
                data-testid="weight-step-toggle"
                aria-label="Cycle weight step size"
                @click="cycleWeightStep"
              >
                ±{{ weightStep }}
              </UiButton>
            </template>
          </UiNumberField>
        </div>

        <div v-if="showExtraMetrics" class="grid grid-cols-2 gap-4 animate-in fade-in duration-200">
          <UiNumberField
            v-model="formDistance"
            label="Distance"
            :min="0"
            :step="distanceStep"
          >
            <template #label-trailing>
              <UiButton
                variant="tonal"
                size="micro"
                data-testid="distance-unit-toggle"
                aria-label="Toggle distance unit and step size"
                @click="toggleDistanceUnit"
              >
                {{ distanceUnit === 'm' ? 'm · ±50' : 'km · ±0.5' }}
              </UiButton>
            </template>
          </UiNumberField>

          <UiNumberField
            v-model="formDuration"
            label="Duration"
            :min="0"
            :step="durationStep"
          >
            <template #label-trailing>
              <UiButton
                variant="tonal"
                size="micro"
                data-testid="duration-unit-toggle"
                aria-label="Toggle duration unit and step size"
                @click="toggleDurationUnit"
              >
                {{ durationUnit === 'min' ? 'min · ±1' : 'sec · ±5' }}
              </UiButton>
            </template>
          </UiNumberField>
        </div>

        <UiButton
          v-else
          variant="chip"
          size="xs"
          data-testid="toggle-extra-metrics"
          class="self-start"
          @click="showExtraMetrics = true"
        >
          <Plus class="w-3.5 h-3.5 text-primary shrink-0" />
          <span>Distance &amp; Duration</span>
        </UiButton>
      </div>

      <!-- RPE Slider -->
      <div class="space-y-3 px-1 mt-1 shrink-0">
        <div class="flex items-center justify-between">
          <span class="text-micro font-bold uppercase tracking-wider text-muted-foreground/60">Effort (RPE)</span>
          <span
            class="text-xs font-bold transition-colors duration-200"
            :class="isRpeEnabled ? 'text-primary' : 'text-muted-foreground/50'"
          >
            {{ isRpeEnabled ? rpeLabel : 'Optional' }}
          </span>
        </div>
        
        <div class="h-6 flex items-center gap-4">
          <label class="relative inline-flex items-center cursor-pointer shrink-0 w-9 h-5">
            <input
              type="checkbox"
              v-model="isRpeEnabled"
              aria-label="Enable RPE tracking"
              class="sr-only peer"
            />
            <div class="w-full h-full bg-white/10 rounded-full peer peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-checked:bg-primary transition-colors duration-200 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform after:duration-200 peer-checked:after:translate-x-4 shadow-sm"></div>
          </label>
          
          <input 
            type="range" 
            min="6" 
            max="10" 
            step="0.5" 
            v-model.number="formRpe"
            aria-label="Effort (RPE)"
            @input="isRpeEnabled = true"
            @change="isRpeEnabled = true"
            @click="isRpeEnabled = true"
            @pointerdown.stop
            @touchstart.stop
            @touchmove.stop
            class="w-full h-2 bg-white/5 rounded-lg appearance-none accent-primary cursor-pointer transition-opacity duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            :class="isRpeEnabled ? 'opacity-100' : 'opacity-40 hover:opacity-70'"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex gap-3">
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
    </template>
  </UiBottomSheet>
</template>
