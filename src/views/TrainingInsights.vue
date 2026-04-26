<script setup lang="ts">
import { ArrowLeft, HelpCircle, Moon, Scale, TrendingDown, TrendingUp } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import AppHeader from "@/components/ui/AppHeader.vue";
import Button from "@/components/ui/Button.vue";
import MuscleActivationMap from "@/components/ui/MuscleActivationMap.vue";
import UiCard from "@/components/ui/UiCard.vue";
import UiSegmentedControl from "@/components/ui/UiSegmentedControl.vue";
import { getLearnedMuscleMap } from "@/services/exerciseMuscleMap";
import {
  calculateTrainingInsights,
  getMuscleActivation,
  type MuscleGroupInsight,
  type TrainingInsights,
} from "@/services/trainingScience";
import { summaryToExerciseLogs } from "@/services/trainingSummary";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";
import { useTrainingSummaryStore } from "@/stores/trainingSummary";

const logsStore = useExerciseLogsStore();
const summaryStore = useTrainingSummaryStore();
const { exerciseLogs } = storeToRefs(logsStore);

const insights = computed(() => {
  const historicalLogs = summaryToExerciseLogs(summaryStore.summaries);
  const currentLogs = exerciseLogs.value;
  const allLogs = [...historicalLogs, ...currentLogs];
  const learnedMap = getLearnedMuscleMap();
  return calculateTrainingInsights(allLogs, new Date(), learnedMap);
});

type Tab = "map" | "phase" | "exercises";
const activeTab = ref<Tab>("map");
const tabOptions = [
  { id: "map", label: "Muscles" },
  { id: "phase", label: "Training Phase" },
  { id: "exercises", label: "Exercises" },
] as const;

// Phase color and label
const phaseDisplay = computed(() => {
  switch (insights.value.phase) {
    case "Deload":
      return {
        color: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
        label: "DELOAD WEEK",
        icon: TrendingDown,
      };
    case "Build":
      return {
        color: "bg-green-500/20 text-green-400 border border-green-500/30",
        label: "BUILDING",
        icon: TrendingUp,
      };
    case "Maintain":
      return {
        color: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30",
        label: "MAINTAINING",
        icon: Scale,
      };
    case "Inactive":
      return {
        color: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
        label: "INACTIVE",
        icon: Moon,
      };
    default:
      return { color: "bg-muted text-muted-foreground", label: "?", icon: HelpCircle };
  }
});

// ACWR status
const acwrDisplay = computed(() => {
  const ratio = insights.value.acwr;
  if (ratio === null)
    return {
      color: "text-muted-foreground",
      label: "No data",
      detail: "Log more workouts",
      barPct: 0,
      safe: true,
    };
  if (ratio > 1.5)
    return {
      color: "text-red-400",
      label: "High risk",
      detail: "Reduce volume now",
      barPct: Math.min((ratio / 2) * 100, 100),
      safe: false,
    };
  if (ratio > 1.3)
    return {
      color: "text-orange-400",
      label: "Elevated",
      detail: "Take it easy today",
      barPct: Math.min((ratio / 2) * 100, 100),
      safe: false,
    };
  if (ratio < 0.8)
    return {
      color: "text-blue-400",
      label: "Underloaded",
      detail: "Capacity to add more",
      barPct: Math.min((ratio / 2) * 100, 100),
      safe: true,
    };
  return {
    color: "text-green-400",
    label: "Safe zone",
    detail: "Load well-balanced",
    barPct: Math.min((ratio / 2) * 100, 100),
    safe: true,
  };
});

// Mesocycle context label (non-redundant with phase)
const mesocycleContext = computed(() => {
  const wk = insights.value.mesocycleWeek;
  if (wk === 0) return { label: "Deload active", sub: "Reduce intensity & volume" };
  if (wk === 1) return { label: `Week ${wk} of 4`, sub: "Foundation — build base" };
  if (wk === 2) return { label: `Week ${wk} of 4`, sub: "Progressive — increase load" };
  if (wk === 3) return { label: `Week ${wk} of 4`, sub: "Peak approach — push hard" };
  return { label: `Week ${wk} of 4`, sub: "Peak week — deload follows" };
});

