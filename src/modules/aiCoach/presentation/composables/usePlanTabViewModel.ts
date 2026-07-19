import { computed, onMounted, ref } from "vue";
import { TrainingPlan } from "@/modules/aiCoach/domain";
import {
  useAiOrchestratorStore,
  useCoachChatStore,
  useTrainingPlanStore,
} from "@/modules/aiCoach/presentation";
import { useToast } from "@/shared/presentation/composables/useToast";

export function usePlanTabViewModel() {
  const orchestratorStore = useAiOrchestratorStore();
  const chatStore = useCoachChatStore();
  const planStore = useTrainingPlanStore();
  const { toast } = useToast();

  const activePlan = computed(() => planStore.activePlan);
  const isLoading = computed(() => chatStore.isLoading);
  const currentDayOfWeek = computed(() => new Date().getDay());

  const currentWeekNumber = computed<number>(() => {
    if (!planStore.activePlan) return 1;
    return planStore.activePlan.getCurrentWeekNumber(new Date());
  });

  const activeSessionIndex = computed<number>(() => {
    if (!planStore.activePlan) return -1;

    const session = planStore.activePlan.getNextUncompletedSession(planStore.completedSessions);
    if (!session) return -1;

    return planStore.activePlan.sessions.findIndex(
      (s) => s.dayOfWeek === session.dayOfWeek && s.weekNumber === session.weekNumber,
    );
  });

  const isPlanSessionCompleted = (weekNumber: number, dayOfWeek: number) => {
    return planStore.completedSessions.has(TrainingPlan.sessionKey(weekNumber, dayOfWeek));
  };

  const isRegenerating = ref(false);

  async function regeneratePlan() {
    isRegenerating.value = true;
    try {
      const result = await orchestratorStore.generateNewPlan();
      if (result.isErr()) {
        handleAiError(result.error);
      } else {
        toast({
          title: "Plan Regenerated",
          description: "Your training cycle has been updated.",
          variant: "default",
        });
      }
    } finally {
      isRegenerating.value = false;
    }
  }

  function handleAiError(error: string) {
    const description =
      error === "missing-api-key"
        ? "No API Key configured! Please add one in your profile."
        : "Failed to get AI response. Please try again.";
    toast({ title: "AI Coaching Error", description, variant: "destructive" });
  }

  function copyPlanJson() {
    if (!planStore.activePlan) return;
    navigator.clipboard
      .writeText(JSON.stringify(planStore.activePlan, null, 2))
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

  function copyDebugState() {
    const debugState = {
      activePlan: planStore.activePlan,
      completedSessions: Array.from(planStore.completedSessions),
      activeSessionIndex: activeSessionIndex.value,
      currentWeekNumber: currentWeekNumber.value,
      currentDayOfWeek: currentDayOfWeek.value,
    };

    navigator.clipboard
      .writeText(JSON.stringify(debugState, null, 2))
      .then(() => {
        toast({
          title: "Copied!",
          description: "Debug state copied to clipboard.",
        });
      })
      .catch((_err) => {
        toast({
          title: "Error",
          description: "Failed to copy debug state.",
          variant: "destructive",
        });
      });
  }

  onMounted(() => {
    orchestratorStore.initialize();
  });

  return {
    planStore,
    isLoading,
    activePlan,
    activeSessionIndex,
    currentDayOfWeek,
    currentWeekNumber,
    isPlanSessionCompleted,
    isRegenerating,
    regeneratePlan,
    copyPlanJson,
    copyDebugState,
  };
}
