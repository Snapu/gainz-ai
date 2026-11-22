import { computed, onMounted, ref } from "vue";
import { TrainingPlan } from "@/modules/aiCoach/domain";
import {
  getAiErrorDescription,
  useAiOrchestratorStore,
  useCoachChatStore,
  useTrainingPlanStore,
} from "@/modules/aiCoach/presentation";
import { useToast } from "@/shared/presentation/composables/useToast";
import { t } from "@/shared/presentation/i18n";

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
            title: t("plan.regeneratedTitle"),
            description: t("plan.regeneratedDesc"),
            variant: "default",
          });
        },
        (error) => {
          toast({
            title: t("coach.errorTitle"),
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
          title: t("common.copied"),
          description: t("plan.copiedJsonDesc"),
        });
      })
      .catch((_err) => {
        toast({
          title: t("common.error"),
          description: t("plan.copyJsonFailedDesc"),
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
