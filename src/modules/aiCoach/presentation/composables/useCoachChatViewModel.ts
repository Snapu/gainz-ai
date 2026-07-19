import { useDebounceFn } from "@vueuse/core";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import {
  type DisplayInsight,
  renderMarkdown,
  tryParseCoachingAdvice,
  useAiOrchestratorStore,
  useCoachChatStore,
  useTrainingPlanStore,
} from "@/modules/aiCoach/presentation";
import { useToast } from "@/shared/presentation/composables/useToast";

export function useCoachChatViewModel() {
  const orchestratorStore = useAiOrchestratorStore();
  const chatStore = useCoachChatStore();
  const planStore = useTrainingPlanStore();
  const { toast } = useToast();

  const currentPageIndex = ref(0);
  const userQuestion = ref("");
  const openScratchpads = ref<string[]>([]);
  const openRequestPayloads = ref<string[]>([]);
  const scrollContainerRef = ref<HTMLDivElement | null>(null);

  const coachMessages = computed<DisplayInsight[]>(() => {
    const allMessages = chatStore.messages;
    const indexById = new Map(allMessages.map((m, i) => [m.id, i]));
    const coachMessagesList = allMessages.filter((m) => m.role === "coach");
    return coachMessagesList.map((msg, idx) => {
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
        isLatest: idx === coachMessagesList.length - 1,
        rawContent: msg.content,
        parsedData,
        requestPayload,
      };
    });
  });

  function handleAskQuestion() {
    const question = userQuestion.value.trim();
    if (!question) return;
    userQuestion.value = "";
    orchestratorStore.requestAdvice(question).then((result) => {
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

  function handleAiError(error: string) {
    const description =
      error === "missing-api-key"
        ? "No API Key configured! Please add one in your profile."
        : "Failed to get AI response. Please try again.";
    toast({ title: "AI Coaching Error", description, variant: "destructive" });
  }

  const debouncedRequestAdvice = useDebounceFn(() => {
    orchestratorStore.requestAdvice().then((result) => {
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

  function scrollToTop() {
    nextTick(() => {
      if (scrollContainerRef.value) {
        scrollContainerRef.value.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  function formatTime(d: Date | string) {
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  onMounted(() => {
    orchestratorStore.initialize();

    const hasPlan = !!planStore.activePlan;
    const hasMessages = coachMessages.value.length > 0;

    if (!hasPlan && !hasMessages) {
      orchestratorStore.generateNewPlan().then((result) => {
        if (result.isErr()) handleAiError(result.error);
        else scrollToTop();
      });
    } else if (!chatStore.hasTodayCoachMessage) {
      debouncedRequestAdvice();
    }

    scrollToTop();
  });

  watch(
    () => coachMessages.value.length,
    (newLength) => {
      if (newLength > 0) {
        currentPageIndex.value = newLength - 1;
      }
    },
    { immediate: true },
  );

  watch(
    () => chatStore.messages.length,
    (newLength, oldLength) => {
      if (newLength > (oldLength || 0)) {
        scrollToTop();
      }
    },
  );

  return {
    chatStore,
    currentPageIndex,
    userQuestion,
    openScratchpads,
    openRequestPayloads,
    scrollContainerRef,
    coachMessages,
    handleAskQuestion,
    formatTime,
    renderMarkdown,
  };
}
