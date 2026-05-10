import * as Sentry from "@sentry/vue";
import { err, ok, type Result } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

import {
  askCoach as askAiService,
  classifyExerciseNames,
  getTodayLogsCount,
  type PreviousAiMessage,
} from "@/modules/aiCoach/application";
import { createAiCoachService } from "@/modules/aiCoach/infrastructure";
import { useDeloadStore } from "@/modules/deload/presentation";
import { useEventsStore } from "@/modules/events/presentation";
import { useUserProfileStore } from "@/modules/profile/presentation";
import { localeDateString } from "@/modules/shared/domain";
import { useExerciseMuscleMapStore, useTrainingSummaryStore } from "@/modules/shared/presentation";
import { getMuscleActivation, normalizeExerciseName } from "@/modules/trainingInsights/domain";
import { useTrainingInsightsStore } from "@/modules/trainingInsights/presentation";
import { resolveCurrentSession } from "@/modules/trainingLogs/application";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";

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
  const exerciseMuscleMapStore = useExerciseMuscleMapStore();
  const deloadStore = useDeloadStore();
  const trainingInsightsStore = useTrainingInsightsStore();
  const aiCoachService = createAiCoachService();

  const todaySessionDate = computed(
    () =>
      resolveCurrentSession(exerciseLogsStore.exerciseLogs)?.sessionDate ??
      localeDateString(new Date()),
  );

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

    const today = todaySessionDate.value;
    const currentSession = resolveCurrentSession(exerciseLogsStore.exerciseLogs);
    const todayLogsCount = getTodayLogsCount(aiCoachService, currentSession);

    const lastMessage = messages.value[messages.value.length - 1];
    if (
      lastMessage?.role === "assistant" &&
      lastMessage.logsCount === todayLogsCount &&
      lastMessage.sessionDate === today
    ) {
      console.debug("No new logs since last AI response, using cached messages.");
      return ok(undefined);
    }

    await classifyExercisesIfNeeded();

    isLoading.value = true;
    let userMessageId = "";

    try {
      const previousMessages: PreviousAiMessage[] = messages.value.map((msg) => ({
        role: msg.role,
        content: msg.content,
        sessionDate: msg.sessionDate,
        timestamp: msg.timestamp.toISOString(),
        logsCount: msg.logsCount,
      }));

      userMessageId = `${Date.now()}-user`;
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

      const serviceArgs = [
        apiKey,
        userProfileStore.userProfile,
        trainingInsightsStore.insights,
        exerciseLogsStore.exerciseLogs,
        trainingSummaryStore.summaries,
        previousMessages,
        eventsStore.events,
      ] as const;

      let result = await askAiService(aiCoachService, ...serviceArgs);

      if (result.isErr()) {
        if (result.error === "missing-api-key") {
          messages.value = messages.value.filter((m) => m.id !== userMessageId);
          saveMessagesToStorage(today, messages.value);
          return err("missing-api-key");
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
        result = await askAiService(aiCoachService, ...serviceArgs);
      }

      if (result.isErr()) {
        messages.value = messages.value.filter((m) => m.id !== userMessageId);
        saveMessagesToStorage(today, messages.value);
        return err("ai-failed");
      }

      exerciseMuscleMapStore.refresh();

      try {
        const parsed: { startDeload?: boolean } = JSON.parse(result.value.responseText);
        if (parsed.startDeload === true && !deloadStore.active) {
          const { riskScore, triggeredBy } = trainingInsightsStore.insights.fatigue;
          deloadStore.startDeload(riskScore, triggeredBy);
        }
      } catch {
        // Non-critical: JSON parse errors are handled elsewhere
      }

      messages.value = messages.value.map((m) =>
        m.id === userMessageId ? { ...m, content: result.value.requestPayload } : m,
      );

      const assistantMessageId = `${Date.now()}-assistant`;
      const assistantMessage: AiMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: result.value.responseText,
        timestamp: new Date(),
        sessionDate: today,
        logsCount: todayLogsCount,
      };
      messages.value.push(assistantMessage);
      saveMessagesToStorage(today, messages.value);
      return ok(undefined);
    } catch (error) {
      console.error("AI request failed:", error);
      Sentry.captureException(error, {
        tags: { scope: "ai-store", feature: "ask-ai" },
        extra: { hasPendingUserMessage: !!userMessageId },
      });
      if (userMessageId) {
        messages.value = messages.value.filter((m) => m.id !== userMessageId);
        saveMessagesToStorage(today, messages.value);
      }
      return err("ai-failed");
    } finally {
      isLoading.value = false;
    }
  }

  async function classifyExercisesIfNeeded(): Promise<void> {
    const apiKey = userProfileStore.apiKey;
    if (!apiKey) return;

    const seen = new Set<string>();
    const unclassified: string[] = [];
    for (const log of exerciseLogsStore.exerciseLogs) {
      const canonical = normalizeExerciseName(log.exerciseName);
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      if (!getMuscleActivation(log.exerciseName, exerciseMuscleMapStore.learnedMap)) {
        unclassified.push(log.exerciseName);
      }
    }
    if (unclassified.length === 0) return;

    const result = await classifyExerciseNames(aiCoachService, unclassified, apiKey);
    if (result.isErr()) {
      Sentry.captureMessage("AI store exercise pre-classification failed", {
        level: "warning",
        tags: { scope: "ai-store", feature: "exercise-preclassification" },
        extra: { reason: result.error, unclassifiedCount: unclassified.length },
      });
      return;
    }
    exerciseMuscleMapStore.applyCleanupResults(result.value);
  }

  function clearMessages() {
    localStorage.removeItem(getStorageKey(todaySessionDate.value));
    messages.value = [];
  }

  return { askAi, classifyExercisesIfNeeded, clearMessages, isLoading, messages };
});
