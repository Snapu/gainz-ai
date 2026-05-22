import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  useRestTimerStore,
  useSpreadsheetStore,
  useTrainingSummaryStore,
  useUserProgressStore,
} from "@/modules/platform/presentation";
import { WIZARD_STEPS } from "@/modules/profile/presentation";
import { localeDateString } from "@/modules/sharedKernel/presentation";
import { useTrainingInsightsStore } from "@/modules/trainingInsights/presentation";
import type { ExerciseLog } from "@/modules/trainingLogs/presentation";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";

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
  const trainingInsightsStore = useTrainingInsightsStore();
  const logsStore = useExerciseLogsStore();
  const summaryStore = useTrainingSummaryStore();
  const userProgressStore = useUserProgressStore();
  const spreadsheetStore = useSpreadsheetStore();
  const restTimerStore = useRestTimerStore();

  const { isResting, formattedTime: formattedRestTime } = storeToRefs(restTimerStore);
  const { exerciseLogs } = storeToRefs(logsStore);
  const { isInitialized: isSummaryReady } = storeToRefs(summaryStore);

  const collapsedSessions = ref<Record<string, boolean>>({});
  const isLogFormOpen = ref(false);

  const userProgress = computed(() => userProgressStore.userProgress);
  const trainingInsights = computed(() => trainingInsightsStore.insights);

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

  function handleFabClick() {
    if (isResting.value) {
      restTimerStore.reset();
    }
    isLogFormOpen.value = true;
  }

  return {
    router,
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
    handleFabClick,
    isLogFormOpen,
  };
}
