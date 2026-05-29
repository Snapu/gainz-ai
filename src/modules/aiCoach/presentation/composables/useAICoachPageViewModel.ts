import { useDebounceFn, useTimeAgo } from "@vueuse/core";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { AiResponseData } from "@/modules/aiCoach/presentation";
import { useAiStore } from "@/modules/aiCoach/presentation";
import { useRestTimerStore } from "@/modules/platform/presentation";
import { formatRestDuration } from "@/modules/sharedKernel/presentation";
import { resolveCurrentSession, useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import { useToast } from "@/shared/presentation/composables/useToast";
import {
  type DisplayExercise,
  type DisplayInsight,
  type DisplayWorkoutGroup,
  groupWorkout,
  parseFirstRep,
  parseWeight,
  renderMarkdown,
  setSegments,
  splitWeight,
  titleClass,
  tryParseAiResponse,
} from "../helpers/aiCoachPageHelpers";

export type { AiResponseData, DisplayExercise, DisplayInsight, DisplayWorkoutGroup };

export function useAICoachPageViewModel() {
  const router = useRouter();
  const aiStore = useAiStore();
  const exerciseLogsStore = useExerciseLogsStore();
  const restTimerStore = useRestTimerStore();
  const { toast } = useToast();

  // ---------------------------------------------------------------------------
  // Local UI state
  // ---------------------------------------------------------------------------
  const isLogFormOpen = ref(false);
  const prefillData = ref<{
    exerciseName: string;
    reps?: number;
    weight?: number;
    rpe?: number;
  } | null>(null);
  const currentPageIndex = ref(0);
  const userQuestion = ref("");
  const isAskSheetOpen = ref(false);
  const openScratchpads = ref<string[]>([]);
  const openRequestPayloads = ref<string[]>([]);
  const scrollContainerRef = ref<HTMLDivElement | null>(null);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const assistantMessages = computed<DisplayInsight[]>(() => {
    const allMessages = aiStore.messages;
    const indexById = new Map(allMessages.map((m, i) => [m.id, i]));
    const assistantMsgs = allMessages.filter((m) => m.role === "assistant");
    return assistantMsgs.map((msg, idx) => {
      const parsedData = tryParseAiResponse(msg.content);
      const msgIndex = indexById.get(msg.id);
      const previous =
        typeof msgIndex === "number" && msgIndex > 0 ? allMessages[msgIndex - 1] : null;
      const requestPayload =
        previous?.role === "user" && previous.content && previous.content !== "AI request"
          ? previous.content
          : null;
      return {
        id: msg.id,
        timestamp: msg.timestamp,
        isLatest: idx === assistantMsgs.length - 1,
        rawContent: msg.content,
        parsedData,
        requestPayload,
      };
    });
  });

  const completedSetsMap = computed<Map<string, number>>(() => {
    const currentLogs = resolveCurrentSession(exerciseLogsStore.exerciseLogs)?.logs || [];
    const map = new Map<string, number>();
    for (const log of currentLogs) {
      map.set(log.exerciseName, (map.get(log.exerciseName) || 0) + 1);
    }
    return map;
  });

  const activeWorkout = computed<DisplayExercise[] | null>(() => {
    const assistantMsgs = aiStore.messages
      .filter((m) => m.role === "assistant")
      .slice()
      .reverse();
    for (const msg of assistantMsgs) {
      const parsed = tryParseAiResponse(msg.content);
      if (parsed?.recommendedWorkout && parsed.recommendedWorkout.length > 0) {
        return parsed.recommendedWorkout as DisplayExercise[];
      }
    }
    return null;
  });

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

  /** Derives rest duration from the current workout plan for the selected exercise. */
  const selectedRestSeconds = computed<number | null>(() => {
    const name = prefillData.value?.exerciseName;
    if (!name) return null;
    const planned = aiStore.currentWorkoutPlan?.find((ex) => ex.exerciseName === name);
    return planned?.restSeconds ?? null;
  });

  const cooldownProgressPercent = computed(() => {
    if (!restTimerStore.targetRestSeconds) return 0;
    return Math.min(
      100,
      Math.round((restTimerStore.restElapsed / restTimerStore.targetRestSeconds) * 100),
    );
  });

  // ---------------------------------------------------------------------------
  // Exercise progress helpers
  // ---------------------------------------------------------------------------

  function getExerciseProgress(exerciseName: string, targetSets: number) {
    const done = completedSetsMap.value.get(exerciseName) || 0;
    const isCompleted = done >= targetSets;
    const progressPercent = Math.min(100, Math.round((done / targetSets) * 100));
    return { done, isCompleted, progressPercent };
  }

  function isExerciseCompleted(exercise: DisplayExercise) {
    return getExerciseProgress(exercise?.exerciseName || "", exercise?.targetSets || 1).isCompleted;
  }

  function isHighlighted(gIndex: number, exIndex: number) {
    if (restTimerStore.isResting) return false;
    if (gIndex !== 0) return false;

    const group = activeWorkoutGroups.value?.[gIndex];
    if (!group) return false;

    let minDone = Infinity;
    for (const ex of group.exercises) {
      const { done } = getExerciseProgress(ex.exerciseName, ex.targetSets);
      if (done < minDone) minDone = done;
    }

    const nextExIndex = group.exercises.findIndex((ex) => {
      const { done } = getExerciseProgress(ex.exerciseName, ex.targetSets);
      return done === minDone;
    });

    return exIndex === nextExIndex;
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function handleLogExercise(exercise: DisplayExercise) {
    prefillData.value = {
      exerciseName: exercise.exerciseName,
      reps: parseFirstRep(exercise.targetReps),
      weight: parseWeight(exercise.targetWeight),
      rpe: exercise.targetRpe,
    };
    isLogFormOpen.value = true;
  }

  function openGoogleSearch(exerciseName?: string) {
    if (!exerciseName) return;
    window.open(
      `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(exerciseName + " exercise")}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function handleAskQuestion() {
    const question = userQuestion.value.trim();
    if (!question) return;
    userQuestion.value = "";
    isAskSheetOpen.value = false;
    aiStore.askAi(question).then((result) => {
      if (result.isErr()) {
        userQuestion.value = question;
        isAskSheetOpen.value = true;
        toast({
          title: "Error",
          description: "Failed to send question.",
          variant: "destructive",
        });
      } else {
        scrollToTop();
      }
    });
  }

  const debouncedAskAi = useDebounceFn(() => {
    aiStore.askAi().then((result) => {
      if (result.isErr()) {
        const description =
          result.error === "missing-api-key"
            ? "No API Key configured! Please add one in your profile."
            : "Failed to get AI response. Please try again.";
        toast({ title: "AI Coaching Error", description, variant: "destructive" });
      } else {
        scrollToTop();
      }
    });
  }, 500);

  const forceRefreshAi = useDebounceFn(() => {
    if (!aiStore.isNewDataAvailable) {
      if (assistantMessages.value.length === 1) {
        aiStore.clearMessages();
      } else {
        toast({
          title: "Coaching Up to Date",
          description: "No new workout data available to analyze. Log a new exercise set first!",
        });
        return;
      }
    }
    aiStore.askAi().then((result) => {
      if (result.isErr()) {
        const description =
          result.error === "missing-api-key"
            ? "No API Key configured! Please add one in your profile."
            : "Failed to get AI response. Please try again.";
        toast({ title: "AI Coaching Error", description, variant: "destructive" });
      } else {
        scrollToTop();
      }
    });
  }, 500);

  // ---------------------------------------------------------------------------
  // Scroll management
  // ---------------------------------------------------------------------------

  function scrollToTop() {
    nextTick(() => {
      if (scrollContainerRef.value) {
        scrollContainerRef.value.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Keyboard handler
  // ---------------------------------------------------------------------------

  function onCoachKeydown(e: KeyboardEvent) {
    if (e.key !== "Tab") return;
    const active = document.activeElement as HTMLElement | null;
    if (!active) return;
    const exerciseName = active.getAttribute?.("data-exercise-name");
    if (!exerciseName) return;
    e.preventDefault();
    const ex = (activeWorkout.value || []).find((x) => x.exerciseName === exerciseName);
    if (ex) handleLogExercise(ex);
  }

  // ---------------------------------------------------------------------------
  // Formatting helpers (passed through to template)
  // ---------------------------------------------------------------------------

  function formatTime(d: Date) {
    return useTimeAgo(d).value;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  onMounted(() => {
    aiStore.initialize();
    if (assistantMessages.value.length === 0) {
      debouncedAskAi();
    }
    scrollToTop();
    window.addEventListener("keydown", onCoachKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener("keydown", onCoachKeydown);
  });

  // Sync page index when new messages arrive
  watch(
    () => assistantMessages.value.length,
    (newLength) => {
      if (newLength > 0) {
        currentPageIndex.value = newLength - 1;
      }
    },
    { immediate: true },
  );

  // Scroll to top when new messages arrive
  watch(
    () => assistantMessages.value.length,
    (newLength, oldLength) => {
      if (newLength > (oldLength || 0)) {
        scrollToTop();
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------
  return {
    router,
    aiStore,
    restTimerStore,
    // State
    isLogFormOpen,
    prefillData,
    selectedRestSeconds,
    currentPageIndex,
    userQuestion,
    isAskSheetOpen,
    openScratchpads,
    openRequestPayloads,
    scrollContainerRef,
    // Computed
    assistantMessages,
    activeWorkout,
    activeWorkoutGroups,
    completedExercises,
    remainingExercises,
    cooldownProgressPercent,
    // Helpers
    getExerciseProgress,
    isExerciseCompleted,
    isHighlighted,
    setSegments,
    splitWeight,
    titleClass,
    renderMarkdown,
    formatRestDuration,
    formatTime,
    // Actions
    debouncedAskAi,
    forceRefreshAi,
    handleLogExercise,
    handleAskQuestion,
    openGoogleSearch,
  };
}
