import { useNow, useTimeoutPoll } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  type DisplayExercise,
  type DisplayWorkoutGroup,
  groupWorkout,
  parseFirstRep,
  parseWeight,
  tryParseCoachingAdvice,
  useAiOrchestratorStore,
  useCoachChatStore,
  useTrainingPlanStore,
} from "@/modules/aiCoach/presentation";
import {
  useRestTimerStore,
  useSpreadsheetStore,
  useTrainingSummaryStore,
  useUserProgressStore,
} from "@/modules/platform/presentation";
import { WIZARD_STEPS } from "@/modules/profile/presentation";
import { isoDateString, localeDateString } from "@/modules/sharedKernel/presentation";
import { useTrainingInsightsStore } from "@/modules/trainingInsights/presentation";
import type { ExerciseLog } from "@/modules/trainingLogs/presentation";
import {
  getSessionStartBoundary,
  resolveCurrentSession,
  useExerciseLogsStore,
} from "@/modules/trainingLogs/presentation";
import { useLogSheet } from "@/shared/presentation/composables/useLogSheet";

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

function findActiveGroupIndex(
  groups: DisplayWorkoutGroup[],
  getProgress: (name: string, targetSets: number) => { isCompleted: boolean },
): number {
  return groups.findIndex((g) => {
    return !g.exercises.every((ex) => getProgress(ex.exerciseName, ex.targetSets).isCompleted);
  });
}

function findNextExerciseIndexInGroup(
  group: DisplayWorkoutGroup,
  getProgress: (name: string, targetSets: number) => { done: number; isCompleted: boolean },
): number {
  let minDone = Infinity;
  for (const ex of group.exercises) {
    const { done, isCompleted } = getProgress(ex.exerciseName, ex.targetSets);
    if (!isCompleted && done < minDone) {
      minDone = done;
    }
  }

  return group.exercises.findIndex((ex: DisplayExercise) => {
    const { done, isCompleted } = getProgress(ex.exerciseName, ex.targetSets);
    return !isCompleted && done === minDone;
  });
}

