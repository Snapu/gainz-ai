import { computed, getCurrentInstance, nextTick, onActivated, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  type CoachingAdvice,
  type CoachingMessage,
  type SuggestedFollowUp,
  sanitizeSuggestedFollowUps,
} from "@/modules/aiCoach/domain";
import {
  type DisplayExercise,
  getAiErrorDescription,
  renderMarkdown,
  tryParseCoachingAdvice,
  useAiOrchestratorStore,
  useCoachChatStore,
} from "@/modules/aiCoach/presentation";
import { useBillingStore } from "@/modules/billing/presentation";
import { useKeyboard } from "@/shared/presentation/composables/useKeyboard";
import { useToast } from "@/shared/presentation/composables/useToast";
import { t } from "@/shared/presentation/i18n";
import { formatTime } from "@/shared/presentation/i18n/formatters";
import { extractUserQuestion } from "../helpers/aiCoachPageHelpers";

export { extractUserQuestion };

export interface ChatBubbleMessage {
  id: string;
  role: "user" | "coach";
  content: string;
  timestamp: string;
  formattedTime: string;
  parsedAdvice?: CoachingAdvice | null;
  scratchpad?: string | null;
  recommendedWorkout?: DisplayExercise[];
  requestPayload?: string | null;
  suggestedFollowUps?: SuggestedFollowUp[];
}

export interface QuickPromptItem {
  id: string;
  label: string;
  prompt: string;
}

function findFollowUpsInBubbles(bubbles: ChatBubbleMessage[]): QuickPromptItem[] {
  const lastBubble = bubbles[bubbles.length - 1];
  if (lastBubble?.role !== "coach") {
    return [];
  }
  const followUps = sanitizeSuggestedFollowUps(lastBubble.suggestedFollowUps);
  if (!followUps || followUps.length === 0) {
    return [];
  }

  return followUps.map((sf, idx) => ({
    id: `followup-${lastBubble.id}-${idx}`,
    label: sf.label,
    prompt: sf.prompt,
  }));
}

function toUserBubble(
  msg: CoachingMessage,
  formatTimeFn: (d: Date | string) => string,
): ChatBubbleMessage | null {
  const question = extractUserQuestion(msg.content);
  if (!question) return null;
  return {
    id: msg.id,
    role: "user",
    content: question,
    timestamp: msg.timestamp,
    formattedTime: formatTimeFn(msg.timestamp),
  };
}

function toCoachBubble(
  msg: CoachingMessage,
  allMessages: CoachingMessage[],
  indexById: Map<string, number>,
  formatTimeFn: (d: Date | string) => string,
  isDev: boolean,
): ChatBubbleMessage {
  const parsedData = tryParseCoachingAdvice(msg.content);
  const msgIndex = indexById.get(msg.id);
  const previous = typeof msgIndex === "number" && msgIndex > 0 ? allMessages[msgIndex - 1] : null;
  const requestPayload =
    isDev &&
    previous?.role === "user" &&
    previous.content &&
    previous.content !== "AI request" &&
    previous.content.startsWith("# session")
      ? previous.content
      : null;

  return {
    id: msg.id,
    role: "coach",
    content: parsedData?.coachMessage ?? msg.content,
    timestamp: msg.timestamp,
    formattedTime: formatTimeFn(msg.timestamp),
    parsedAdvice: parsedData,
    scratchpad: parsedData?.scratchpad ?? null,
    recommendedWorkout: (parsedData?.recommendedWorkout as DisplayExercise[]) ?? undefined,
    requestPayload,
    suggestedFollowUps: parsedData?.suggestedFollowUps,
  };
}

