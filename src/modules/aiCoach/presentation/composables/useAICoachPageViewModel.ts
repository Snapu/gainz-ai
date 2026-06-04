import { useDebounceFn } from "@vueuse/core";
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
  const openScratchpads = ref<string[]>([]);
  const openRequestPayloads = ref<string[]>([]);
  const scrollContainerRef = ref<HTMLDivElement | null>(null);

  const activeTab = ref<"messages" | "today" | "plan">("messages");
  const tabOptions = [
    { id: "messages", label: "Coach", value: "messages" },
    { id: "today", label: "Today", value: "today" },
    { id: "plan", label: "Plan", value: "plan" },
  ];

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

  const activeSessionIndex = computed<number>(() => {
    if (!aiStore.activePlan) return -1;
    const currentDay = new Date().getDay();
    // Find the session matching today's day of week
    const index = aiStore.activePlan.sessions.findIndex((s) => s.dayOfWeek === currentDay);
    // If none matches today, default to the first session for now
    // A more advanced heuristic could look for the next uncompleted session
    return index >= 0 ? index : 0;
  });

  const activePlan = computed(() => aiStore.activePlan);

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

    const nextExIndex = group.exercises.findIndex((ex: DisplayExercise) => {
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
    aiStore.askAi(question).then((result) => {
      if (result.isErr()) {
        userQuestion.value = question;
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

  async function regeneratePlan() {
    const result = await aiStore.generateNewPlan();
    if (result.isErr()) {
      handleAiError(result.error);
    } else {
      toast({
        title: "Plan Regenerated",
        description: "Your training cycle has been updated.",
        variant: "default",
      });
      scrollToTop();
    }
  }

  function handleAiError(error: string) {
    const description =
      error === "missing-api-key"
        ? "No API Key configured! Please add one in your profile."
        : "Failed to get AI response. Please try again.";
    toast({ title: "AI Coaching Error", description, variant: "destructive" });
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
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  onMounted(() => {
    aiStore.initialize();
    if (assistantMessages.value.length === 0) {
      if (!aiStore.activePlan) {
        aiStore.generateNewPlan().then((result) => {
          if (result.isErr()) handleAiError(result.error);
          else scrollToTop();
        });
      } else {
        debouncedAskAi();
      }
    } else if (activeWorkout.value?.length) {
      activeTab.value = "today";
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
    activeTab,
    tabOptions,
    openScratchpads,
    openRequestPayloads,
    scrollContainerRef,
    // Computed
    assistantMessages,
    activeWorkout,
    activeWorkoutGroups,
    activePlan,
    activeSessionIndex,
    completedExercises,
    cooldownProgressPercent,
    // Helpers
    getExerciseProgress,
    isExerciseCompleted,
    isHighlighted,
    renderMarkdown,
    formatRestDuration,
    formatTime,
    // Actions
    debouncedAskAi,
    handleLogExercise,
    handleAskQuestion,
    openGoogleSearch,
    regeneratePlan,
  };
}
