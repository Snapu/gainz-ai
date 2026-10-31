import { computed, getCurrentInstance, nextTick, onActivated, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { CoachingAdvice, CoachingMessage } from "@/modules/aiCoach/domain";
import {
  type DisplayExercise,
  type DisplayInsight,
  getAiErrorDescription,
  renderMarkdown,
  tryParseCoachingAdvice,
  useAiOrchestratorStore,
  useCoachChatStore,
} from "@/modules/aiCoach/presentation";
import { useUserProfileStore } from "@/modules/profile/presentation";
import { useKeyboard } from "@/shared/presentation/composables/useKeyboard";
import { useToast } from "@/shared/presentation/composables/useToast";

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
}

export type QuickPromptIcon = "ArrowLeftRight" | "BatteryLow" | "Clock" | "ShieldAlert";

interface QuickPromptItem {
  id: string;
  label: string;
  prompt: string;
  icon: QuickPromptIcon;
}

/**
 * Extracts a human-readable user question from message content, filtering out
 * internal automated request triggers and raw prompt context payloads.
 */
export function extractUserQuestion(content?: string | null): string | null {
  if (!content) return null;
  const trimmed = content.trim();
  if (
    !trimmed ||
    trimmed === "AI request" ||
    trimmed === "Please generate a new 2-week mesocycle plan."
  ) {
    return null;
  }

  // Check if content is an assembled system prompt payload (which always starts with # session and metadata/sections)
  if (
    (trimmed.startsWith("# session\n") || trimmed.startsWith("# session\r\n")) &&
    (/(?:^|\r?\n)(?:date|mode|phase|status):/m.test(trimmed) ||
      /(?:^|\r?\n)# (?:workload|muscles|exercises|e1rm|today|program|events|history|logs|update|profile)/m.test(
        trimmed,
      ))
  ) {
    const match = trimmed.match(
      /(?:^|\r?\n)# question\r?\n([\s\S]*?)(?=(?:\r?\n){1,2}# (?:workload|muscles|exercises|e1rm|update|plan|profile|goals|today|program|events|history|logs|\d+d|all)(?:\r?\n|$)|$)/,
    );
    if (match?.[1]) {
      const q = match[1].trim();
      if (!q || q === "AI request" || q === "Please generate a new 2-week mesocycle plan.") {
        return null;
      }
      return q;
    }
    // Assembled prompt payload without an explicit user question (automated daily advice/session trigger)
    return null;
  }

  return trimmed;
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
): ChatBubbleMessage {
  const parsedData = tryParseCoachingAdvice(msg.content);
  const msgIndex = indexById.get(msg.id);
  const previous = typeof msgIndex === "number" && msgIndex > 0 ? allMessages[msgIndex - 1] : null;
  const requestPayload =
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
  };
}

export function useCoachChatViewModel() {
  const router = useRouter();
  const orchestratorStore = useAiOrchestratorStore();
  const chatStore = useCoachChatStore();
  const profileStore = useUserProfileStore();
  const { toast } = useToast();
  const { isKeyboardVisible } = useKeyboard();

  const currentPageIndex = ref(0);
  const userQuestion = ref("");
  const openScratchpads = ref<string[]>([]);
  const openRequestPayloads = ref<string[]>([]);
  const scrollContainerRef = ref<HTMLElement | null>(null);

  const isLoading = computed<boolean>(() => chatStore.isLoading);
  const hasApiKey = computed<boolean>(() => Boolean(profileStore.apiKey));

  const quickPrompts: QuickPromptItem[] = [
    {
      id: "swap",
      label: "Swap Exercise",
      prompt: "An exercise machine is occupied. What alternative exercise can I substitute today?",
      icon: "ArrowLeftRight",
    },
    {
      id: "fatigue",
      label: "Feeling Fatigued",
      prompt:
        "I'm feeling unusually tired today. Should I adjust volume, intensity, or take a deload?",
      icon: "BatteryLow",
    },
    {
      id: "short-time",
      label: "Short on Time",
      prompt: "I only have 30 minutes to train today. How should I condense today's workout?",
      icon: "Clock",
    },
    {
      id: "deload",
      label: "Deload Advice",
      prompt: "Based on my recent volume and fatigue metrics, do you recommend a deload week?",
      icon: "ShieldAlert",
    },
  ];

  function formatTime(d: Date | string): string {
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Preserved for backwards compatibility with tests and existing callers
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
        bubbles.push(toCoachBubble(msg, allMessages, indexById, formatTime));
      }
    }

    return bubbles;
  });

  function handleAskQuestion(): void {
    const question = userQuestion.value.trim();
    if (!question || isLoading.value) return;
    userQuestion.value = "";
    scrollToBottom();
    void orchestratorStore.requestAdvice(question).match(
      () => {
        scrollToBottom();
      },
      (error) => {
        if (!userQuestion.value.trim()) {
          userQuestion.value = question;
        }
        toast({
          title: "Error",
          description: getAiErrorDescription(error),
          variant: "destructive",
        });
      },
    );
  }

  function applyQuickPrompt(promptText: string, autoSend = true): void {
    userQuestion.value = promptText;
    if (autoSend) {
      handleAskQuestion();
    }
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
          title: "Copied!",
          description: "Debug prompt payload copied to clipboard.",
        });
      })
      .catch(() => {
        toast({
          title: "Error",
          description: "Failed to copy payload.",
          variant: "destructive",
        });
      });
  }

  function navigateToApiKeySetup(): void {
    router.push("/wizard/apikey?mode=edit");
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
    if (profileStore.apiKey) {
      void orchestratorStore
        .ensureSessionAdvice()
        .andTee(() => {
          scrollToBottom(false);
        })
        .orTee((error) => {
          if (error !== "missing-api-key") {
            toast({
              title: "AI Coaching Error",
              description: getAiErrorDescription(error),
              variant: "destructive",
            });
          }
        });
    }
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

    // Reactively trigger session advice if user configures API key while cached in <keep-alive>
    watch(
      () => profileStore.apiKey,
      (newKey, oldKey) => {
        if (newKey && !oldKey && chatStore.messages.length === 0) {
          triggerEnsureSessionAdvice();
        }
      },
    );
  }

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
        scrollToBottom(true);
      }
    },
  );

  watch(isLoading, (loading) => {
    if (loading) {
      scrollToBottom(true);
    }
  });

  watch(isKeyboardVisible, (visible) => {
    if (visible) {
      scrollToBottom(true);
    }
  });

  return {
    isLoading,
    currentPageIndex,
    userQuestion,
    openScratchpads,
    openRequestPayloads,
    scrollContainerRef,
    coachMessages,
    chatMessages,
    quickPrompts,
    hasApiKey,
    isKeyboardVisible,
    handleAskQuestion,
    applyQuickPrompt,
    toggleScratchpad,
    togglePayload,
    copyPayload,
    navigateToApiKeySetup,
    navigateToTrainTab,
    scrollToBottom,
    renderMarkdown,
  };
}
