import { haptic } from "ios-haptics";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useDeloadStore } from "@/modules/deload/presentation";
import {
  useRestTimerStore,
  useSpreadsheetStore,
  useTrainingSummaryStore,
  useUserProgressStore,
} from "@/modules/platform/presentation";
import { WIZARD_STEPS } from "@/modules/profile/presentation";
import { localeDateString } from "@/modules/sharedKernel/presentation";
import { useAiStore } from "@/modules/aiCoach/presentation";
import { useTrainingInsightsStore } from "@/modules/trainingInsights/presentation";
import type { ExerciseLog } from "@/modules/trainingLogs/presentation";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import type { ExerciseSelectorOptionDetails } from "@/shared/presentation/components/ExerciseSelector.vue";
import { useToast } from "@/shared/presentation/composables/useToast";

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

export function useExerciseLogsPageViewModel() {
  const router = useRouter();
  const deloadStore = useDeloadStore();
  const trainingInsightsStore = useTrainingInsightsStore();
  const logsStore = useExerciseLogsStore();
  const summaryStore = useTrainingSummaryStore();
  const userProgressStore = useUserProgressStore();
  const spreadsheetStore = useSpreadsheetStore();
  const restTimerStore = useRestTimerStore();
  const aiStore = useAiStore();
  const { toast } = useToast();

  const { isResting, formattedTime: formattedRestTime } = storeToRefs(restTimerStore);
  const { exerciseLogs } = storeToRefs(logsStore);
  const { isInitialized: isSummaryReady } = storeToRefs(summaryStore);

  const isAIPanelOpen = ref(false);
  const collapsedSessions = ref<Record<string, boolean>>({});
  const isLogFormOpen = ref(false);
  const formExerciseName = ref("");
  const formReps = ref<number | null>(null);
  const formWeight = ref<number | null>(null);
  const formDistance = ref<number | null>(null);
  const formDuration = ref<number | null>(null);
  const formRpe = ref<number>(deloadStore.active ? 6.5 : 9.5);
  const skipHistoryAutoFill = ref(false);

  const isDumbbellExercise = computed(() => /kurzhantel|dumbbell/i.test(formExerciseName.value));
  const userProgress = computed(() => userProgressStore.userProgress);
  const trainingInsights = computed(() => trainingInsightsStore.insights);

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
    formRpe.value = deloadStore.active ? 6.5 : 9.5;
    isLogFormOpen.value = true;
  }

  function handleFabClick() {
    if (isResting.value) {
      restTimerStore.reset();
    }
    openLogForm();
  }

  function prefillFromAi(data: {
    exerciseName: string;
    reps?: number;
    weight?: number;
    rpe?: number;
  }) {
    skipHistoryAutoFill.value = true;
    formExerciseName.value = data.exerciseName;
    formReps.value = data.reps ?? null;
    formWeight.value = data.weight ?? null;
    formDistance.value = null;
    formDuration.value = null;
    formRpe.value = data.rpe ?? (deloadStore.active ? 6.5 : 9.5);
    isLogFormOpen.value = true;
  }

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

  async function saveLog() {
    if (!formExerciseName.value) {
      toast({ title: "Exercise Name Required", variant: "destructive" });
      return;
    }

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

    const plannedExercise = aiStore.currentWorkoutPlan?.find(
      (ex) => ex.exerciseName === formExerciseName.value
    );

    const DEFAULT_REST_SECONDS = 120; // 2 minutes generic fallback

    restTimerStore.reset();
    restTimerStore.start(plannedExercise?.restSeconds ?? DEFAULT_REST_SECONDS);

    isLogFormOpen.value = false;
  }

  return {
    router,
    deloadStore,
    logsStore,
    spreadsheetStore,
    restTimerStore,
    WIZARD_STEPS,
    isSummaryReady,
    userProgress,
    trainingInsights,
    groupedLogs,
    collapsedSessions,
    toggleSession,
    isResting,
    formattedRestTime,
    isAIPanelOpen,
    handleFabClick,
    isLogFormOpen,
    exerciseOptions,
    exerciseOptionDetails,
    exerciseStats,
    isDumbbellExercise,
    formExerciseName,
    formReps,
    formWeight,
    formDistance,
    formDuration,
    formRpe,
    rpeLabel,
    saveLog,
    prefillFromAi,
  };
}
