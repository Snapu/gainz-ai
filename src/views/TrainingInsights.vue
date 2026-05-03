<script setup lang="ts">
import * as Sentry from "@sentry/vue";
import { ArrowLeft, HelpCircle, Moon, Scale, TrendingDown, TrendingUp } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";
import AppHeader from "@/components/AppHeader.vue";
import MuscleActivationMap from "@/components/MuscleActivationMap.vue";
import UiButton from "@/components/ui/UiButton.vue";
import UiCard from "@/components/ui/UiCard.vue";
import UiSegmentedControl from "@/components/ui/UiSegmentedControl.vue";
import { classifyExercises } from "@/services/ai";
import {
  calculateFatigueTriggerEvidence,
  calculateTrainingInsights,
  getMuscleActivation,
  summarizeTrainingInsights,
  type MuscleGroupInsight,
  normalizeExerciseName,
} from "@/services/trainingScience";
import { summaryToExerciseLogs } from "@/services/trainingSummary";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";
import { useExerciseMuscleMapStore } from "@/stores/exerciseMuscleMap";
import { useTrainingSummaryStore } from "@/stores/trainingSummary";
import { useDeloadLifecycleStore } from "@/stores/deloadLifecycle";
import { useUserProfileStore } from "@/stores/userProfile";

const logsStore = useExerciseLogsStore();
const summaryStore = useTrainingSummaryStore();
const profileStore = useUserProfileStore();
const deloadLifecycleStore = useDeloadLifecycleStore();
const muscleMapStore = useExerciseMuscleMapStore();
const { exerciseLogs } = storeToRefs(logsStore);
const { apiKey } = storeToRefs(profileStore);
const { learnedMap } = storeToRefs(muscleMapStore);

const allLogs = computed(() => {
  const historicalLogs = summaryToExerciseLogs(summaryStore.summaries);
  const currentLogs = exerciseLogs.value;
  return [...historicalLogs, ...currentLogs];
});

const insights = computed(() =>
  calculateTrainingInsights(
    allLogs.value,
    new Date(),
    learnedMap.value,
    profileStore.userProfile.weightKg,
    deloadLifecycleStore.deloadLifecycle,
  ),
);

function stopDeloadNow(): void {
  deloadLifecycleStore.stopDeloadNow();
}


// --- Automatic Exercise Cleanup ---

/**
 * Find exercise names in current-year logs that have no muscle group mapping.
 * These are candidates for AI classification.
 */
function findUnclassifiedExercises(): string[] {
  const seen = new Set<string>();
  const unclassified: string[] = [];

  for (const log of exerciseLogs.value) {
    const canonical = normalizeExerciseName(log.exerciseName);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    if (!getMuscleActivation(log.exerciseName, learnedMap.value)) {
      unclassified.push(log.exerciseName);
    }
  }
  return unclassified;
}

/**
 * Run AI classification for any unclassified exercises.
 * Fires automatically on mount when unclassified data is present.
 * Results are persisted to localStorage so subsequent opens skip re-classification.
 */
async function runExerciseCleanupIfNeeded(): Promise<void> {
  const unclassified = findUnclassifiedExercises();
  if (unclassified.length === 0) return;

  const result = await classifyExercises(unclassified, apiKey.value ?? undefined);
  if (result.isErr()) {
    Sentry.captureMessage("TrainingInsights exercise cleanup failed", {
      level: "warning",
      tags: { scope: "training-insights", feature: "exercise-cleanup" },
      extra: {
        reason: result.error,
        unclassifiedCount: unclassified.length,
      },
    });
    return;
  }

  muscleMapStore.applyCleanupResults(result.value);
}