export function useHomeWorkoutViewModel() {
  const router = useRouter();
  const trainingInsightsStore = useTrainingInsightsStore();
  const logsStore = useExerciseLogsStore();
  const summaryStore = useTrainingSummaryStore();
  const userProgressStore = useUserProgressStore();
  const spreadsheetStore = useSpreadsheetStore();

  const orchestratorStore = useAiOrchestratorStore();
  const chatStore = useCoachChatStore();
  const planStore = useTrainingPlanStore();

  const logSheet = useLogSheet();
  const restTimerStore = useRestTimerStore();

  const { exerciseLogs } = storeToRefs(logsStore);
  const { isInitialized: isSummaryReady } = storeToRefs(summaryStore);

  const collapsedSessions = ref<Record<string, boolean>>({});

  const userProgress = computed(() => userProgressStore.userProgress);
  const trainingInsights = computed(() => trainingInsightsStore.insights);

  // ---------------------------------------------------------------------------
  // Logs List
  // ---------------------------------------------------------------------------
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
      const volume = logs.reduce((acc, log) => acc + (log.weight ?? 0) * (log.reps ?? 0), 0);
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

  function editLog(log: ExerciseLog) {
    logSheet.openEditLog(log);
  }

  // ---------------------------------------------------------------------------
  // Today's Workout (from AI Coach logic)
  // ---------------------------------------------------------------------------
  const currentReactiveTime = useNow({ scheduler: (cb) => useTimeoutPoll(cb, 60000) });

  const currentWeekNumber = computed<number>(() => {
    if (!planStore.activePlan) return 1;
    return planStore.activePlan.getCurrentWeekNumber(currentReactiveTime.value);
  });

  const planDerivedWorkout = computed<DisplayExercise[] | null>(() => {
    if (!planStore.activePlan) return null;
    const currentDay = currentReactiveTime.value.getDay();
    const weekNum = currentWeekNumber.value;
    const session = planStore.activePlan.getPlannedSessionForDay(currentDay, weekNum);
    return (session?.exercises as DisplayExercise[]) ?? null;
  });

  /**
   * Today's latest coach-prescribed workout. An empty array means the coach explicitly
   * prescribed a rest day; `undefined` means no coach message set a workout today
   * (e.g. mid-workout Q&A omits the field), so callers should fall back to the plan.
   */
  const todaysCoachWorkout = computed<DisplayExercise[] | undefined>(() => {
    const today = isoDateString(currentReactiveTime.value);
    const coachMessagesList = chatStore.messages
      .filter((m) => m.role === "coach")
      .slice()
      .reverse();
    for (const msg of coachMessagesList) {
      const msgDate = isoDateString(new Date(msg.timestamp));
      if (msgDate !== today) break;
      const parsed = tryParseCoachingAdvice(msg.content);
      if (Array.isArray(parsed?.recommendedWorkout)) {
        return parsed.recommendedWorkout as DisplayExercise[];
      }
    }
    return undefined;
  });

  const isCoachRestDay = computed<boolean>(() => todaysCoachWorkout.value?.length === 0);

  const activeWorkout = computed<DisplayExercise[] | null>(
    () => todaysCoachWorkout.value ?? planDerivedWorkout.value,
  );

  const completedSetsMap = computed<Map<string, number>>(() => {
    const today = new Date(currentReactiveTime.value);
    today.setHours(0, 0, 0, 0);

    const todaysLogs = logsStore.exerciseLogs.filter(
      (log) => log.loggedAt.getTime() >= today.getTime(),
    );

    const map = new Map<string, number>();
    for (const log of todaysLogs) {
      map.set(log.exerciseName, (map.get(log.exerciseName) || 0) + 1);
    }
    return map;
  });

  function getExerciseProgress(exerciseName: string, targetSets: number) {
    const done = completedSetsMap.value.get(exerciseName) || 0;
    const isCompleted = done >= targetSets;
    const progressPercent = Math.min(100, Math.round((done / targetSets) * 100));
    return { done, isCompleted, progressPercent };
  }

  const completedExercises = computed(() => {
    if (!activeWorkout.value) return [] as DisplayExercise[];
    return activeWorkout.value.filter(
      (ex) => getExerciseProgress(ex.exerciseName, ex.targetSets).isCompleted,
    );
  });

  const remainingExercises = computed(() => {
    if (!activeWorkout.value) return [] as DisplayExercise[];
    return activeWorkout.value.filter(
      (ex) => !getExerciseProgress(ex.exerciseName, ex.targetSets).isCompleted,
    );
  });

  const activeWorkoutGroups = computed<DisplayWorkoutGroup[] | null>(() => {
    return groupWorkout(remainingExercises.value);
  });

  const allWorkoutGroups = computed<DisplayWorkoutGroup[] | null>(() => {
    if (!activeWorkout.value) return null;
    return groupWorkout(activeWorkout.value);
  });

  const isWorkoutComplete = computed<boolean>(() => {
    return Boolean(
      allWorkoutGroups.value?.length &&
        !activeWorkoutGroups.value?.length &&
        completedExercises.value.length,
    );
  });

  const hasActivePlan = computed<boolean>(() =>
    Boolean(planStore.activePlan && planStore.activePlan.sessions.length > 0),
  );

  const isRestDay = computed<boolean>(() => {
    if (todaysCoachWorkout.value !== undefined) {
      return isCoachRestDay.value;
    }
    return hasActivePlan.value && !planDerivedWorkout.value?.length;
  });

  function isExerciseCompleted(exercise: DisplayExercise) {
    return getExerciseProgress(exercise?.exerciseName || "", exercise?.targetSets || 1).isCompleted;
  }

  function isHighlighted(gIndex: number, exIndex: number) {
    if (restTimerStore.isResting) return false; // correctly wait for actual rest timer

    const allGroups = allWorkoutGroups.value;
    if (!allGroups) return false;

    const activeGroupIndex = findActiveGroupIndex(allGroups, getExerciseProgress);
    if (activeGroupIndex === -1 || gIndex !== activeGroupIndex) return false;

    const group = allGroups[gIndex];
    const exercise = group?.exercises[exIndex];
    if (!group || !exercise) return false;

    // Highlight all uncompleted exercises in a superset together
    if (group.isSuperset) {
      return !getExerciseProgress(exercise.exerciseName, exercise.targetSets).isCompleted;
    }

    return exIndex === findNextExerciseIndexInGroup(group, getExerciseProgress);
  }

  function getLastSessionSummary(exerciseName: string): string | null {
    const currentSession = resolveCurrentSession(logsStore.exerciseLogs);
    const sessionBoundary = getSessionStartBoundary(currentSession);

    const pastLogs = logsStore.exerciseLogs.filter(
      (l) => l.exerciseName === exerciseName && l.loggedAt.getTime() < sessionBoundary,
    );

    if (!pastLogs.length) return null;

    pastLogs.sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime());
    const lastLogTime = pastLogs[0].loggedAt.getTime();

    const lastSession = resolveCurrentSession(pastLogs, lastLogTime);

    let sessionLogs: ExerciseLog[] = [];
    if (lastSession) {
      sessionLogs = lastSession.logs;
    } else {
      const fallbackDateStr = pastLogs[0].loggedAt.toDateString();
      sessionLogs = pastLogs.filter((l) => l.loggedAt.toDateString() === fallbackDateStr);
      sessionLogs.reverse();
    }

    const reps = sessionLogs.map((l) => l.reps).filter((r): r is number => r != null);
    const weights = sessionLogs.map((l) => l.weight).filter((w): w is number => w != null);
    const durations = sessionLogs.map((l) => l.duration).filter((d): d is number => d != null);

    if (reps.length === 0 && durations.length > 0) {
      return `${sessionLogs.length} sets, max ${Math.max(...durations)} min`;
    }

    let text = "";
    if (reps.length > 0) {
      text += reps.join(", ");
    } else {
      text += `${sessionLogs.length} sets`;
    }

    if (weights.length > 0) {
      const maxWeight = Math.max(...weights);
      text += ` @ ${maxWeight}kg`;
    }

    return text;
  }

  function getExerciseProgression(exerciseName: string) {
    const pastLogs = logsStore.exerciseLogs.filter((l) => l.exerciseName === exerciseName);

    if (!pastLogs.length) return null;

    const sortedLogs = [...pastLogs].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
    if (sortedLogs.length < 2) return null;

    const recentLogs = sortedLogs.slice(-12);

    const isWeightBased = pastLogs.some((l) => l.weight != null);
    const isDurationBased = !isWeightBased && pastLogs.some((l) => l.duration != null);

    const metrics: Array<{
      items: { value: number; groupKey: string }[];
      label: string;
      color: string;
    }> = [];

    if (isWeightBased) {
      metrics.push({
        items: recentLogs.map((l) => ({
          value: l.weight ?? 0,
          groupKey: l.loggedAt.toDateString(),
        })),
        label: "WEIGHT",
        color: "oklch(0.87 0.2 150)",
      });
      metrics.push({
        items: recentLogs.map((l) => ({ value: l.reps ?? 0, groupKey: l.loggedAt.toDateString() })),
        label: "REPS",
        color: "oklch(0.65 0.15 250)",
      });
    } else if (isDurationBased) {
      metrics.push({
        items: recentLogs.map((l) => ({
          value: l.duration ?? 0,
          groupKey: l.loggedAt.toDateString(),
        })),
        label: "TIME",
        color: "oklch(0.87 0.2 150)",
      });
    } else {
      metrics.push({
        items: recentLogs.map((l) => ({ value: l.reps ?? 0, groupKey: l.loggedAt.toDateString() })),
        label: "REPS",
        color: "oklch(0.87 0.2 150)",
      });
    }

    return metrics;
  }

  function getTodaysLogsForExercise(exerciseName: string): ExerciseLog[] {
    const currentSession = resolveCurrentSession(logsStore.exerciseLogs);
    if (!currentSession) return [];

    return currentSession.logs
      .filter((l) => l.exerciseName === exerciseName)
      .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
  }

  function handleLogExercise(exercise: DisplayExercise) {
    let reps: number | undefined;
    let duration: number | undefined;

    if (exercise.targetDurationSeconds != null) {
      duration = Math.round((exercise.targetDurationSeconds / 60) * 100) / 100;
    } else {
      reps = parseFirstRep(exercise.targetReps);
    }

    const planned = chatStore.currentWorkoutPlan?.find(
      (ex) => ex.exerciseName === exercise.exerciseName,
    );
    const restSeconds = planned?.restSeconds ?? null;

    logSheet.openPrefilledLog(
      {
        exerciseName: exercise.exerciseName,
        reps,
        duration,
        weight: parseWeight(exercise.targetWeight),
        rpe: exercise.targetRpe,
      },
      restSeconds,
    );
  }

  function openGoogleSearch(exerciseName?: string) {
    if (!exerciseName) return;
    window.open(
      `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${exerciseName} exercise`)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function requestOffDayWorkout() {
    router.push({ name: "coach" });
    orchestratorStore.requestAdvice(
      "I want to train today. Please recommend the next session from my plan.",
    );
  }

  const currentSessionElapsedText = computed<string | null>(() => {
    const session = resolveCurrentSession(
      logsStore.exerciseLogs,
      currentReactiveTime.value.getTime(),
    );
    if (!session) return null;

    const diffMs = Math.max(0, currentReactiveTime.value.getTime() - session.startTime.getTime());
    const minutes = Math.floor(diffMs / 60000);

    return `${minutes} Min`;
  });

  onMounted(() => {
    orchestratorStore.ensureSessionAdvice();
  });

  return {
    router,
    logsStore,
    spreadsheetStore,
    chatStore,
    hasActivePlan,
    isRestDay,
    isWorkoutComplete,
    WIZARD_STEPS,
    isSummaryReady,
    userProgress,
    trainingInsights,
    groupedLogs,
    collapsedSessions,
    toggleSession,
    editLog,
    activeWorkoutGroups,
    allWorkoutGroups,
    completedExercises,
    planDerivedWorkout,
    isCoachRestDay,
    currentSessionElapsedText,
    getExerciseProgress,
    getExerciseProgression,
    isExerciseCompleted,
    isHighlighted,
    getLastSessionSummary,
    getTodaysLogsForExercise,
    handleLogExercise,
    openGoogleSearch,
    requestOffDayWorkout,
    restTimerStore,
  };
}