export function useCoachChatViewModel(options: { isDev?: boolean } = {}) {
  const isDev = options.isDev ?? import.meta.env.DEV;
  const router = useRouter();
  const orchestratorStore = useAiOrchestratorStore();
  const chatStore = useCoachChatStore();
  const billingStore = useBillingStore();
  const { toast } = useToast();
  const { isKeyboardVisible } = useKeyboard();

  const userQuestion = ref("");
  const openScratchpads = ref<string[]>([]);
  const openRequestPayloads = ref<string[]>([]);
  const scrollContainerRef = ref<HTMLElement | null>(null);

  const isLoading = computed<boolean>(() => chatStore.isLoading);
  const streamingCoachMessage = computed<string>(() => chatStore.streamingCoachMessage);
  const showStarterBadge = computed<boolean>(
    () => billingStore.isFreeAllowance && billingStore.canUseCoach,
  );
  const starterRemainingCount = computed<number>(() => billingStore.freeCoachRemaining);
  const starterLimitCount = computed<number>(() => billingStore.freeCoachLimit);
  const isCoachLocked = computed<boolean>(() => !billingStore.canUseCoach);

  // Conversation stream containing user questions and coach responses
  const chatMessages = computed<ChatBubbleMessage[]>(() => {
    const allMessages = chatStore.messages;
    const indexById = new Map(allMessages.map((m, i) => [m.id, i]));
    const bubbles: ChatBubbleMessage[] = [];

    for (const msg of allMessages) {
      if (msg.role === "user") {
        const bubble = toUserBubble(msg, formatTime);
        if (bubble) bubbles.push(bubble);
      } else if (msg.role === "coach") {
        bubbles.push(toCoachBubble(msg, allMessages, indexById, formatTime, isDev));
      }
    }

    return bubbles;
  });

  const quickPrompts = computed<QuickPromptItem[]>(() => {
    return findFollowUpsInBubbles(chatMessages.value);
  });

  function handleAskQuestion(): void {
    const question = userQuestion.value.trim();
    if (!question || isLoading.value || isCoachLocked.value) return;
    userQuestion.value = "";
    scrollToBottom();
    void orchestratorStore.requestAdvice(question).match(
      () => {
        scrollToBottom();
      },
      (error) => {
        if (error === "payment-required") return;
        if (!userQuestion.value.trim()) {
          userQuestion.value = question;
        }
        toast({
          title: t("common.error"),
          description: getAiErrorDescription(error),
          variant: "destructive",
        });
      },
    );
  }

  function applyQuickPrompt(promptText: string): void {
    if (isLoading.value || isCoachLocked.value) return;
    userQuestion.value = promptText;
  }

  function toggleScratchpad(id: string): void {
    if (openScratchpads.value.includes(id)) {
      openScratchpads.value = openScratchpads.value.filter((item) => item !== id);
    } else {
      openScratchpads.value.push(id);
    }
  }

  function togglePayload(id: string): void {
    if (openRequestPayloads.value.includes(id)) {
      openRequestPayloads.value = openRequestPayloads.value.filter((item) => item !== id);
    } else {
      openRequestPayloads.value.push(id);
    }
  }

  function copyPayload(text?: string | null): void {
    if (!text || !navigator?.clipboard?.writeText) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast({
          title: t("common.copied"),
          description: t("coach.copiedPayloadDesc"),
        });
      })
      .catch(() => {
        toast({
          title: t("common.error"),
          description: t("coach.copyPayloadFailedDesc"),
          variant: "destructive",
        });
      });
  }

  function navigateToTrainTab(): void {
    router.push("/app/home");
  }

  function scrollToBottom(smooth = true): void {
    nextTick().then(() => {
      if (scrollContainerRef.value) {
        scrollContainerRef.value.scrollTo({
          top: scrollContainerRef.value.scrollHeight,
          behavior: smooth ? "smooth" : "auto",
        });
      }
    });
  }

  function triggerEnsureSessionAdvice(): void {
    void orchestratorStore
      .ensureSessionAdvice()
      .andTee(() => {
        scrollToBottom(false);
      })
      .orTee((error) => {
        if (error === "payment-required") return;
        toast({
          title: t("coach.errorTitle"),
          description: getAiErrorDescription(error),
          variant: "destructive",
        });
      });
  }

  if (getCurrentInstance()) {
    let isInitialMount = true;

    onMounted(() => {
      triggerEnsureSessionAdvice();
      scrollToBottom(false);
    });

    onActivated(() => {
      if (isInitialMount) {
        isInitialMount = false;
        return;
      }
      triggerEnsureSessionAdvice();
      scrollToBottom(false);
    });
  }

  watch(
    () => chatStore.messages.length,
    (newLength, oldLength) => {
      if (newLength > (oldLength || 0)) {
        scrollToBottom(true);
      }
    },
  );

  watch(isLoading, (loading) => {
    if (loading) {
      scrollToBottom(true);
    }
  });

  watch(streamingCoachMessage, (next, prev) => {
    if (!next) return;
    const el = scrollContainerRef.value;
    const isNearBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (!prev || isNearBottom) {
      scrollToBottom(false);
    }
  });

  watch(isKeyboardVisible, (visible) => {
    if (visible) {
      scrollToBottom(true);
    }
  });

  return {
    isDev,
    isLoading,
    streamingCoachMessage,
    userQuestion,
    openScratchpads,
    openRequestPayloads,
    scrollContainerRef,
    chatMessages,
    quickPrompts,
    isKeyboardVisible,
    showStarterBadge,
    starterRemainingCount,
    starterLimitCount,
    isCoachLocked,
    handleAskQuestion,
    applyQuickPrompt,
    toggleScratchpad,
    togglePayload,
    copyPayload,
    navigateToTrainTab,
    scrollToBottom,
    renderMarkdown,
  };
}
