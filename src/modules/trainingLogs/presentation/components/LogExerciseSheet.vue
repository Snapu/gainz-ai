<script setup lang="ts">
import { ChevronDown, Plus, Trash } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed, nextTick, ref, watch } from "vue";
import { useDeloadStore } from "@/modules/deload/presentation";
import { useRestTimerStore } from "@/modules/platform/presentation";
import { exerciseNameKey, formatDurationMinutes } from "@/modules/sharedKernel/presentation";
import type { ExerciseLog } from "@/modules/trainingLogs/presentation";
import {
  buildExerciseLogErrorToast,
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
import { t } from "@/shared/presentation/i18n";
import { formatRelativeDays } from "@/shared/presentation/i18n/formatters";
import { useLocale } from "@/shared/presentation/i18n/useLocale";

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
const { bcp47Locale } = useLocale();

const { exerciseLogs } = storeToRefs(logsStore);

const internalOpen = computed({
  get: () => props.open,
  set: (val) => emit("update:open", val),
});

const WEIGHT_STEPS = [0.5, 1, 2.5] as const;
const DEFAULT_WEIGHT_STEP = 1;
const DISTANCE_UNITS = ["m", "km"] as const;
const DISTANCE_STEPS = { m: [10, 50, 100], km: [0.1, 0.5, 1] } as const;
const DEFAULT_DISTANCE_STEP = { m: 50, km: 0.5 } as const;
const DURATION_UNITS = ["min", "sec"] as const;
const DURATION_STEPS = { min: [1, 5, 10], sec: [5, 15, 30] } as const;
const DEFAULT_DURATION_STEP = { min: 1, sec: 5 } as const;

type DistanceUnit = (typeof DISTANCE_UNITS)[number];
type DurationUnit = (typeof DURATION_UNITS)[number];

const formExerciseName = ref("");
const formReps = ref<number | null>(null);
const formWeight = ref<number | null>(null);
const formDistance = ref<number | null>(null);
const formDuration = ref<number | null>(null);
const formRpe = ref<number>(deloadStore.active ? 6 : 8.5);
const isRpeEnabled = ref(false);
const isApplyingPrefill = ref(false);
const isProgressionExpanded = ref(false);

const weightStep = ref<number>(DEFAULT_WEIGHT_STEP);
const distanceUnit = ref<DistanceUnit>("m");
const distanceStep = ref<number>(DEFAULT_DISTANCE_STEP.m);
const durationUnit = ref<DurationUnit>("min");
const durationStep = ref<number>(DEFAULT_DURATION_STEP.min);
const showExtraMetrics = ref(false);
const lastConfiguredExerciseName = ref("");

const stepFormatter = computed(
  () =>
    new Intl.NumberFormat(bcp47Locale.value, {
      useGrouping: false,
      maximumFractionDigits: 2,
    }),
);

function formatStepOption(step: number): string {
  return stepFormatter.value.format(step);
}

const pillGroupClass =
  "inline-flex items-center rounded-lg bg-white/5 p-0.5 border border-white/5 shrink-0";

function pillButtonClass(active: boolean): string {
  const base =
    "cursor-pointer rounded-lg px-2 py-0.5 text-micro font-bold tabular-nums transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";
  return active
    ? `${base} bg-primary/10 text-primary border border-primary/20`
    : `${base} text-muted-foreground border border-transparent hover:bg-white/5 hover:text-foreground`;
}

const activeDistanceSteps = computed(() => DISTANCE_STEPS[distanceUnit.value]);
const activeDurationSteps = computed(() => DURATION_STEPS[durationUnit.value]);

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
    distanceStep.value = DEFAULT_DISTANCE_STEP[distanceUnit.value];
    durationStep.value = DEFAULT_DURATION_STEP[durationUnit.value];
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

function selectDistanceUnit(nextUnit: DistanceUnit) {
  if (distanceUnit.value === nextUnit) return;
  distanceUnit.value = nextUnit;
  distanceStep.value = DEFAULT_DISTANCE_STEP[nextUnit];
  if (formDistance.value == null) return;
  formDistance.value =
    nextUnit === "km"
      ? Math.round(formDistance.value) / 1000
      : Math.round(formDistance.value * 1000);
}

function selectDurationUnit(nextUnit: DurationUnit) {
  if (durationUnit.value === nextUnit) return;
  durationUnit.value = nextUnit;
  durationStep.value = DEFAULT_DURATION_STEP[nextUnit];
  if (formDuration.value == null) return;
  formDuration.value =
    nextUnit === "sec"
      ? Math.round(formDuration.value * 60)
      : Math.round((formDuration.value / 60) * 100) / 100;
}

function applyFormData(data: ExerciseFormData | null | undefined) {
  isApplyingPrefill.value = true;
  const normalizedName = data?.exerciseName ? exerciseNameKey(data.exerciseName) : "";
  const isSameExercise = Boolean(
    normalizedName && normalizedName === lastConfiguredExerciseName.value,
  );
  if (normalizedName) {
    lastConfiguredExerciseName.value = normalizedName;
  }

  if (normalizedName && !isSameExercise) {
    weightStep.value = DEFAULT_WEIGHT_STEP;
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

  const normalizedName = exerciseNameKey(name);
  const isSameExercise = Boolean(
    normalizedName && normalizedName === lastConfiguredExerciseName.value,
  );
  if (normalizedName) {
    lastConfiguredExerciseName.value = normalizedName;
  }

  if (normalizedName && !isSameExercise) {
    weightStep.value = DEFAULT_WEIGHT_STEP;
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
    const key = exerciseNameKey(log.exerciseName);
    if (!latestByExercise.has(key)) {
      latestByExercise.set(key, log);
    }
  }

  return latestByExercise;
});

const exerciseOptions = computed(() => {
  return [...latestExerciseLogs.value.values()]
    .sort((left, right) => {
      const loggedAtDiff = right.loggedAt.getTime() - left.loggedAt.getTime();
      return loggedAtDiff !== 0
        ? loggedAtDiff
        : left.exerciseName.localeCompare(right.exerciseName);
    })
    .map((log) => log.exerciseName);
});

function formatMetric(value: number | undefined, suffix: string): string | null {
  if (typeof value !== "number") return null;
  return `${value}${suffix}`;
}

const exerciseOptionDetails = computed<Record<string, ExerciseSelectorOptionDetails>>(() => {
  return Object.fromEntries(
    exerciseOptions.value.map((exerciseName) => {
      const lastLog = latestExerciseLogs.value.get(exerciseNameKey(exerciseName));
      const formattedDur =
        typeof lastLog?.duration === "number" && lastLog.duration > 0
          ? formatDurationMinutes(lastLog.duration)
          : null;
      const durationMeta = formattedDur
        ? `${formattedDur.value} ${formattedDur.unit === "min" ? t("common.min") : t("common.s")}`
        : null;
      const meta = [
        formatMetric(lastLog?.weight, ` ${t("common.kg")}`),
        formatMetric(lastLog?.reps, ` ${t("common.reps")}`),
        formatMetric(lastLog?.distance, ` ${t("common.m")}`),
        durationMeta,
      ]
        .filter((label): label is string => Boolean(label))
        .map((label, index) => ({
          label,
          tone: index === 0 && lastLog?.weight ? ("primary" as const) : ("default" as const),
        }));

      return [
        exerciseName,
        {
          description: lastLog ? formatRelativeDays(lastLog.loggedAt) : undefined,
          meta,
        },
      ];
    }),
  );
});

const exerciseLogsForCurrentName = computed(() => {
  const name = exerciseNameKey(formExerciseName.value);
  if (!name) return [];
  return exerciseLogs.value.filter((l) => exerciseNameKey(l.exerciseName) === name);
});

const exerciseProgression = computed(() => {
  return buildExerciseProgression(exerciseLogsForCurrentName.value);
});

const exercisePrSummary = computed(() => {
  return computeExercisePr(exerciseLogsForCurrentName.value);
});

const rpeLabel = computed(() => {
  if (formRpe.value === 10) return t("logSheet.rpeLabels.rpe10");
  if (formRpe.value === 9.5) return t("logSheet.rpeLabels.rpe9_5");
  if (formRpe.value === 9) return t("logSheet.rpeLabels.rpe9");
  if (formRpe.value === 8.5) return t("logSheet.rpeLabels.rpe8_5");
  if (formRpe.value === 8) return t("logSheet.rpeLabels.rpe8");
  if (formRpe.value === 7.5) return t("logSheet.rpeLabels.rpe7_5");
  if (formRpe.value === 7) return t("logSheet.rpeLabels.rpe7");
  return t("logSheet.rpeLabels.lower", { rpe: formRpe.value });
});

async function saveLog() {
  if (!formExerciseName.value) {
    toast({ title: t("logSheet.nameRequired"), variant: "destructive" });
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

  const result = props.logToEdit
    ? await logsStore.updateExerciseLog(log)
    : await logsStore.addExerciseLog(log);

  result.match(
    (status) => {
      if (!props.logToEdit) {
        const DEFAULT_REST_SECONDS = 120; // 2 minutes generic fallback
        const matchesPrefilledExercise =
          !props.prefillData?.exerciseName ||
          exerciseNameKey(formExerciseName.value) ===
            exerciseNameKey(props.prefillData.exerciseName);
        restTimerStore.reset();
        restTimerStore.start(
          matchesPrefilledExercise
            ? (props.restSeconds ?? DEFAULT_REST_SECONDS)
            : DEFAULT_REST_SECONDS,
        );
      }
      if (status === "queued-offline") {
        toast({
          title: t("logSheet.savedOfflineTitle"),
          description: t("logSheet.savedOfflineDesc"),
        });
      }
      internalOpen.value = false;
      emit("saved");
    },
    (error) => {
      toast(buildExerciseLogErrorToast("save", error));
    },
  );
}

async function deleteLog() {
  if (!props.logToEdit) return;
  const result = await logsStore.removeExerciseLog(props.logToEdit);
  result.match(
    (status) => {
      if (status === "queued-offline") {
        toast({
          title: t("logSheet.deletedOfflineTitle"),
          description: t("logSheet.deletedOfflineDesc"),
        });
      }
      internalOpen.value = false;
      emit("saved");
    },
    (error) => {
      toast(buildExerciseLogErrorToast("delete", error));
    },
  );
}
</script>

<template>
  <UiBottomSheet 
    v-model:open="internalOpen" 
    :title="props.logToEdit ? t('logSheet.editSetTitle') : t('logSheet.logSetTitle')"
    title-class="text-xl font-black"
  >
    <!-- Scrollable Form Content -->
    <div class="flex flex-col gap-5 overflow-y-auto px-6 py-4 no-scrollbar flex-1 min-h-0">
      <!-- Optimized Exercise Selection -->
      <ExerciseSelector
        v-model="formExerciseName"
        :options="exerciseOptions"
        :option-details="exerciseOptionDetails"
        :placeholder="t('logSheet.selectPlaceholder')"
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
            <span class="text-micro tracking-widest text-muted-foreground">
              {{ t("logSheet.progression") }}
            </span>
            <UiBadge
              v-if="exercisePrSummary"
              variant="info"
              class="px-2 py-0.5 truncate"
            >
              {{ exercisePrSummary }}
            </UiBadge>
          </div>

          <div class="flex items-center gap-1.5 shrink-0 ml-2">
            <span class="text-micro text-muted-foreground/60">
              {{ t("logSheet.history") }}
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
        <div class="grid grid-cols-[1fr_2fr] gap-4">
          <UiNumberField
            v-model="formReps"
            layout="cross"
            :show-rounding="false"
            :label="t('logSheet.reps')"
            :min="0"
            :step="1"
          />
          <UiNumberField
            v-model="formWeight"
            layout="cross"
            :label="t('logSheet.weightKg')"
            :min="0"
            :step="weightStep"
            :description="isDumbbellExercise ? t('logSheet.dumbbellHint') : undefined"
          >
            <template #label-trailing>
              <div
                role="group"
                :aria-label="t('logSheet.weightStepGroupAria')"
                :class="pillGroupClass"
              >
                <button
                  v-for="step in WEIGHT_STEPS"
                  :key="step"
                  type="button"
                  data-testid="weight-step-option"
                  :data-step="step"
                  :aria-pressed="weightStep === step"
                  @click="weightStep = step"
                  :class="pillButtonClass(weightStep === step)"
                >
                  {{ formatStepOption(step) }}
                </button>
              </div>
            </template>
          </UiNumberField>
        </div>

        <div v-if="showExtraMetrics" class="flex flex-col gap-4 animate-in fade-in duration-200">
          <UiNumberField
            v-model="formDistance"
            layout="cross"
            :label="t('logSheet.distance')"
            :min="0"
            :step="distanceStep"
          >
            <template #label-trailing>
              <div class="flex items-center gap-2 shrink-0">
                <div
                  role="group"
                  :aria-label="t('logSheet.distanceUnitGroupAria')"
                  :class="pillGroupClass"
                >
                  <button
                    v-for="unit in DISTANCE_UNITS"
                    :key="unit"
                    type="button"
                    data-testid="distance-unit-option"
                    :data-unit="unit"
                    :aria-pressed="distanceUnit === unit"
                    @click="selectDistanceUnit(unit)"
                    :class="[pillButtonClass(distanceUnit === unit), 'normal-case']"
                  >
                    {{ t(`common.${unit}`) }}
                  </button>
                </div>
                <div
                  role="group"
                  :aria-label="t('logSheet.distanceStepGroupAria')"
                  :class="pillGroupClass"
                >
                  <button
                    v-for="step in activeDistanceSteps"
                    :key="step"
                    type="button"
                    data-testid="distance-step-option"
                    :data-step="step"
                    :aria-pressed="distanceStep === step"
                    @click="distanceStep = step"
                    :class="pillButtonClass(distanceStep === step)"
                  >
                    {{ formatStepOption(step) }}
                  </button>
                </div>
              </div>
            </template>
          </UiNumberField>

          <UiNumberField
            v-model="formDuration"
            layout="cross"
            :label="t('logSheet.duration')"
            :min="0"
            :step="durationStep"
          >
            <template #label-trailing>
              <div class="flex items-center gap-2 shrink-0">
                <div
                  role="group"
                  :aria-label="t('logSheet.durationUnitGroupAria')"
                  :class="pillGroupClass"
                >
                  <button
                    v-for="unit in DURATION_UNITS"
                    :key="unit"
                    type="button"
                    data-testid="duration-unit-option"
                    :data-unit="unit"
                    :aria-pressed="durationUnit === unit"
                    @click="selectDurationUnit(unit)"
                    :class="[pillButtonClass(durationUnit === unit), 'normal-case']"
                  >
                    {{ t(`common.${unit}`) }}
                  </button>
                </div>
                <div
                  role="group"
                  :aria-label="t('logSheet.durationStepGroupAria')"
                  :class="pillGroupClass"
                >
                  <button
                    v-for="step in activeDurationSteps"
                    :key="step"
                    type="button"
                    data-testid="duration-step-option"
                    :data-step="step"
                    :aria-pressed="durationStep === step"
                    @click="durationStep = step"
                    :class="pillButtonClass(durationStep === step)"
                  >
                    {{ formatStepOption(step) }}
                  </button>
                </div>
              </div>
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
          <span>{{ t("logSheet.extraMetricsChip") }}</span>
        </UiButton>
      </div>

      <!-- RPE Slider -->
      <div class="space-y-3 px-1 mt-1 shrink-0">
        <div class="flex items-center justify-between">
          <span class="text-micro text-muted-foreground/60">{{ t("logSheet.effortRpe") }}</span>
          <span
            class="text-xs font-bold tabular-nums transition-colors duration-200"
            :class="isRpeEnabled ? 'text-primary' : 'text-muted-foreground/50'"
          >
            {{ isRpeEnabled ? rpeLabel : t("common.optional") }}
          </span>
        </div>
        
        <div class="h-6 flex items-center gap-4">
          <label class="relative inline-flex items-center cursor-pointer shrink-0 w-9 h-5">
            <input
              type="checkbox"
              v-model="isRpeEnabled"
              :aria-label="t('logSheet.enableRpeAria')"
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
            :aria-label="t('logSheet.effortRpe')"
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
          :aria-label="t('logSheet.deleteSetAria')"
        >
          <Trash class="w-5 h-5" />
        </UiButton>
        <UiButton haptic class="flex-1 h-14 rounded-xl text-base font-bold shadow-lg shadow-primary/10 active:scale-95 transition-transform" @click="saveLog">
          {{ props.logToEdit ? t("logSheet.saveChanges") : t("logSheet.saveSet") }}
        </UiButton>
      </div>
    </template>
  </UiBottomSheet>
</template>
