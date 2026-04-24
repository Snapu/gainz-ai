import { err, ok, type Result } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { askAi as askAiService, getTodayLogsCount } from "@/services/ai.ts";
import { localeDateString } from "@/services/utils/date";
import { useEventsStore } from "@/stores/events";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";
import { useTrainingSummaryStore } from "@/stores/trainingSummary";
import { useUserProfileStore } from "@/stores/userProfile";

interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sessionDate: string;
  logsCount: number;
}

const STORAGE_KEY_PREFIX = "ai-messages-";
const MAX_SESSION_AGE_DAYS = 7;

function getStorageKey(sessionDate: string): string {
  return `${STORAGE_KEY_PREFIX}${sessionDate}`;
}

function loadMessagesFromStorage(sessionDate: string): AiMessage[] {
  try {
    const stored = localStorage.getItem(getStorageKey(sessionDate));
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    return parsed.map((msg: AiMessage) => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    }));
  } catch (error) {
    console.error("Failed to load messages from storage:", error);
    return [];
  }
}

function saveMessagesToStorage(sessionDate: string, messages: AiMessage[]) {
  try {
    localStorage.setItem(getStorageKey(sessionDate), JSON.stringify(messages));
  } catch (error) {
    console.error("Failed to save messages to storage:", error);
  }
}

function cleanOldSessions() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_SESSION_AGE_DAYS);

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_KEY_PREFIX)) {
      const sessionDateStr = key.replace(STORAGE_KEY_PREFIX, "");
      // Simple date comparison - could be improved with proper parsing
      if (sessionDateStr < localeDateString(cutoffDate)) {
        keysToRemove.push(key);
      }
    }
  }

  keysToRemove.forEach((key) => {
    localStorage.removeItem(key);
  });
}

export const useAiStore = defineStore("ai", () => {
  const messages = ref<AiMessage[]>([]);
  const isLoading = ref(false);
  const inFlightRequest = ref<Promise<Result<void, "missing-api-key" | "ai-failed">> | null>(null);

  const userProfileStore = useUserProfileStore();
  const exerciseLogsStore = useExerciseLogsStore();
  const trainingSummaryStore = useTrainingSummaryStore();
  const eventsStore = useEventsStore();

  const todaySessionDate = computed(() => localeDateString(new Date()));

  // Load today's messages on initialization
  messages.value = loadMessagesFromStorage(todaySessionDate.value);
  cleanOldSessions();

  async function askAi(): Promise<Result<void, "missing-api-key" | "ai-failed">> {
    if (inFlightRequest.value) {
      return inFlightRequest.value;
    }

    const request = runAskAi();
    inFlightRequest.value = request;

    try {
      return await request;
    } finally {
      inFlightRequest.value = null;
    }
  }

  async function runAskAi(): Promise<Result<void, "missing-api-key" | "ai-failed">> {
    const apiKey = userProfileStore.apiKey;
    if (!apiKey) {
      return err("missing-api-key");
    }

    const today = localeDateString(new Date());
    const todayLogsCount = getTodayLogsCount(exerciseLogsStore.exerciseLogs);

    // Check if we need to make a new request
    const lastMessage = messages.value[messages.value.length - 1];
    if (
      lastMessage?.role === "assistant" &&
      lastMessage.logsCount === todayLogsCount &&
      lastMessage.sessionDate === today
    ) {
      console.debug("No new logs since last AI response, using cached messages.");
      return ok(undefined);
    }

    isLoading.value = true;

    try {
      type PreviousMessagesParam = Parameters<typeof askAiService>[4];

      const previousMessages: PreviousMessagesParam = messages.value.map((msg) => ({
        role: msg.role,
        content: msg.content,
        sessionDate: msg.sessionDate,
        timestamp: msg.timestamp.toISOString(),
        logsCount: msg.logsCount,
      }));

      const userMessageId = `${Date.now()}-user`;
      const userMessage: AiMessage = {
        id: userMessageId,
        role: "user",
        content: "AI request",
        timestamp: new Date(),
        sessionDate: today,
        logsCount: todayLogsCount,
      };
      messages.value.push(userMessage);
      saveMessagesToStorage(today, messages.value);

      const result = await askAiService(
        apiKey,
        userProfileStore.userProfile,
        exerciseLogsStore.exerciseLogs,
        trainingSummaryStore.summaries,
        previousMessages,
        eventsStore.events,
      );

      if (result.isErr()) {
        // Remove the "AI request" user message on failure so we can retry
        messages.value = messages.value.filter((m) => m.id !== userMessageId);
        saveMessagesToStorage(today, messages.value);

        switch (result.error) {
          case "missing-api-key":
            return err("missing-api-key");
          case "generate-content-stream-failed":
            return err("ai-failed");
        }
      }

      // Save assistant message
      const assistantMessageId = `${Date.now()}-assistant`;
      const assistantMessage: AiMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: result.value,
        timestamp: new Date(),
        sessionDate: today,
        logsCount: todayLogsCount,
      };
      messages.value.push(assistantMessage);
      return ok(undefined);
    } catch (error) {
      console.error("AI request failed:", error);
      return err("ai-failed");
    } finally {
      isLoading.value = false;
    }
  }

  return { askAi, isLoading, messages };
});
