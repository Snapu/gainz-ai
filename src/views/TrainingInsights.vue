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
import { getMuscleActivation, type MuscleGroupInsight } from "@/services/trainingScience/index";
import { useAiStore } from "@/stores/ai";
import { useDeloadStore } from "@/stores/deload";
import { useExerciseMuscleMapStore } from "@/stores/exerciseMuscleMap";
import { useTrainingInsightsStore } from "@/stores/trainingInsights";

const muscleMapStore = useExerciseMuscleMapStore();
const deloadStore = useDeloadStore();
const aiStore = useAiStore();
const trainingInsightsStore = useTrainingInsightsStore();
const { learnedMap } = storeToRefs(muscleMapStore);
const { insights } = storeToRefs(trainingInsightsStore);

const exerciseStatusNote = computed(() => {
  const { plateauPaused, plateauExerciseCount: _ } = {
    plateauPaused: insights.value.plateauPaused,
    plateauExerciseCount: exerciseMetrics.value.filter((m) => m.status === "plateau").length,
  };
  if (plateauPaused) return "Plateau & drop detection paused during recovery week.";
  const plateaus = exerciseMetrics.value.filter((m) => m.status === "plateau").length;
  const improving = exerciseMetrics.value.filter((m) => m.status === "improving").length;
  if (plateaus === 0 && improving === 0) return "No significant strength trends detected yet.";
  const parts: string[] = [];
  if (improving > 0) parts.push(`${improving} exercise${improving > 1 ? "s" : ""} improving`);
  if (plateaus > 0) parts.push(`${plateaus} plateau${plateaus > 1 ? "s" : ""} detected`);
  return parts.join(", ") + ".";
});

// --- Automatic Exercise Cleanup ---

onMounted(() => {
  void aiStore.classifyExercisesIfNeeded();
});

type Tab = "map" | "phase" | "exercises";
const activeTab = ref<Tab>("map");
const tabOptions = [
  { id: "map", label: "Muscles" },
  { id: "phase", label: "Training Phase" },
  { id: "exercises", label: "Exercises" },
] as const;

