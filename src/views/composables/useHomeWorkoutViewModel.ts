import { useNow, useTimeoutPoll } from "@vueuse/core";
import { computed, getCurrentInstance, onMounted, ref, watch } from "vue";
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
import { useRestTimerStore } from "@/modules/platform/presentation";
import { isoDateString } from "@/modules/sharedKernel/presentation";
import type { ExerciseLog } from "@/modules/trainingLogs/presentation";
import {
  getSessionStartBoundary,
  resolveCurrentSession,
  useExerciseLogsStore,
} from "@/modules/trainingLogs/presentation";
import type {
  ProgressionSessionItem,
  ProgressionSetItem,
} from "@/shared/presentation/components/ui/UiProgressionLine.vue";
import { useLogSheet } from "@/shared/presentation/composables/useLogSheet";

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

function resolveTargetRepsAndDuration(exercise: DisplayExercise) {
  const durationSec = exercise.targetDurationSeconds;
  return {
    targetReps: durationSec != null ? undefined : parseFirstRep(exercise.targetReps),
    targetDuration: durationSec != null ? Math.round((durationSec / 60) * 100) / 100 : undefined,
  };
}

function resolvePrefillMetrics(
  exercise: DisplayExercise,
  lastLog?: ExerciseLog,
): {
  reps?: number;
  duration?: number;
  distance?: number;
  weight?: number;
  rpe?: number;
} {
  const { targetReps, targetDuration } = resolveTargetRepsAndDuration(exercise);

  if (!lastLog) {
    return {
      reps: targetReps,
      duration: targetDuration,
      distance: exercise.targetDistanceMeters,
      weight: parseWeight(exercise.targetWeight),
      rpe: exercise.targetRpe,
    };
  }

  return {
    reps: lastLog.reps ?? targetReps,
    duration: lastLog.duration ?? targetDuration,
    distance: lastLog.distance ?? exercise.targetDistanceMeters,
    weight: lastLog.weight ?? parseWeight(exercise.targetWeight),
    rpe: lastLog.rpe,
  };
}