onMounted(() => {
  runExerciseCleanupIfNeeded();
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

const coachSummary = computed(() => summarizeTrainingInsights(insights.value));

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

const fatigueTriggerEvidence = computed(() =>
  calculateFatigueTriggerEvidence(insights.value),
);

const exerciseStatusNote = computed(() => {
  if (insights.value.plateauPaused) {
    return "Plateau/drop labels are paused during deload.";
  }
  if (plateauExerciseCount.value > 0) {
    return plateauExerciseCount.value + " exercise" + (plateauExerciseCount.value === 1 ? " is" : "s are") + " plateauing. Check recovery before adding work.";
  }
  if (droppingExerciseCount.value > 0) {
    return droppingExerciseCount.value + " exercise" + (droppingExerciseCount.value === 1 ? " is" : "s are") + " trending down. Check fatigue before pushing.";
  }
  return "Exercise trends look stable.";
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
      const isDeloading = insights.value.plateauPaused;

      if (data.plateau) {
        status = isDeloading ? "stable" : "plateau";
      } else if (deltaPct !== null && deltaPct >= 2) {
        status = "improving";
      } else if (deltaPct !== null && deltaPct <= -2) {
        status = isDeloading ? "stable" : "dropping";
      }

      const activation = getMuscleActivation(name, learnedMap.value);
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
const plateauExerciseCount = computed(() => exerciseMetrics.value.filter((m) => m.status === "plateau").length);
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
      value: e.deloadTriggersPaused
        ? e.snapshotVolumeDeltaPct !== null
          ? `Was ${e.snapshotVolumeDeltaPct > 0 ? "+" : ""}${e.snapshotVolumeDeltaPct}%`
          : "Was triggered"
        : weeklyDeltaLabel.value,
      reference: "Trigger above +25% (with baseline >= 12 sets)",
      active: e.volumeSpike,
      gaugePct: e.deloadTriggersPaused
        ? e.snapshotVolumeDeltaPct !== null ? clampPct((e.snapshotVolumeDeltaPct / 25) * 100) : null
        : clampPct((weeklyDelta / 25) * 100),
    },
    {
      id: "deload-4wk-ramp",
      group: "Deload Triggers",
      metric: "Deload: 4-week set ramp",
      value: e.deloadTriggersPaused
        ? e.volumeIncreasing ? "Was increasing" : "Was not increasing"
        : e.volumeIncreasing ? "Increasing" : "Not increasing",
      reference: "Trigger: 4 consecutive weekly increases",
      active: e.volumeIncreasing,
      gaugePct: null,
    },
    {
      id: "deload-strength-drop",
      group: "Deload Triggers",
      metric: "Deload: Strength decline",
      value: e.deloadTriggersPaused
        ? `Was ${e.decliningExercises} exercises`
        : `${e.decliningExercises} exercises`,
      reference: "Trigger at >= 2 declining exercises",
      active: e.performanceDecline,
      gaugePct: clampPct((e.decliningExercises / 2) * 100),
    },
    {
      id: "deload-tonnage-spike",
      group: "Deload Triggers",
      metric: "Deload: Tonnage spike",
      value: e.deloadTriggersPaused
        ? e.snapshotTonnageDeltaPct !== null
          ? `Was ${e.snapshotTonnageDeltaPct > 0 ? "+" : ""}${e.snapshotTonnageDeltaPct}%`
          : "Was triggered"
        : tonnageDelta === null
          ? "N/A"
          : `${tonnageDelta > 0 ? "+" : ""}${tonnageDelta}%`,
      reference: "Trigger above +50%",
      active: e.tonnageSpike,
      gaugePct: e.deloadTriggersPaused
        ? e.snapshotTonnageDeltaPct !== null ? clampPct((e.snapshotTonnageDeltaPct / 50) * 100) : null
        : tonnageDelta === null ? null : clampPct((tonnageDelta / 50) * 100),
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
      <UiButton variant="ghost" size="icon" @click="$router.back()">
        <ArrowLeft class="w-5 h-5" />
      </UiButton>
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
      <UiCard class="p-4 overflow-visible">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-black uppercase tracking-wide text-foreground/90">Current Read</p>
            <p class="mt-1 text-lg font-semibold text-foreground/95">{{ coachSummary.headline }}</p>
            <p class="mt-1 text-[11px] text-foreground/65 leading-relaxed">{{ coachSummary.explanation }}</p>
          </div>
          <span :class="phaseDisplay.color + ' text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0 flex items-center gap-1'">
            <component :is="phaseDisplay.icon" class="w-3 h-3" />
            {{ phaseDisplay.label }}
          </span>
        </div>

        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <div class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <p class="text-[9px] uppercase tracking-wide text-foreground/45">Next</p>
            <p class="mt-1 text-[11px] text-foreground/80 leading-relaxed">{{ coachSummary.nextAction }}</p>
          </div>
          <div class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <p class="text-[9px] uppercase tracking-wide text-foreground/45">Source</p>
            <p class="mt-1 text-[11px] text-foreground/80 leading-relaxed">{{ coachSummary.transparency }}</p>
          </div>
        </div>

        <div v-if="insights.deloadStatus === 'active'" class="mt-3 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 space-y-2">
          <div>
            <p class="text-[9px] uppercase tracking-wider font-bold text-orange-400/70 mb-0.5">Deload reason</p>
            <p class="text-[11px] text-orange-200 leading-relaxed">{{ insights.fatigue.reason }}</p>
          </div>
          <p class="text-[10px] text-orange-300/60 leading-relaxed">
            Active until {{ new Date(insights.deloadEndsAt ?? "").toLocaleString() }}. The trigger view below is frozen to the start-of-deload snapshot.
          </p>
          <div class="flex justify-end">
            <UiButton size="sm" variant="outline" @click="stopDeloadNow">Stop Deload Now</UiButton>
          </div>
        </div>

        <div class="mt-4">
          <div class="flex items-center justify-between text-[10px] mb-2">
            <span class="font-semibold uppercase tracking-wide text-foreground/50">Deload pressure</span>
            <span :class="deloadPressureCount >= 2 ? 'text-orange-400 font-bold' : 'text-foreground/45'">
              {{ deloadPressureCount }} / 4 triggers
            </span>
          </div>
          <div class="grid grid-cols-4 gap-1.5">
            <div
              v-for="t in deloadTriggerPills"
              :key="t.id"
              class="flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg border transition-all duration-300"
              :class="t.active ? 'bg-orange-500/10 border-orange-500/30' : 'bg-white/[0.03] border-white/8'"
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
          class="mt-3"
        >
          <UiCard variant="list">
            <div
              v-for="(row, index) in triggerRows"
              :key="row.id"
              class="px-3 py-2 text-xs transition-colors hover:bg-white/[0.04]"
              :class="(index > 0 && row.group === triggerRows[index - 1]?.group) ? 'border-t border-white/5' : 'border-0'"
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
          </UiCard>
        </div>
        <div
          v-else
          class="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-foreground opacity-80"
        >
          Evidence unavailable. Data is still loading.
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

          <p class="mt-3 text-[11px] text-foreground/60 leading-relaxed">{{ exerciseStatusNote }}</p>

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

        <UiCard variant="list">
          <template v-if="exerciseMetrics.length > 0">
            <div
              v-for="metric in exerciseMetrics"
              :key="metric.name"
              class="px-3 py-2.5 transition-all duration-200 hover:bg-white/[0.04] active:bg-white/[0.06] select-none"
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
                      No muscle tags yet
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
          </template>
          <div
            v-else
            class="px-4 py-8 text-center text-xs text-foreground/55"
          >
            No exercise stats yet. Add more logs.
          </div>
        </UiCard>
      </template>

    </main>
  </div>
</template>
