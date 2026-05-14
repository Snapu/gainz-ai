import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAiStore } from "@/modules/aiCoach/presentation";
import { useDeloadStore } from "@/modules/deload/presentation";
import { useExerciseMuscleMapStore } from "@/modules/platform/presentation";
import {
  MAX_FATIGUE_RISK_SCORE,
  type MuscleGroupInsight,
  normalizeExerciseName,
  useTrainingInsightsStore,
} from "@/modules/trainingInsights/presentation";

type TrainingInsightsTab = "map" | "phase" | "exercises";

type AcwrZoneViewModel = {
  label: string;
  range: string;
  detail: string;
  toneClass: string;
};

type ExerciseMetric = {
  name: string;
  e1rm: number;
  deltaPct: number | null;
  plateau: boolean;
  bestRPE: number | null;
  learnedMuscleGroups: string[];
  status: "plateau" | "improving" | "dropping" | "stable";
  lastLoggedAt: Date;
  lastTrainedLabel: string;
};

type MuscleGroupWithKey = MuscleGroupInsight & { muscleGroup: string };

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function useTrainingInsightsPageViewModel() {
  const router = useRouter();
  const muscleMapStore = useExerciseMuscleMapStore();
  const deloadStore = useDeloadStore();
  const aiStore = useAiStore();
  const trainingInsightsStore = useTrainingInsightsStore();
  const { insights } = storeToRefs(trainingInsightsStore);

  onMounted(() => {
    void aiStore.classifyExercisesIfNeeded();
  });

  const activeTab = ref<TrainingInsightsTab>("map");
  const tabOptions = [
    { id: "map", label: "Muscles" },
    { id: "phase", label: "Phase" },
    { id: "exercises", label: "Exercises" },
  ] as const;

  const muscleInsightsList = computed((): MuscleGroupWithKey[] => {
    const result: MuscleGroupWithKey[] = [];
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

  const acwrZone = computed<AcwrZoneViewModel>(() => {
    const acwr = insights.value.acwr;
    if (acwr === null) {
      return {
        label: "No baseline",
        range: "Need 4-week history",
        detail: "Log more sessions to unlock ACWR trend and workload zone.",
        toneClass: "bg-white/5 text-foreground/65 border-white/15",
      };
    }

    if (acwr < 0.6) {
      return {
        label: "Underloaded",
        range: "< 0.60",
        detail: "Training load is low relative to your baseline. You may be detraining.",
        toneClass: "bg-slate-400/10 text-slate-300 border-slate-400/30",
      };
    }

    if (acwr <= 1.3) {
      return {
        label: "Balanced",
        range: "0.60 - 1.30",
        detail: "Workload is in the productive range for build/maintain progression.",
        toneClass: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
      };
    }

    return {
      label: "High ramp",
      range: "> 1.30",
      detail: "Acute load is rising quickly vs baseline. Fatigue and injury risk increase.",
      toneClass: "bg-orange-500/10 text-orange-300 border-orange-500/30",
    };
  });

  const acwrGaugePercent = computed(() => {
    const acwr = insights.value.acwr;
    if (acwr === null) return 0;
    return clampPct((acwr / 1.8) * 100);
  });

  function formatTriggerLabel(trigger: string): string {
    if (trigger === "tonnageSpike") return "Tonnage spike";
    if (trigger === "volumeSpike") return "Volume spike";
    if (trigger === "performanceDecline") return "Performance drop";
    if (trigger === "volumeIncreasing") return "Volume ramp";
    return trigger;
  }

  const fatigueRiskToneClass = computed(() => {
    const score = insights.value.fatigue.riskScore;
    if (score >= 5) return "text-red-300";
    if (score >= 3) return "text-orange-300";
    if (score >= 1) return "text-amber-200";
    return "text-foreground/85";
  });

  const fatigueRiskLabel = computed(() => {
    const score = insights.value.fatigue.riskScore;
    if (score >= 5) return "High";
    if (score >= 3) return "Elevated";
    if (score >= 1) return "Mild";
    return "Low";
  });

  const fatigueRiskPercent = computed(() => {
    return Math.round((insights.value.fatigue.riskScore / MAX_FATIGUE_RISK_SCORE) * 100);
  });

  const deloadStatusLabel = computed(() => {
    if (insights.value.deloadStatus === "active") return "Active";
    if (insights.value.deloadStatus === "completed") return "Completed";
    if (insights.value.deloadStatus === "canceled") return "Stopped early";
    return "None";
  });

  const deloadStatusToneClass = computed(() => {
    if (insights.value.deloadStatus === "active") {
      return "text-orange-300 border-orange-500/30 bg-orange-500/10";
    }
    if (insights.value.deloadStatus === "completed") {
      return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
    }
    if (insights.value.deloadStatus === "canceled") {
      return "text-amber-200 border-amber-400/30 bg-amber-500/10";
    }
    return "bg-white/5 text-foreground/65 border-white/15";
  });

  const deloadStatusNote = computed(() => {
    if (insights.value.deloadStatus === "active") {
      return `${deloadStore.daysRemaining ?? 0}d remaining in recovery week.`;
    }
    if (insights.value.deloadStatus === "completed") {
      return "Latest deload has completed. Fatigue detection is active again.";
    }
    if (insights.value.deloadStatus === "canceled") {
      return "Deload was stopped early. Monitor fatigue and ACWR closely.";
    }
    return "No deload cycle is currently recorded.";
  });

  const fatigueWeekRows = computed(() => {
    const loadWindow = insights.value.fatigue.loadWindow;
    return [
      {
        key: "weekMinus3",
        label: "Week -3",
        sets: loadWindow.sets.weekMinus3,
        tonnage: loadWindow.tonnage.weekMinus3,
      },
      {
        key: "weekMinus2",
        label: "Week -2",
        sets: loadWindow.sets.weekMinus2,
        tonnage: loadWindow.tonnage.weekMinus2,
      },
      {
        key: "weekMinus1",
        label: "Week -1",
        sets: loadWindow.sets.weekMinus1,
        tonnage: loadWindow.tonnage.weekMinus1,
      },
      {
        key: "current",
        label: "Current",
        sets: loadWindow.sets.current,
        tonnage: loadWindow.tonnage.current,
      },
    ];
  });

  const maxSets = computed(() => {
    const max = Math.max(...fatigueWeekRows.value.map((r) => r.sets));
    return max > 0 ? max : 1;
  });

  const maxTonnage = computed(() => {
    const max = Math.max(...fatigueWeekRows.value.map((r) => r.tonnage));
    return max > 0 ? max : 1;
  });

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

  const exerciseMetrics = computed((): ExerciseMetric[] => {
    // Build a map of exercise name to its latest loggedAt date
    const latestDates = new Map<string, number>();
    for (const log of trainingInsightsStore.allLogs) {
      const canonical = normalizeExerciseName(log.exerciseName);
      const time = log.loggedAt.getTime();
      const existing = latestDates.get(canonical) ?? 0;
      if (time > existing) {
        latestDates.set(canonical, time);
      }
    }

    const now = new Date().getTime();
    const fourWeeksMs = 28 * 24 * 60 * 60 * 1000;

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

        const activation = muscleMapStore.resolveMuscleActivation(name);
        const learnedMuscleGroups = activation
          ? [activation.primaryMuscle, ...activation.secondaryMuscles.map((m) => m.muscleGroup)]
          : [];

        const canonical = normalizeExerciseName(name);
        const lastLogTime = latestDates.get(canonical) ?? 0;

        const daysAgo = Math.floor((now - lastLogTime) / (1000 * 60 * 60 * 24));
        let lastTrainedLabel = "";
        if (daysAgo === 0) lastTrainedLabel = "Today";
        else if (daysAgo < 7) lastTrainedLabel = `${daysAgo}d ago`;
        else if (daysAgo < 28) lastTrainedLabel = `${Math.floor(daysAgo / 7)}w ago`;
        else lastTrainedLabel = "4w+ ago";

        return {
          name,
          e1rm: current,
          deltaPct,
          plateau: data.plateau,
          bestRPE: data.bestRPE ?? null,
          learnedMuscleGroups: Array.from(new Set(learnedMuscleGroups)),
          status,
          lastLoggedAt: new Date(lastLogTime),
          lastTrainedLabel,
        };
      })
      .filter((m) => {
        return now - m.lastLoggedAt.getTime() <= fourWeeksMs;
      })
      .sort((a, b) => {
        return b.lastLoggedAt.getTime() - a.lastLoggedAt.getTime();
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
    return `${parts.join(", ")}.`;
  });

  return {
    router,
    deloadStore,
    insights,
    activeTab,
    tabOptions,
    maintenanceLikeCount,
    totalMuscleGroups,
    notRecoveredCount,
    acwrValueLabel,
    acwrZone,
    acwrGaugePercent,
    formatTriggerLabel,
    fatigueRiskToneClass,
    fatigueRiskLabel,
    fatigueRiskPercent,
    deloadStatusLabel,
    deloadStatusToneClass,
    deloadStatusNote,
    fatigueWeekRows,
    maxSets,
    maxTonnage,
    weeklyDeltaLabel,
    tonnageDeltaPct,
    exerciseMetrics,
    totalExerciseCount,
    plateauExerciseCount,
    improvingExerciseCount,
    droppingExerciseCount,
    averageBestRPE,
    exerciseStatusNote,
  };
}