// Phase interpretation
const phaseInterpretation = computed(() => {
  switch (insights.value.phase) {
    case "Deload":
      return "Focus on recovery and form. Reduce load by 40–50% and volume by 50%.";
    case "Build":
      return "Actively increasing volume. Push for progressive overload.";
    case "Maintain":
      return "Volume is stable. Preserve current gains while staying healthy.";
    case "Inactive":
      return "Below minimum volume. Time to ramp up training.";
    default:
      return "";
  }
});

const muscleInsightsList = computed((): MuscleGroupInsight[] =>
  Object.values(insights.value.muscleGroups).filter(
    (insight): insight is MuscleGroupInsight => insight !== undefined,
  ),
);

const maintenanceLikeCount = computed(
  () =>
    muscleInsightsList.value.filter(
      (insight) => insight.landmark === "at_MEV" || insight.landmark === "at_MAV",
    ).length,
);

const totalMuscleGroups = computed(() => muscleInsightsList.value.length);

const notRecoveredCount = computed(
  () => muscleInsightsList.value.filter((insight) => !insight.recoveryReady).length,
);

const weeklySetSummary = computed(() => {
  const weeklySets = insights.value.fatigue.weeklyTotalSets;
  const thisWeekSets = weeklySets[3] ?? 0;
  const previousWeekSets = weeklySets[2] ?? 0;
  const priorThreeWeekAvg =
    weeklySets.length >= 4
      ? ((weeklySets[0] ?? 0) + (weeklySets[1] ?? 0) + (weeklySets[2] ?? 0)) / 3
      : null;

  const deltaPct =
    priorThreeWeekAvg && priorThreeWeekAvg > 0
      ? Math.round(((thisWeekSets - priorThreeWeekAvg) / priorThreeWeekAvg) * 100)
      : null;

  return {
    thisWeekSets,
    previousWeekSets,
    priorThreeWeekAvg,
    deltaPct,
  };
});

const acwrValueLabel = computed(() =>
  insights.value.acwr === null ? "No baseline" : insights.value.acwr.toFixed(2),
);

const weeklyDeltaLabel = computed(() => {
  const pct = weeklySetSummary.value.deltaPct;
  if (pct === null) return "Not enough history";
  if (pct > 0) return `+${pct}%`;
  return `${pct}%`;
});

const tonnageDeltaPct = computed(() => {
  const weeklyTonnage = insights.value.fatigue.weeklyTonnage;
  if (weeklyTonnage.length < 4) return null;

  const priorAvg =
    ((weeklyTonnage[0] ?? 0) + (weeklyTonnage[1] ?? 0) + (weeklyTonnage[2] ?? 0)) / 3;
  if (priorAvg <= 0) return null;

  const delta = (((weeklyTonnage[3] ?? 0) - priorAvg) / priorAvg) * 100;
  return Math.round(delta);
});

const hasPhaseEvidence = computed(
  () =>
    Number.isFinite(weeklySetSummary.value.thisWeekSets) &&
    Number.isFinite(maintenanceLikeCount.value) &&
    Number.isFinite(totalMuscleGroups.value) &&
    Number.isFinite(notRecoveredCount.value),
);

