import * as Sentry from "@sentry/vue";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

import {
  type AskAiError,
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
  logsChecksum?: string;
}

function isAskAiError(value: unknown): value is AskAiError {
  return (
    value === "missing-api-key" ||
    value === "ai-request-failed" ||
    value === "generate-content-stream-failed"
  );
}

function getTodayLogsChecksum(
  session: { logs: { id: string; reps?: number; weight?: number }[] } | null,
): string {
  if (!session) return "";
  return session.logs.map((l) => `${l.id}:${l.reps ?? ""}:${l.weight ?? ""}`).join("|");
}

export const useAiStore = defineStore("ai", () => {
  const messages = ref<AiMessage[]>([]);
  const isLoading = ref(false);
  const hasInitialized = ref(false);
  const lastRequestLogsChecksum = ref<string>("");
  const needsRerun = ref(false);

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

  function askAi(): ResultAsync<void, AskAiError> {
    ensureInitialized();

    if (isLoading.value) {
      needsRerun.value = true;
      return okAsync(undefined);
    }

    return runAskAi();
  }

  function runAskAi(): ResultAsync<void, AskAiError> {
    const apiKey = userProfileStore.apiKey;
    if (!apiKey) {
      return errAsync("missing-api-key");
    }

    isLoading.value = true;
    needsRerun.value = false;

    return ResultAsync.fromPromise(
      (async (): Promise<void> => {
        const today = todaySessionDate.value;
        const currentSession = resolveCurrentSession(exerciseLogsStore.exerciseLogs);
        const todayLogsCount = getTodayLogsCount(aiCoachService, currentSession);
        const todayLogsChecksum = getTodayLogsChecksum(currentSession);

        if (lastRequestLogsChecksum.value === todayLogsChecksum && messages.value.length > 0) {
          return;
        }

        await classifyExercisesIfNeeded();

        let userMessageId = "";

        try {
          const previousMessages: PreviousAiMessage[] = toPreviousAiMessages(messages.value);

          const userMessage = createAiUserPlaceholder(today, todayLogsCount, todayLogsChecksum);
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

          if (result.isErr()) {
            throw result.error;
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
            todayLogsChecksum,
          );
          messages.value.push(assistantMessage);
          persistMessages(today);
          lastRequestLogsChecksum.value = todayLogsChecksum;
        } catch (error) {
          if (userMessageId) {
            messages.value = removeMessageById(messages.value, userMessageId);
            persistMessages(today);
          }

          if (isAskAiError(error)) {
            throw error;
          }

          console.error("AI request failed:", error);
          Sentry.captureException(error, {
            tags: { scope: "ai-store", feature: "ask-ai" },
            extra: { hasPendingUserMessage: !!userMessageId },
          });
          throw "ai-request-failed" as const;
        }
      })(),
      (error) => (isAskAiError(error) ? error : "ai-request-failed"),
    )
      .andThen((result) => {
        isLoading.value = false;
        if (needsRerun.value) return runAskAi();
        return okAsync(result);
      })
      .orElse((error) => {
        isLoading.value = false;
        if (needsRerun.value) return runAskAi();
        return errAsync(error);
      });
  }

  function classifyExercisesIfNeeded(): ResultAsync<void, never> {
    const apiKey = userProfileStore.apiKey;
    if (!apiKey) return okAsync(undefined);

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
    if (unclassified.length === 0) return okAsync(undefined);

    return classifyExerciseNames(aiCoachService, unclassified, apiKey)
      .andTee((cleanupResult) => {
        exerciseMuscleMapStore.applyCleanupResults(cleanupResult);
      })
      .map(() => undefined)
      .orElse((error) => {
        Sentry.captureMessage("AI store exercise pre-classification failed", {
          level: "warning",
          tags: { scope: "ai-store", feature: "exercise-preclassification" },
          extra: { reason: error, unclassifiedCount: unclassified.length },
        });
        return okAsync(undefined);
      });
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
    _todaySessionDate: todaySessionDate,
  };
});
