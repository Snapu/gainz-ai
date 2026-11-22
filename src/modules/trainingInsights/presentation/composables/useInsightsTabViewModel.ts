import { storeToRefs } from "pinia";
import { computed, onMounted, watch } from "vue";
import { useAiOrchestratorStore } from "@/modules/aiCoach/presentation";
import { useDeloadStore } from "@/modules/deload/presentation";
import { useExerciseMuscleMapStore, useUserProgressStore } from "@/modules/platform/presentation";
import { useMetricsStore } from "@/modules/profile/presentation";
import { getLocalDayIndex, type MuscleGroup } from "@/modules/sharedKernel/domain";
import {
  MAX_FATIGUE_RISK_SCORE,
  normalizeExerciseName,
  useTrainingInsightsStore,
} from "@/modules/trainingInsights/presentation";
import { t } from "@/shared/presentation/i18n";
import { formatNumber } from "@/shared/presentation/i18n/formatters";

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
  isStale: boolean;
  unit: "kg" | "reps";
};

export function useInsightsTabViewModel() {
  const muscleMapStore = useExerciseMuscleMapStore();
  const userProgressStore = useUserProgressStore();
  const deloadStore = useDeloadStore();
  const orchestratorStore = useAiOrchestratorStore();
  const trainingInsightsStore = useTrainingInsightsStore();
  const metricsStore = useMetricsStore();
  const { insights } = storeToRefs(trainingInsightsStore);

  const userProgress = computed(() => userProgressStore.userProgress);

  onMounted(() => {
    void orchestratorStore.classifyExercisesIfNeeded();
  });

  watch(
    [() => insights.value.muscleGroups, () => metricsStore.isLoading] as const,
    ([muscleGroups, isMetricsLoading]) => {
      if (isMetricsLoading) return;
      for (const [group, insight] of Object.entries(muscleGroups)) {
        if (!insight) continue;
        const muscle = group as MuscleGroup;

        // Pass the insight data to the Application layer (Store) to orchestrate
        // the domain policy evaluation and persistence.
        metricsStore.evaluateInsight(muscle, {
          sets: insight.sets, // Use EWMA sets for discovery
          landmark: insight.landmark,
          trendStatus: insight.trendStatus,
        });
      }
    },
    { immediate: true, deep: true },
  );

  const acwrValueLabel = computed(() =>
    insights.value.acwr === null
      ? t("insights.buildingBaseline")
      : formatNumber(insights.value.acwr, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
  );

  const acwrZone = computed<AcwrZoneViewModel>(() => {
    const acwr = insights.value.acwr;
    if (acwr === null) {
      return {
        label: t("insights.acwrZones.noBaseline.label"),
        range: t("insights.acwrZones.noBaseline.range"),
        detail: t("insights.acwrZones.noBaseline.detail"),
        toneClass: "surface",
      };
    }

    if (acwr < 0.6) {
      const todayDayIndex = getLocalDayIndex(new Date());
      const hasRecentLogs = trainingInsightsStore.allLogs.some(
        (log) => todayDayIndex - getLocalDayIndex(log.loggedAt) <= 7,
      );

      return {
        label: t("insights.acwrZones.low.label"),
        range: t("insights.acwrZones.low.range"),
        detail: hasRecentLogs
          ? t("insights.acwrZones.low.detailRecent")
          : t("insights.acwrZones.low.detailRest"),
        toneClass: "neutral",
      };
    }

    if (acwr <= 1.3) {
      return {
        label: t("insights.acwrZones.optimal.label"),
        range: t("insights.acwrZones.optimal.range"),
        detail: t("insights.acwrZones.optimal.detail"),
        toneClass: "success",
      };
    }

    return {
      label: t("insights.acwrZones.elevated.label"),
      range: t("insights.acwrZones.elevated.range"),
      detail: t("insights.acwrZones.elevated.detail"),
      toneClass: "warning",
    };
  });

  const fatigueRiskToneClass = computed(() => {
    const score = insights.value.fatigue.riskScore;
    if (score >= 5) return "text-red-400";
    if (score >= 3) return "text-orange-400";
    if (score >= 1) return "text-orange-400/80";
    return "text-foreground/85";
  });

  const fatigueRiskLabel = computed(() => {
    const score = insights.value.fatigue.riskScore;
    if (score >= 5) return t("insights.fatigueLevels.high");
    if (score >= 3) return t("insights.fatigueLevels.elevated");
    if (score >= 1) return t("insights.fatigueLevels.mild");
    return t("insights.fatigueLevels.low");
  });

  const fatigueRiskPercent = computed(() => {
    return Math.round((insights.value.fatigue.riskScore / MAX_FATIGUE_RISK_SCORE) * 100);
  });

  const fatigueWeekRows = computed(() => {
    const loadWindow = insights.value.fatigue.loadWindow;
    return [
      {
        key: "weekMinus3",
        label: t("insights.weekRows.w3"),
        sets: loadWindow.sets.weekMinus3,
        tonnage: loadWindow.tonnage.weekMinus3,
      },
      {
        key: "weekMinus2",
        label: t("insights.weekRows.w2"),
        sets: loadWindow.sets.weekMinus2,
        tonnage: loadWindow.tonnage.weekMinus2,
      },
      {
        key: "weekMinus1",
        label: t("insights.weekRows.w1"),
        sets: loadWindow.sets.weekMinus1,
        tonnage: loadWindow.tonnage.weekMinus1,
      },
      {
        key: "current",
        label: t("insights.weekRows.current"),
        sets: loadWindow.sets.current,
        tonnage: loadWindow.tonnage.current,
      },
    ];
  });

  const setsDeltaPct = computed(() => {
    const sets = insights.value.fatigue.loadWindow.sets;
    if (!sets.prior3WeekAvg) return null;
    return Math.round(((sets.current - sets.prior3WeekAvg) / sets.prior3WeekAvg) * 100);
  });

  const tonnageDeltaPct = computed(() => {
    const tonnage = insights.value.fatigue.loadWindow.tonnage;
    if (!tonnage.prior3WeekAvg) return null;
    return Math.round(((tonnage.current - tonnage.prior3WeekAvg) / tonnage.prior3WeekAvg) * 100);
  });

  const allExerciseMetrics = computed((): ExerciseMetric[] => {
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

    const todayDayIndex = getLocalDayIndex(new Date());

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

        const daysAgo =
          lastLogTime > 0
            ? Math.max(0, todayDayIndex - getLocalDayIndex(new Date(lastLogTime)))
            : Number.POSITIVE_INFINITY;
        let lastTrainedLabel = "";
        if (daysAgo === 0) lastTrainedLabel = t("relativeTime.today");
        else if (daysAgo < 7) lastTrainedLabel = t("relativeTime.daysAgo", { count: daysAgo });
        else if (daysAgo < 28)
          lastTrainedLabel = t("relativeTime.weeksAgo", { count: Math.floor(daysAgo / 7) });
        else lastTrainedLabel = t("relativeTime.fourWeeksPlus");

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
          isStale: daysAgo >= 28,
          unit: data.unit,
        };
      })
      .sort((a, b) => {
        return b.lastLoggedAt.getTime() - a.lastLoggedAt.getTime();
      });
  });

  const activeExerciseMetrics = computed(() => allExerciseMetrics.value.filter((m) => !m.isStale));

  const exerciseStatusNote = computed(() => {
    if (insights.value.plateauPaused) return t("insights.statusNote.deloadPaused");
    const plateaus = activeExerciseMetrics.value.filter((m) => m.status === "plateau").length;
    const improving = activeExerciseMetrics.value.filter((m) => m.status === "improving").length;
    if (plateaus === 0 && improving === 0) return t("insights.statusNote.none");
    const parts: string[] = [];
    if (improving > 0)
      parts.push(t("insights.statusNote.improving", { count: improving }, improving));
    if (plateaus > 0) parts.push(t("insights.statusNote.plateaus", { count: plateaus }, plateaus));
    return `${parts.join(", ")}.`;
  });

  const topImprovingExercises = computed(() => {
    return activeExerciseMetrics.value
      .filter((m) => m.status === "improving")
      .sort((a, b) => (b.deltaPct ?? 0) - (a.deltaPct ?? 0))
      .slice(0, 3);
  });

  const attentionRequiredExercises = computed(() => {
    return activeExerciseMetrics.value
      .filter((m) => m.status === "plateau" || m.status === "dropping")
      .sort((a, b) => {
        if (a.status === "dropping" && b.status !== "dropping") return -1;
        if (b.status === "dropping" && a.status !== "dropping") return 1;
        if (a.status === "dropping" && b.status === "dropping") {
          return (a.deltaPct ?? 0) - (b.deltaPct ?? 0);
        }
        return 0;
      })
      .slice(0, 3);
  });

  return {
    userProgress,
    deloadStore,
    insights,
    acwrValueLabel,
    acwrZone,
    fatigueRiskToneClass,
    fatigueRiskLabel,
    fatigueRiskPercent,
    fatigueWeekRows,
    setsDeltaPct,
    tonnageDeltaPct,
    allExerciseMetrics,
    exerciseStatusNote,
    topImprovingExercises,
    attentionRequiredExercises,
  };
}