const fatigueTriggerEvidence = computed(() => {
  const weeklySets = insights.value.fatigue.weeklyTotalSets;
  const weeklyTonnage = insights.value.fatigue.weeklyTonnage;

  const thisWeekSets = weeklySets[3] ?? 0;
  const prevWeekSets = weeklySets[2] ?? 0;
  const priorSetsAvg =
    weeklySets.length >= 4
      ? ((weeklySets[0] ?? 0) + (weeklySets[1] ?? 0) + (weeklySets[2] ?? 0)) / 3
      : 0;

  const thisWeekTonnage = weeklyTonnage[3] ?? 0;
  const priorTonnageAvg =
    weeklyTonnage.length >= 4
      ? ((weeklyTonnage[0] ?? 0) + (weeklyTonnage[1] ?? 0) + (weeklyTonnage[2] ?? 0)) / 3
      : 0;

  const volumeIncreasing =
    weeklySets.length >= 4 &&
    weeklySets.every((sets, i) => i === 0 || sets > (weeklySets[i - 1] ?? 0));

  const volumeSpike = priorSetsAvg >= 12 && thisWeekSets > priorSetsAvg * 1.25;

  let decliningExercises = 0;
  for (const data of Object.values(insights.value.e1rm)) {
    if (data.trend.length >= 3) {
      const current = data.trend[data.trend.length - 1] ?? 0;
      const prior2Avg =
        ((data.trend[data.trend.length - 2] ?? 0) + (data.trend[data.trend.length - 3] ?? 0)) / 2;
      if (prior2Avg > 0 && current < prior2Avg * 0.95) decliningExercises++;
    }
  }

  const performanceDecline = decliningExercises >= 2;
  const tonnageSpike = priorTonnageAvg > 0 && thisWeekTonnage > priorTonnageAvg * 1.5;

  const inactiveTrigger = thisWeekSets + prevWeekSets < 24;
  const returningAthlete = prevWeekSets === 0 && thisWeekSets > 0;
  const buildTrigger = thisWeekSets > prevWeekSets && thisWeekSets >= 10;

  return {
    volumeIncreasing,
    volumeSpike,
    decliningExercises,
    performanceDecline,
    tonnageSpike,
    inactiveTrigger,
    returningAthlete,
    buildTrigger,
  };
});

// ── Mesocycle stepper ──────────────────────────────────────────────────────

const isDeloadActive = computed(() => insights.value.mesocycleWeek === 0);

type StepState = "done" | "current" | "overdue" | "future";

const mesocycleSteps = computed(() => {
  const wk = insights.value.mesocycleWeek;
  function stateFor(n: number): StepState {
    if (wk === 0) return "future";
    if (wk > 4 && n === 4) return "overdue";
    if (n < wk) return "done";
    if (n === wk) return "current";
    return "future";
  }
  return [
    { week: 1, label: "Found.", state: stateFor(1) },
    { week: 2, label: "Build", state: stateFor(2) },
    { week: 3, label: "Push", state: stateFor(3) },
    { week: 4, label: "Peak", state: stateFor(4) },
  ];
});

// ── Deload pressure pills (derived after fatigueTriggerEvidence) ───────────

const deloadTriggerPills = computed(() => {
  const e = fatigueTriggerEvidence.value;
  return [
    { id: "vol-spike", label: "Vol spike", active: e.volumeSpike },
    { id: "4wk-ramp", label: "4wk ramp", active: e.volumeIncreasing },
    { id: "strength", label: "Strength", active: e.performanceDecline },
    { id: "tonnage", label: "Tonnage", active: e.tonnageSpike },
  ];
});

const deloadPressureCount = computed(() => deloadTriggerPills.value.filter((t) => t.active).length);

type ExerciseMetric = {
  name: string;
  e1rm: number;
  deltaPct: number | null;
  plateau: boolean;
  bestRPE: number | null;
  learnedMuscleGroups: string[];
  status: "plateau" | "improving" | "dropping" | "stable";
};

const exerciseMetrics = computed((): ExerciseMetric[] => {
  return Object.entries(insights.value.e1rm)
    .map(([name, data]) => {
      const trend = data.trend;
      const current = trend[trend.length - 1] ?? data.e1rm;
      const previous = trend.length >= 2 ? (trend[trend.length - 2] ?? null) : null;
      const deltaPct =
        previous && previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

      let status: ExerciseMetric["status"] = "stable";
      if (data.plateau) status = "plateau";
      else if (deltaPct !== null && deltaPct >= 2) status = "improving";
      else if (deltaPct !== null && deltaPct <= -2) status = "dropping";

      const activation = getMuscleActivation(name);
      const learnedMuscleGroups = activation
        ? [activation.primaryMuscle, ...activation.secondaryMuscles.map((m) => m.muscleGroup)]
        : [];

      return {
        name,
        e1rm: current,
        deltaPct,
        plateau: data.plateau,
        bestRPE: data.bestRPE ?? null,
        learnedMuscleGroups: Array.from(new Set(learnedMuscleGroups)),
        status,
      };
    })
    .sort((a, b) => {
      if (a.plateau !== b.plateau) return a.plateau ? -1 : 1;
      const aMag = Math.abs(a.deltaPct ?? 0);
      const bMag = Math.abs(b.deltaPct ?? 0);
      if (aMag !== bMag) return bMag - aMag;
      return b.e1rm - a.e1rm;
    });
});