type MuscleGroupEntry = MuscleGroupInsight & { muscleGroup: string };
const muscleInsightsList = computed((): MuscleGroupEntry[] => {
  const result: MuscleGroupEntry[] = [];
  for (const [group, insight] of Object.entries(insights.value.muscleGroups)) {
    if (insight !== undefined) {
      result.push({ ...insight, muscleGroup: group });
    }
  }
  return result;
});

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
const plateauExerciseCount = computed(
  () => exerciseMetrics.value.filter((m) => m.status === "plateau").length,
);
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

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
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

        <!-- Active Deload Card -->
        <UiCard v-if="insights.deloadStatus === 'active'" class="p-4 overflow-visible">
          <div class="flex items-center justify-between gap-2 mb-3">
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-orange-300">Recovery Week</p>
              <p class="text-[11px] text-foreground/60 mt-0.5">
                {{ deloadStore.daysRemaining }}d remaining — reduced volume &amp; intensity
              </p>
            </div>
            <UiButton
              variant="ghost"
              size="sm"
              class="text-[10px] text-foreground/50 border border-white/10 hover:text-red-400 hover:border-red-400/30"
              @click="deloadStore.cancelDeload()"
            >
              End early
            </UiButton>
          </div>
          <!-- Progress bar -->
          <div class="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              class="h-full rounded-full bg-orange-400/70 transition-all duration-500"
              :style="{ width: `${deloadStore.progressPercent ?? 0}%` }"
            ></div>
          </div>
          <!-- Trigger badges -->
          <div v-if="insights.deloadTriggerSnapshot" class="mt-3 flex flex-wrap gap-1.5">
            <span
              v-for="trigger in insights.deloadTriggerSnapshot.triggeredBy"
              :key="trigger"
              class="text-[9px] px-1.5 py-0.5 rounded border border-orange-500/20 bg-orange-500/10 text-orange-300"
            >
              {{ trigger === "tonnageSpike" ? "Tonnage spike" :
                 trigger === "volumeSpike" ? "Volume spike" :
                 trigger === "performanceDecline" ? "Performance drop" :
                 trigger === "volumeIncreasing" ? "Volume trend" : trigger }}
            </span>
          </div>
        </UiCard>

        <!-- Phase Summary Card (no active deload) -->
        <UiCard v-else class="p-4 overflow-visible">
          <div class="flex items-center justify-between gap-2 mb-3">
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-foreground/90">Training Phase</p>
              <p class="text-[11px] text-foreground/60 mt-0.5">Current systemic state</p>
            </div>
            <span
              class="text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wider"
              :class="{
                'text-orange-400 border-orange-500/30 bg-orange-500/10': insights.phase === 'Deload',
                'text-emerald-400 border-emerald-500/30 bg-emerald-500/10': insights.phase === 'Build',
                'text-cyan-400 border-cyan-500/30 bg-cyan-500/10': insights.phase === 'Maintain',
                'bg-muted/50 text-muted-foreground border-white/10': insights.phase === 'Inactive',
              }"
            >
              {{ insights.phase }}
            </span>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <p class="text-[10px] uppercase tracking-wide text-foreground/50">ACWR</p>
              <p class="text-sm font-bold text-foreground/85">{{ acwrValueLabel }}</p>
            </div>
            <div class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <p class="text-[10px] uppercase tracking-wide text-foreground/50">Fatigue Risk</p>
              <p
                class="text-sm font-bold"
                :class="insights.fatigue.riskScore >= 3 ? 'text-orange-300' : 'text-foreground/85'"
              >
                {{ insights.fatigue.riskScore }}/5
              </p>
            </div>
            <div class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <p class="text-[10px] uppercase tracking-wide text-foreground/50">Sets this week</p>
              <p class="text-sm font-bold text-foreground/85">{{ weeklySetSummary.thisWeekSets }}</p>
            </div>
            <div class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <p class="text-[10px] uppercase tracking-wide text-foreground/50">Vs prior avg</p>
              <p
                class="text-sm font-bold"
                :class="{
                  'text-emerald-300': (weeklySetSummary.deltaPct ?? 0) > 0,
                  'text-red-300': (weeklySetSummary.deltaPct ?? 0) < -10,
                  'text-foreground/85': weeklySetSummary.deltaPct === null || Math.abs(weeklySetSummary.deltaPct) <= 10
                }"
              >
                {{ weeklyDeltaLabel }}
              </p>
            </div>
          </div>

          <!-- Fatigue trigger badges -->
          <div v-if="insights.fatigue.triggeredBy.length > 0" class="mt-3 flex flex-wrap gap-1.5">
            <p class="w-full text-[10px] text-foreground/50 mb-0.5">Fatigue signals:</p>
            <span
              v-for="trigger in insights.fatigue.triggeredBy"
              :key="trigger"
              class="text-[9px] px-1.5 py-0.5 rounded border border-orange-500/20 bg-orange-500/10 text-orange-300"
            >
              {{ trigger === "tonnageSpike" ? "Tonnage spike" :
                 trigger === "volumeSpike" ? "Volume spike" :
                 trigger === "performanceDecline" ? "Performance drop" :
                 trigger === "volumeIncreasing" ? "Volume trend" : trigger }}
            </span>
          </div>
        </UiCard>

        <!-- Muscle Recovery Card -->
        <UiCard class="p-4 overflow-visible">
          <p class="text-xs font-black uppercase tracking-wide text-foreground/90 mb-3">Muscle Recovery</p>
          <div class="space-y-2">
            <template v-if="muscleInsightsList.length > 0">
              <div
                v-for="m in muscleInsightsList"
                :key="m.muscleGroup"
                class="flex items-center justify-between gap-2"
              >
                <span class="text-xs text-foreground/70 w-28 shrink-0">{{ m.muscleGroup }}</span>
                <div class="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-500"
                    :class="m.recoveryReady ? 'bg-emerald-400/70' : 'bg-red-400/70'"
                    :style="{ width: `${clampPct((m.sets / 20) * 100)}%` }"
                  ></div>
                </div>
                <span
                  class="text-[9px] w-16 text-right shrink-0"
                  :class="m.recoveryReady ? 'text-emerald-300' : 'text-red-300'"
                >
                  {{ m.recoveryReady ? "Ready" : "Recovering" }}
                </span>
              </div>
            </template>
            <p v-else class="text-xs text-foreground/50">No muscle data yet.</p>
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
