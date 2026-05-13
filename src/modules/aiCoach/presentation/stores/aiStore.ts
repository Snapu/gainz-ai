import * as Sentry from "@sentry/vue";
import { err, ok, type Result } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

import {
  askCoachWithSingleRetry,
  classifyExerciseNames,
  getTodayLogsCount,
  mapTrainingFatigueTriggersToDeload,
  type PreviousAiMessage,
  responseStartsDeload,
} from "@/modules/aiCoach/application";
import { createAiCoachService } from "@/modules/aiCoach/infrastructure";
import { useDeloadStore } from "@/modules/deload/presentation";
import { useEventsStore } from "@/modules/events/presentation";
import {
  useExerciseMuscleMapStore,
  useTrainingSummaryStore,
} from "@/modules/platform/presentation";
import { useUserProfileStore } from "@/modules/profile/presentation";
import { localeDateString } from "@/modules/sharedKernel/presentation";
import {
  getMuscleActivation,
  normalizeExerciseName,
  useTrainingInsightsStore,
} from "@/modules/trainingInsights/presentation";
import { resolveCurrentSession, useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import {
  createAiAssistantMessage,
  createAiUserPlaceholder,
  removeMessageById,
  replaceMessageContentById,
  shouldUseCachedAssistantResponse,
  toPreviousAiMessages,
} from "./aiMessageHelpers";
import {
  cleanOldAiSessions,
  loadAiMessagesFromStorage,
  removeAiMessagesFromStorage,
  saveAiMessagesToStorage,
} from "./aiMessageStorage";

interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sessionDate: string;
  logsCount: number;
}

export const useAiStore = defineStore("ai", () => {
  const messages = ref<AiMessage[]>([]);
  const isLoading = ref(false);
  const hasInitialized = ref(false);
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

  function initialize(): void {
    if (hasInitialized.value) return;

    const loadedMessagesResult = loadAiMessagesFromStorage<AiMessage>(todaySessionDate.value);
    if (loadedMessagesResult.isErr()) {
      Sentry.captureMessage("Failed to load AI messages from storage", {
        level: "warning",
        tags: { scope: "ai-store", feature: "storage-load" },
      });
      messages.value = [];
    } else {
      messages.value = loadedMessagesResult.value;
    }

    cleanOldAiSessions();
    hasInitialized.value = true;
  }

  function ensureInitialized(): void {
    if (!hasInitialized.value) {
      initialize();
    }
  }

  function persistMessages(sessionDate: string): void {
    const saveResult = saveAiMessagesToStorage(sessionDate, messages.value);
    if (saveResult.isErr()) {
      Sentry.captureMessage("Failed to save AI messages to storage", {
        level: "warning",
        tags: { scope: "ai-store", feature: "storage-save" },
      });
    }
  }

  async function askAi(): Promise<Result<void, "missing-api-key" | "ai-failed">> {
    ensureInitialized();
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
    if (shouldUseCachedAssistantResponse(lastMessage, todayLogsCount, today)) {
      console.debug("No new logs since last AI response, using cached messages.");
      return ok(undefined);
    }

    await classifyExercisesIfNeeded();

    isLoading.value = true;
    let userMessageId = "";

    try {
      const previousMessages: PreviousAiMessage[] = toPreviousAiMessages(messages.value);

      const userMessage = createAiUserPlaceholder(today, todayLogsCount);
      userMessageId = userMessage.id;
      messages.value.push(userMessage);
      persistMessages(today);

      const result = await askCoachWithSingleRetry(
        aiCoachService,
        apiKey,
        userProfileStore.userProfile,
        trainingInsightsStore.insights,
        exerciseLogsStore.exerciseLogs,
        trainingSummaryStore.summaries,
        previousMessages,
        eventsStore.events,
      );

      if (result.isErr() && result.error === "missing-api-key") {
        messages.value = removeMessageById(messages.value, userMessageId);
        persistMessages(today);
        return err("missing-api-key");
      }

      if (result.isErr()) {
        messages.value = removeMessageById(messages.value, userMessageId);
        persistMessages(today);
        return err("ai-failed");
      }

      exerciseMuscleMapStore.refresh();

      if (responseStartsDeload(result.value.responseText) && !deloadStore.active) {
        const { riskScore, triggeredBy } = trainingInsightsStore.insights.fatigue;
        deloadStore.startDeload(riskScore, mapTrainingFatigueTriggersToDeload(triggeredBy));
      }

      messages.value = replaceMessageContentById(
        messages.value,
        userMessageId,
        result.value.requestPayload,
      );

      const assistantMessage = createAiAssistantMessage(
        today,
        todayLogsCount,
        result.value.responseText,
      );
      messages.value.push(assistantMessage);
      persistMessages(today);
      return ok(undefined);
    } catch (error) {
      console.error("AI request failed:", error);
      Sentry.captureException(error, {
        tags: { scope: "ai-store", feature: "ask-ai" },
        extra: { hasPendingUserMessage: !!userMessageId },
      });
      if (userMessageId) {
        messages.value = removeMessageById(messages.value, userMessageId);
        persistMessages(today);
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
    ensureInitialized();
    removeAiMessagesFromStorage(todaySessionDate.value);
    messages.value = [];
  }

  return {
    initialize,
    askAi,
    classifyExercisesIfNeeded,
    clearMessages,
    isLoading,
    messages,
    hasInitialized,
    inFlightRequest,
  };
});
