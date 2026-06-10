import { useDebounceFn } from "@vueuse/core";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { type CoachingAdvice, useAiStore } from "@/modules/aiCoach/presentation";
import { useRestTimerStore } from "@/modules/platform/presentation";
import { isoDateString } from "@/modules/sharedKernel/domain";
import { formatRestDuration } from "@/modules/sharedKernel/presentation";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import { useToast } from "@/shared/presentation/composables/useToast";
import {
  type DisplayExercise,
  type DisplayInsight,
  type DisplayWorkoutGroup,
  groupWorkout,
  isDuration,
  parseFirstRep,
  parseWeight,
  renderMarkdown,
  splitReps,
  tryParseCoachingAdvice,
} from "../helpers/aiCoachPageHelpers";

export type { CoachingAdvice, DisplayExercise, DisplayInsight, DisplayWorkoutGroup };

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
    duration?: number;
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

  const coachMessages = computed<DisplayInsight[]>(() => {
    const allMessages = aiStore.messages;
    const indexById = new Map(allMessages.map((m, i) => [m.id, i]));
    const coachMessages = allMessages.filter((m) => m.role === "coach");
    return coachMessages.map((msg, idx) => {
      const parsedData = tryParseCoachingAdvice(msg.content);
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
        isLatest: idx === coachMessages.length - 1,
        rawContent: msg.content,
        parsedData,
        requestPayload,
      };
    });
  });

  const completedSetsMap = computed<Map<string, number>>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaysLogs = exerciseLogsStore.exerciseLogs.filter(
      (log) => log.loggedAt.getTime() >= today.getTime(),
    );

    const map = new Map<string, number>();
    for (const log of todaysLogs) {
      map.set(log.exerciseName, (map.get(log.exerciseName) || 0) + 1);
    }
    return map;
  });

  // ---------------------------------------------------------------------------
  // Week tracking
  // ---------------------------------------------------------------------------

  /** Which week (1 or 2) of the current mesocycle we're in, based on plan creation date. */
  const currentWeekNumber = computed<number>(() => {
    if (!aiStore.activePlan) return 1;
    return aiStore.activePlan.getCurrentWeekNumber(new Date());
  });

  /** Today's session directly from the stored plan — no AI call needed. */
  const planDerivedWorkout = computed<DisplayExercise[] | null>(() => {
    if (!aiStore.activePlan) return null;
    const currentDay = new Date().getDay();
    const weekNum = currentWeekNumber.value;
    const session = aiStore.activePlan.getPlannedSessionForDay(currentDay, weekNum);
    return (session?.exercises as DisplayExercise[]) ?? null;
  });

  /**
   * The active workout to display.
   * Priority: an AI recommendedWorkout from today's messages > the plan-derived workout.
   * This prevents stale AI responses from a previous day overriding today's plan.
   */
  const activeWorkout = computed<DisplayExercise[] | null>(() => {
    const today = isoDateString(new Date());
    const coachMessagesList = aiStore.messages
      .filter((m) => m.role === "coach")
      .slice()
      .reverse();
    for (const msg of coachMessagesList) {
      // Only use AI recommendations generated today (local timezone)
      const msgDate = isoDateString(new Date(msg.timestamp));
      if (msgDate !== today) break;
      const parsed = tryParseCoachingAdvice(msg.content);
      if (parsed?.recommendedWorkout && parsed.recommendedWorkout.length > 0) {
        return parsed.recommendedWorkout as DisplayExercise[];
      }
    }
    // Fall back to the stored plan for today's session
    return planDerivedWorkout.value;
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
    const weekNum = currentWeekNumber.value;
    // Match both day and week for correct W1/W2 highlighting
    const exactMatch = aiStore.activePlan.sessions.findIndex(
      (s) => s.dayOfWeek === currentDay && s.weekNumber === weekNum,
    );
    if (exactMatch >= 0) return exactMatch;
    // Fallback: match by day only
    const dayMatch = aiStore.activePlan.sessions.findIndex((s) => s.dayOfWeek === currentDay);
    return dayMatch >= 0 ? dayMatch : -1; // -1 = rest day, not 0
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
    const isDur = isDuration(exercise.targetReps);
    const parsedReps = parseFirstRep(exercise.targetReps);

    let reps: number | undefined;
    let duration: number | undefined;

    if (isDur && parsedReps !== undefined) {
      const unit = splitReps(exercise.targetReps).unit.toLowerCase();
      if (unit.includes("sec")) {
        duration = Math.round((parsedReps / 60) * 10) / 10;
      } else {
        // Fallback for min, hr, etc. Assumes min for simplicity.
        duration = parsedReps;
      }
    } else {
      reps = parsedReps;
    }

    prefillData.value = {
      exerciseName: exercise.exerciseName,
      reps,
      duration,
      weight: parseWeight(exercise.targetWeight),
      rpe: exercise.targetRpe,
    };
    isLogFormOpen.value = true;
  }

  function openGoogleSearch(exerciseName?: string) {
    if (!exerciseName) return;
    window.open(
      `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${exerciseName} exercise`)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function copyPlanJson() {
    if (!aiStore.activePlan) return;
    navigator.clipboard
      .writeText(JSON.stringify(aiStore.activePlan, null, 2))
      .then(() => {
        toast({
          title: "Copied!",
          description: "Plan JSON copied to clipboard for debugging.",
        });
      })
      .catch((_err) => {
        toast({
          title: "Error",
          description: "Failed to copy plan JSON.",
          variant: "destructive",
        });
      });
  }

  function handleAskQuestion() {
    const question = userQuestion.value.trim();
    if (!question) return;
    userQuestion.value = "";
    aiStore.requestAdvice(question).then((result) => {
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

  function requestOffDayWorkout() {
    activeTab.value = "messages";
    aiStore
      .requestAdvice("I want to train today. Please recommend the next session from my plan.")
      .then((result) => {
        if (result.isErr()) {
          handleAiError(result.error);
        } else {
          scrollToTop();
        }
      });
  }

  function handleAiError(error: string) {
    const description =
      error === "missing-api-key"
        ? "No API Key configured! Please add one in your profile."
        : "Failed to get AI response. Please try again.";
    toast({ title: "AI Coaching Error", description, variant: "destructive" });
  }

  const debouncedRequestAdvice = useDebounceFn(() => {
    aiStore.requestAdvice().then((result) => {
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

  function formatTime(d: Date | string) {
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  onMounted(() => {
    aiStore.initialize();

    const hasPlan = !!aiStore.activePlan;
    const hasMessages = coachMessages.value.length > 0;

    if (!hasPlan && !hasMessages) {
      // Truly fresh start: no plan and no messages → generate first mesocycle
      aiStore.generateNewPlan().then((result) => {
        if (result.isErr()) handleAiError(result.error);
        else scrollToTop();
      });
    } else if (aiStore.isNewDataAvailable) {
      // Plan exists and new training data is available → ask AI to react
      // If we already know today's planned workout, navigate there immediately
      // so the user sees their exercises right away while the AI processes.
      if (planDerivedWorkout.value?.length) {
        activeTab.value = "today";
      }
      debouncedRequestAdvice();
    } else if (activeWorkout.value?.length) {
      // Existing workout with no new data → jump straight to Today tab
      activeTab.value = "today";
    }

    scrollToTop();
    window.addEventListener("keydown", onCoachKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener("keydown", onCoachKeydown);
  });

  // Sync page index when new coach messages arrive
  watch(
    () => coachMessages.value.length,
    (newLength) => {
      if (newLength > 0) {
        currentPageIndex.value = newLength - 1;
      }
    },
    { immediate: true },
  );

  // Scroll to top when new messages arrive
  watch(
    () => aiStore.messages.length,
    (newLength, oldLength) => {
      if (newLength > (oldLength || 0)) {
        scrollToTop();
      }
    },
  );

  // Once activeWorkout is populated (e.g. after AI responds), switch to Today tab
  // so the user sees their workout. Skip if they've manually navigated to Plan.
  watch(
    () => activeWorkout.value?.length,
    (length) => {
      if (length && activeTab.value !== "plan") {
        activeTab.value = "today";
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
    coachMessages,
    activeWorkoutGroups,
    activePlan,
    activeSessionIndex,
    currentWeekNumber,
    planDerivedWorkout,
    completedExercises,
    remainingExercises,
    cooldownProgressPercent,
    getExerciseProgress,
    isExerciseCompleted,
    isHighlighted,
    renderMarkdown,
    formatRestDuration,
    formatTime,
    debouncedRequestAdvice,
    handleLogExercise,
    handleAskQuestion,
    openGoogleSearch,
    regeneratePlan,
    requestOffDayWorkout,
    copyPlanJson,
  };
}
