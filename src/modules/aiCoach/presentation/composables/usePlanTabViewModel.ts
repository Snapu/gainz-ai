import { computed, onMounted, ref } from "vue";
import { TrainingPlan } from "@/modules/aiCoach/domain";
import {
  getAiErrorDescription,
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
      result.match(
        () => {
          toast({
            title: "Plan Regenerated",
            description: "Your training cycle has been updated.",
            variant: "default",
          });
        },
        (error) => {
          toast({
            title: "AI Coaching Error",
            description: getAiErrorDescription(error),
            variant: "destructive",
          });
        },
      );
    } finally {
      isRegenerating.value = false;
    }
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

  onMounted(() => {
    orchestratorStore.initialize();
  });

  return {
    planStore,
    isLoading,
    activePlan,
    activeSessionIndex,
    isPlanSessionCompleted,
    isRegenerating,
    regeneratePlan,
    copyPlanJson,
  };
}
