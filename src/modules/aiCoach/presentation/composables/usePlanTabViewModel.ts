import { computed, getCurrentInstance, onMounted, ref } from "vue";
import { TrainingPlan } from "@/modules/aiCoach/domain";
import {
  getAiErrorDescription,
  useAiOrchestratorStore,
  useCoachChatStore,
  useTrainingPlanStore,
} from "@/modules/aiCoach/presentation";
import { useBillingStore } from "@/modules/billing/presentation";
import { useToast } from "@/shared/presentation/composables/useToast";
import { t } from "@/shared/presentation/i18n";

export function usePlanTabViewModel() {
  const orchestratorStore = useAiOrchestratorStore();
  const chatStore = useCoachChatStore();
  const planStore = useTrainingPlanStore();
  const billingStore = useBillingStore();
  const { toast } = useToast();

  const activePlan = computed(() => planStore.activePlan);
  const isLoading = computed(() => chatStore.isLoading);
  const showStarterBadge = computed<boolean>(
    () => billingStore.isFreeAllowance && billingStore.canUseCoach,
  );
  const starterRemainingCount = computed<number>(() => billingStore.freeCoachRemaining);
  const starterLimitCount = computed<number>(() => billingStore.freeCoachLimit);
  const isCoachLocked = computed<boolean>(() => !billingStore.canUseCoach);
  const isInPastDueGrace = computed<boolean>(() => billingStore.isInPastDueGrace);
  const isPollingCheckout = computed<boolean>(() => billingStore.isPollingCheckout);

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
    if (isCoachLocked.value) return;
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
          if (error === "payment-required") return;
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

  if (getCurrentInstance()) {
    onMounted(() => {
      orchestratorStore.initialize();
    });
  }

  return {
    planStore,
    isLoading,
    activePlan,
    activeSessionIndex,
    showStarterBadge,
    starterRemainingCount,
    starterLimitCount,
    isCoachLocked,
    isInPastDueGrace,
    isPollingCheckout,
    isPlanSessionCompleted,
    isRegenerating,
    regeneratePlan,
    copyPlanJson,
  };
}