const totalExerciseCount = computed(() => exerciseMetrics.value.length);
const plateauExerciseCount = computed(() => exerciseMetrics.value.filter((m) => m.plateau).length);
const improvingExerciseCount = computed(
  () => exerciseMetrics.value.filter((m) => m.status === "improving").length,
);
const droppingExerciseCount = computed(
  () => exerciseMetrics.value.filter((m) => m.status === "dropping").length,
);
const averageBestRPE = computed(() => {
  const vals = exerciseMetrics.value.map((m) => m.bestRPE).filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return vals.reduce((sum, v) => sum + v, 0) / vals.length;
});

type TriggerRow = {
  id: string;
  group: "Deload Triggers" | "Phase Triggers" | "Risk Context";
  metric: string;
  value: string;
  reference: string;
  active: boolean;
  gaugePct: number | null;
};

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

const triggerRows = computed((): TriggerRow[] => {
  const e = fatigueTriggerEvidence.value;
  const weeklyDelta = weeklySetSummary.value.deltaPct ?? 0;
  const tonnageDelta = tonnageDeltaPct.value;
  const twoWeekSets = weeklySetSummary.value.thisWeekSets + weeklySetSummary.value.previousWeekSets;
  const buildDeltaSets =
    weeklySetSummary.value.thisWeekSets - weeklySetSummary.value.previousWeekSets;

  return [
    {
      id: "deload-volume-spike",
      group: "Deload Triggers",
      metric: "Deload: Set volume spike",
      value: weeklyDeltaLabel.value,
      reference: "Trigger above +25% (with baseline >= 12 sets)",
      active: e.volumeSpike,
      gaugePct: clampPct((weeklyDelta / 25) * 100),
    },
    {
      id: "deload-4wk-ramp",
      group: "Deload Triggers",
      metric: "Deload: 4-week set ramp",
      value: e.volumeIncreasing ? "Increasing" : "Not increasing",
      reference: "Trigger: 4 consecutive weekly increases",
      active: e.volumeIncreasing,
      gaugePct: null,
    },
    {
      id: "deload-strength-drop",
      group: "Deload Triggers",
      metric: "Deload: Strength decline",
      value: `${e.decliningExercises} exercises`,
      reference: "Trigger at >= 2 declining exercises",
      active: e.performanceDecline,
      gaugePct: clampPct((e.decliningExercises / 2) * 100),
    },
    {
      id: "deload-tonnage-spike",
      group: "Deload Triggers",
      metric: "Deload: Tonnage spike",
      value: tonnageDelta === null ? "N/A" : `${tonnageDelta > 0 ? "+" : ""}${tonnageDelta}%`,
      reference: "Trigger above +50%",
      active: e.tonnageSpike,
      gaugePct: tonnageDelta === null ? null : clampPct((tonnageDelta / 50) * 100),
    },
    {
      id: "inactive-threshold",
      group: "Phase Triggers",
      metric: "Inactive: Last 2-week sets",
      value: `${twoWeekSets} sets`,
      reference: "Trigger below 24 sets",
      active: e.inactiveTrigger,
      gaugePct: clampPct(((24 - twoWeekSets) / 24) * 100),
    },
    {
      id: "maintain-returning",
      group: "Phase Triggers",
      metric: "Maintain: Returning athlete",
      value: e.returningAthlete ? "Yes" : "No",
      reference: "Trigger when prev week = 0 and this week > 0",
      active: e.returningAthlete,
      gaugePct: null,
    },
    {
      id: "build-trend",
      group: "Phase Triggers",
      metric: "Build: Weekly progression",
      value: `${weeklySetSummary.value.previousWeekSets} → ${weeklySetSummary.value.thisWeekSets} sets`,
      reference: "Trigger when this week > prev and this week >= 10",
      active: e.buildTrigger,
      gaugePct: clampPct((weeklySetSummary.value.thisWeekSets / 10) * 100),
    },
    {
      id: "acwr-context",
      group: "Risk Context",
      metric: "Short-term injury risk (ACWR)",
      value: `${acwrValueLabel.value} · ${acwrDisplay.value.label}`,
      reference: "Safe range 0.8–1.3 · not a primary phase trigger",
      active: insights.value.acwr !== null && !acwrDisplay.value.safe,
      gaugePct: insights.value.acwr === null ? null : clampPct((insights.value.acwr / 1.3) * 100),
    },
  ];
});
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col pt-safe">
    <AppHeader>
      <Button variant="ghost" size="icon" @click="$router.back()">
        <ArrowLeft class="w-5 h-5" />
      </Button>
      <div class="flex-1 max-w-[300px] ml-2">
        <UiSegmentedControl
          :options="tabOptions"
          v-model="activeTab"
        />
      </div>
      <div class="w-10"></div> <!-- Spacer to center the segmented control relative to the back button -->
    </AppHeader>

    <main class="flex-1 flex flex-col pt-4 px-4 pb-12 overflow-y-auto no-scrollbar gap-4">

      <!-- ── TAB: Muscle Activation Map ── -->
      <template v-if="activeTab === 'map'">
        <div class="overflow-hidden rounded-xl">
          <MuscleActivationMap :muscle-groups="insights.muscleGroups" />
        </div>
      </template>

      <!-- ── TAB: Training Phase ── -->
      <template v-else-if="activeTab === 'phase'">

      <!-- MESOCYCLE CARD — cycle position + deload pressure -->
      <UiCard class="p-4 overflow-visible">
        <!-- Header -->
        <div class="flex items-center justify-between gap-2 mb-4">
          <div>
            <p class="text-xs font-black uppercase tracking-wide text-foreground/90">Mesocycle</p>
            <p class="text-[10px] text-foreground/50 mt-0.5">
              {{ isDeloadActive ? 'Deload active — reset & recover' : mesocycleContext.label + ' · ' + mesocycleContext.sub }}
            </p>
          </div>
          <span :class="phaseDisplay.color + ' text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 flex items-center gap-1'">
            <component :is="phaseDisplay.icon" class="w-3 h-3" />
            {{ phaseDisplay.label }}
          </span>
        </div>

        <!-- Week stepper -->
        <div class="flex items-start">
          <template v-for="(step, i) in mesocycleSteps" :key="step.week">
            <div class="flex flex-col items-center gap-1 w-12">
              <div
                class="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold border transition-all duration-300"
                :class="{
                  'bg-green-500/15 text-green-400/80 border-green-500/25': step.state === 'done',
                  'bg-white/15 text-foreground border-white/40 shadow-[0_0_0_3px_rgba(255,255,255,0.10)]': step.state === 'current',
                  'bg-red-500/15 text-red-400 border-red-500/40 animate-pulse': step.state === 'overdue',
                  'bg-white/5 text-foreground/25 border-white/8': step.state === 'future',
                }"
              >W{{ step.week }}</div>
              <span class="text-[8px] text-foreground/40 text-center leading-tight">{{ step.label }}</span>
            </div>
            <div v-if="i < 3" class="flex-1 h-[2px] mt-4 min-w-2 rounded-full transition-all duration-500"
              :class="step.state === 'done' ? 'bg-gradient-to-r from-green-500/50 to-green-500/10' : 'bg-white/10'"></div>
          </template>

          <!-- → arrow -->
          <span class="text-foreground/25 text-base mx-1 mt-2">→</span>

          <!-- Deload node -->
          <div class="flex flex-col items-center gap-1 w-14">
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center text-sm border transition-all duration-500"
              :class="isDeloadActive
                ? 'bg-orange-500/30 text-orange-400 border-orange-500/50 shadow-[0_0_15px_rgba(251,146,60,0.6)] animate-pulse'
                : 'bg-white/5 text-foreground/25 border-white/8'"
            >↺</div>
            <span
              class="text-[8px] text-center leading-tight font-bold"
              :class="isDeloadActive ? 'text-orange-400' : 'text-foreground/35'"
            >Deload</span>
          </div>
        </div>

        <!-- Phase interpretation -->
        <p v-if="phaseInterpretation" class="mt-3 text-[10px] text-foreground/55 leading-relaxed">
          {{ phaseInterpretation }}
        </p>

        <!-- Deload pressure -->
        <div class="mt-4">
          <div class="flex items-center justify-between text-[10px] mb-2">
            <span class="font-semibold uppercase tracking-wide text-foreground/50">Deload pressure</span>
            <span :class="deloadPressureCount >= 2 ? 'text-orange-400 font-bold' : 'text-foreground/45'">
              {{ deloadPressureCount }} / 4 triggers
            </span>
          </div>
          <!-- 4 trigger pills -->
          <div class="grid grid-cols-4 gap-1.5">
            <div
              v-for="t in deloadTriggerPills"
              :key="t.id"
              class="flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg border transition-all duration-300"
              :class="t.active
                ? 'bg-orange-500/10 border-orange-500/30'
                : 'bg-white/[0.03] border-white/8'"
            >
              <span
                class="h-2 w-2 rounded-full transition-all duration-300"
                :class="t.active ? 'bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.8)]' : 'bg-white/20'"
              ></span>
              <span
                class="text-[8px] text-center leading-tight"
                :class="t.active ? 'text-orange-300' : 'text-foreground/40'"
              >{{ t.label }}</span>
            </div>
          </div>
          <!-- Pressure bar -->
          <div class="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-700"
              :class="{
                'bg-orange-400': deloadPressureCount >= 3,
                'bg-yellow-400': deloadPressureCount === 2,
                'bg-emerald-400/80': deloadPressureCount < 2,
              }"
              :style="{ width: (deloadPressureCount / 4 * 100) + '%' }"
            ></div>
          </div>
        </div>
      </UiCard>

  <!-- TRIGGER DETAILS — full audit table -->
  <UiCard class="p-4 min-h-[240px] overflow-visible">
        <div class="flex items-center justify-between gap-2 mb-1">
          <p class="text-xs font-black uppercase tracking-wide text-foreground opacity-90">
            Trigger Details
          </p>
        </div>
        <div
          v-if="hasPhaseEvidence"
          class="mt-3 rounded-lg border border-white/10 bg-white/[0.03]"
        >
          <div
            v-for="(row, index) in triggerRows"
            :key="row.id"
            class="px-3 py-2 text-xs transition-colors hover:bg-white/[0.02]"
            :class="(index > 0 && row.group === triggerRows[index - 1]?.group) ? 'border-t border-white/5' : ''"
          >
            <div
              v-if="index === 0 || row.group !== triggerRows[index - 1]?.group"
              class="mb-1.5 text-[10px] uppercase tracking-widest font-bold text-foreground/50"
              :class="index > 0 ? 'mt-3 pt-3 border-t border-white/10' : ''"
            >
              {{ row.group }}
            </div>
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 min-w-0">
                <span
                  class="h-2.5 w-2.5 rounded-full shrink-0 transition-all duration-500"
                  :class="row.active ? 'bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.8)]' : 'bg-emerald-400/50 shadow-[0_0_6px_rgba(16,185,129,0.2)]'"
                ></span>
                <div class="min-w-0">
                  <div class="text-foreground opacity-80 truncate">{{ row.metric }}</div>
                  <div class="text-[10px] text-foreground opacity-50 truncate">{{ row.reference }}</div>
                </div>
              </div>
              <div class="shrink-0 w-[112px]">
                <div class="text-right font-semibold" :class="row.active ? 'text-orange-300' : 'text-foreground opacity-85'">
                  {{ row.value }}
                </div>
                <div v-if="row.gaugePct !== null" class="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-500"
                    :class="row.active ? 'bg-orange-400' : 'bg-emerald-400/80'"
                    :style="{ width: row.gaugePct + '%' }"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          v-else
          class="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-foreground opacity-80"
        >
          Evidence is temporarily unavailable. Log data is still loading or incomplete.
        </div>
      </UiCard>

      </template>

      <!-- ── TAB: Exercises ── -->
      <template v-else-if="activeTab === 'exercises'">
        <UiCard class="p-4 overflow-visible">
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs font-black uppercase tracking-wide text-foreground/90">
              Exercise Metrics
            </p>
            <span class="text-[10px] text-foreground/60">
              {{ totalExerciseCount }} tracked
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 mt-3">
            <div class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <p class="text-[10px] uppercase tracking-wide text-foreground/50">Plateaus</p>
              <p class="text-sm font-bold text-orange-300">{{ plateauExerciseCount }}</p>
            </div>
            <div class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <p class="text-[10px] uppercase tracking-wide text-foreground/50">Improving</p>
              <p class="text-sm font-bold text-emerald-300">{{ improvingExerciseCount }}</p>
            </div>
            <div class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <p class="text-[10px] uppercase tracking-wide text-foreground/50">Dropping</p>
              <p class="text-sm font-bold text-red-300">{{ droppingExerciseCount }}</p>
            </div>
            <div class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <p class="text-[10px] uppercase tracking-wide text-foreground/50">Avg best RPE</p>
              <p class="text-sm font-bold text-foreground/85">
                {{ averageBestRPE === null ? "N/A" : averageBestRPE.toFixed(1) }}
              </p>
            </div>
          </div>
        </UiCard>

        <UiCard class="p-0 overflow-hidden">
          <div
            v-if="exerciseMetrics.length > 0"
            class="rounded-lg border border-white/10 bg-white/[0.03]"
          >
            <div
              v-for="(metric, index) in exerciseMetrics"
              :key="metric.name"
              class="px-3 py-2.5 transition-all duration-200 hover:bg-white/[0.02] active:scale-[0.98] select-none"
              :class="index > 0 ? 'border-t border-white/5' : ''"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-xs font-semibold text-foreground/90 truncate">{{ metric.name }}</p>
                  <div class="mt-1 flex items-center gap-2">
                    <span
                      class="text-[9px] px-1.5 py-0.5 rounded-full border"
                      :class="{
                        'bg-orange-500/10 text-orange-300 border-orange-500/30': metric.status === 'plateau',
                        'bg-emerald-500/10 text-emerald-300 border-emerald-500/30': metric.status === 'improving',
                        'bg-red-500/10 text-red-300 border-red-500/30': metric.status === 'dropping',
                        'bg-white/5 text-foreground/60 border-white/15': metric.status === 'stable',
                      }"
                    >
                      {{ metric.status === "plateau" ? "Plateau" : metric.status === "improving" ? "Improving" : metric.status === "dropping" ? "Dropping" : "Stable" }}
                    </span>
                    <span class="text-[10px] text-foreground/45">
                      Best RPE: {{ metric.bestRPE === null ? "N/A" : metric.bestRPE.toFixed(1) }}
                    </span>
                  </div>
                  <div class="mt-1 flex flex-wrap gap-1">
                    <span
                      v-for="group in metric.learnedMuscleGroups"
                      :key="`${metric.name}-${group}`"
                      class="text-[9px] px-1.5 py-0.5 rounded border border-white/15 bg-white/[0.03] text-foreground/55"
                    >
                      {{ group }}
                    </span>
                    <span
                      v-if="metric.learnedMuscleGroups.length === 0"
                      class="text-[9px] text-foreground/40"
                    >
                      No learned muscle groups yet
                    </span>
                  </div>
                </div>

                <div class="w-[120px] shrink-0">
                  <p class="text-right text-xs font-semibold text-foreground/85">
                    e1RM {{ metric.e1rm.toFixed(1) }}
                  </p>
                  <p
                    class="text-right text-[10px]"
                    :class="{
                      'text-emerald-300': metric.deltaPct !== null && metric.deltaPct > 0,
                      'text-red-300': metric.deltaPct !== null && metric.deltaPct < 0,
                      'text-foreground/45': metric.deltaPct === null || metric.deltaPct === 0,
                    }"
                  >
                    {{ metric.deltaPct === null ? "No trend" : `${metric.deltaPct > 0 ? "+" : ""}${metric.deltaPct}% vs prior` }}
                  </p>
                  <div class="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all duration-500"
                      :class="metric.deltaPct !== null && metric.deltaPct >= 2
                        ? 'bg-emerald-400/85'
                        : metric.deltaPct !== null && metric.deltaPct <= -2
                          ? 'bg-red-400/85'
                          : 'bg-white/30'"
                      :style="{ width: metric.deltaPct === null ? '16%' : `${clampPct(((metric.deltaPct + 10) / 20) * 100)}%` }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div
            v-else
            class="px-4 py-8 text-center text-xs text-foreground/55"
          >
            No exercise metrics yet. Add more workout logs to unlock trend analysis.
          </div>
        </UiCard>
      </template>

    </main>
  </div>
</template>