export function useHomeWorkoutViewModel() {
  const router = useRouter();
  const logsStore = useExerciseLogsStore();

  const orchestratorStore = useAiOrchestratorStore();
  const chatStore = useCoachChatStore();
  const planStore = useTrainingPlanStore();

  const logSheet = useLogSheet();
  const restTimerStore = useRestTimerStore();

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

  function isHighlighted(gIndex: number, exIndex: number) {
    if (restTimerStore.isResting || gIndex !== visibleGroupIndex.value) return false;
    const exercise = allWorkoutGroups.value?.[gIndex]?.exercises[exIndex];
    if (!exercise || getExerciseProgress(exercise.exerciseName, exercise.targetSets).isCompleted) {
      return false;
    }
    return exercise.exerciseName === activeExerciseForDeck.value?.exerciseName;
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

  const exerciseProgressions = computed(() => {
    const map = new Map<string, ProgressionSessionItem[]>();
    const logs = logsStore.exerciseLogs;
    if (!logs.length) return map;

    const byExercise = new Map<string, ExerciseLog[]>();
    for (const log of logs) {
      let list = byExercise.get(log.exerciseName);
      if (!list) {
        list = [];
        byExercise.set(log.exerciseName, list);
      }
      list.push(log);
    }

    const formatter = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

    for (const [exerciseName, pastLogs] of byExercise.entries()) {
      if (pastLogs.length < 2) continue;

      const sortedLogs = [...pastLogs].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
      const recentLogs = sortedLogs.slice(-24);

      const sessionsMap = new Map<string, { date: Date; sets: ProgressionSetItem[] }>();

      for (const log of recentLogs) {
        const key = log.loggedAt.toDateString();
        let session = sessionsMap.get(key);
        if (!session) {
          session = { date: log.loggedAt, sets: [] };
          sessionsMap.set(key, session);
        }
        session.sets.push({
          weight: log.weight,
          reps: log.reps,
          duration: log.duration,
        });
      }

      const sessions: ProgressionSessionItem[] = [];
      for (const [key, val] of sessionsMap.entries()) {
        sessions.push({
          key,
          dateLabel: formatter.format(val.date),
          sets: val.sets,
        });
      }

      if (sessions.length > 0) {
        map.set(exerciseName, sessions);
      }
    }

    return map;
  });

  function getExerciseProgression(exerciseName: string): ProgressionSessionItem[] | null {
    return exerciseProgressions.value.get(exerciseName) ?? null;
  }

  function getTodaysLogsForExercise(exerciseName: string): ExerciseLog[] {
    const currentSession = resolveCurrentSession(
      logsStore.exerciseLogs,
      currentReactiveTime.value.getTime(),
    );
    if (currentSession) {
      return currentSession.logs
        .filter((l) => l.exerciseName === exerciseName)
        .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
    }

    const today = new Date(currentReactiveTime.value);
    today.setHours(0, 0, 0, 0);

    return logsStore.exerciseLogs
      .filter((l) => l.exerciseName === exerciseName && l.loggedAt.getTime() >= today.getTime())
      .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
  }

  function handleLogExercise(exercise: DisplayExercise) {
    const todaysLogs = getTodaysLogsForExercise(exercise.exerciseName);
    const lastLog = todaysLogs[todaysLogs.length - 1];
    const metrics = resolvePrefillMetrics(exercise, lastLog);

    const planned = chatStore.currentWorkoutPlan?.find(
      (ex) => ex.exerciseName === exercise.exerciseName,
    );
    const restSeconds = planned?.restSeconds ?? null;

    logSheet.openPrefilledLog(
      {
        exerciseName: exercise.exerciseName,
        ...metrics,
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

  const visibleGroupIndex = ref(0);
  const selectedSupersetExerciseName = ref<string | null>(null);

  watch([visibleGroupIndex, () => logsStore.exerciseLogs.length], () => {
    selectedSupersetExerciseName.value = null;
  });

  function getActiveExerciseInGroup(group?: DisplayWorkoutGroup): DisplayExercise | null {
    if (!group?.exercises?.length) return null;
    const idx = findNextExerciseIndexInGroup(group, getExerciseProgress);
    return idx === -1 ? (group.exercises[0] ?? null) : (group.exercises[idx] ?? null);
  }

  const activeGroupForDeck = computed(() => {
    if (!allWorkoutGroups.value || allWorkoutGroups.value.length === 0) return null;
    return allWorkoutGroups.value[visibleGroupIndex.value] ?? null;
  });

  const activeExerciseForDeck = computed(() => {
    const group = activeGroupForDeck.value;
    if (!group) return null;
    if (group.isSuperset && selectedSupersetExerciseName.value) {
      const selected = group.exercises.find(
        (ex) => ex.exerciseName === selectedSupersetExerciseName.value,
      );
      if (selected) return selected;
    }
    return getActiveExerciseInGroup(group);
  });

  const supersetAlternatives = computed<DisplayExercise[]>(() => {
    const group = activeGroupForDeck.value;
    const current = activeExerciseForDeck.value;
    if (!group?.isSuperset || !current) return [];
    return group.exercises.filter((ex) => ex.exerciseName !== current.exerciseName);
  });

  function selectSupersetExercise(exerciseName: string) {
    selectedSupersetExerciseName.value = exerciseName;
  }

  const activeExerciseProgress = computed(() => {
    if (!activeExerciseForDeck.value) return null;
    return getExerciseProgress(
      activeExerciseForDeck.value.exerciseName,
      activeExerciseForDeck.value.targetSets,
    );
  });

  function handleDeckLogCurrent() {
    if (activeExerciseForDeck.value) {
      handleLogExercise(activeExerciseForDeck.value);
    }
  }

  function handleLogArbitrary() {
    logSheet.openNewLog();
  }

  function skipRest() {
    restTimerStore.reset();
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      orchestratorStore.ensureSessionAdvice();
    });
  }

  return {
    router,
    logsStore,
    chatStore,
    hasActivePlan,
    isRestDay,
    isWorkoutComplete,
    editLog,
    allWorkoutGroups,
    isCoachRestDay,
    currentSessionElapsedText,
    getExerciseProgress,
    getExerciseProgression,
    isHighlighted,
    getLastSessionSummary,
    getTodaysLogsForExercise,
    handleLogExercise,
    visibleGroupIndex,
    activeExerciseForDeck,
    activeExerciseProgress,
    supersetAlternatives,
    selectSupersetExercise,
    handleDeckLogCurrent,
    handleLogArbitrary,
    skipRest,
    openGoogleSearch,
    requestOffDayWorkout,
    restTimerStore,
  };
}
