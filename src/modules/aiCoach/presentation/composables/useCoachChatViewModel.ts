import { computed, nextTick, onMounted, ref, watch } from "vue";
import {
  type DisplayInsight,
  getAiErrorDescription,
  renderMarkdown,
  tryParseCoachingAdvice,
  useAiOrchestratorStore,
  useCoachChatStore,
} from "@/modules/aiCoach/presentation";
import { useToast } from "@/shared/presentation/composables/useToast";

export function useCoachChatViewModel() {
  const orchestratorStore = useAiOrchestratorStore();
  const chatStore = useCoachChatStore();
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
      result.match(
        () => {
          scrollToTop();
        },
        (error) => {
          userQuestion.value = question;
          toast({
            title: "Error",
            description: getAiErrorDescription(error),
            variant: "destructive",
          });
        },
      );
    });
  }

  function scrollToTop() {
    nextTick().then(() => {
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
    orchestratorStore.ensureSessionAdvice().then((result) => {
      result
        .andTee(() => {
          scrollToTop();
        })
        .orTee((error) => {
          toast({
            title: "AI Coaching Error",
            description: getAiErrorDescription(error),
            variant: "destructive",
          });
        });
    });

    scrollToTop();
  });

  watch(
    () => coachMessages.value.length,
    (newLength) => {
      currentPageIndex.value = newLength > 0 ? newLength - 1 : 0;
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
