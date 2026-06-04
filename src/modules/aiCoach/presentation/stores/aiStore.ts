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
import type { TrainingPlan } from "@/modules/aiCoach/domain";
import {
  clearPlan as clearStoragePlan,
  createAiCoachService,
  loadPlan,
  savePlan,
} from "@/modules/aiCoach/infrastructure";
import { useDeloadStore } from "@/modules/deload/presentation";
import { useEventsStore } from "@/modules/events/presentation";
import {
  useExerciseMuscleMapStore,
  useTrainingSummaryStore,
} from "@/modules/platform/presentation";
import { useUserProfileStore } from "@/modules/profile/presentation";
import { isoDateString } from "@/modules/sharedKernel/domain";
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
  sessionId: string;
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
  const activePlan = ref<TrainingPlan | null>(null);

  const userProfileStore = useUserProfileStore();
  const exerciseLogsStore = useExerciseLogsStore();
  const trainingSummaryStore = useTrainingSummaryStore();
  const eventsStore = useEventsStore();
  const exerciseMuscleMapStore = useExerciseMuscleMapStore();
  const deloadStore = useDeloadStore();
  const trainingInsightsStore = useTrainingInsightsStore();
  const aiCoachService = createAiCoachService();

  const currentSessionId = computed<string>(
    () =>
      resolveCurrentSession(exerciseLogsStore.exerciseLogs)?.sessionId ?? isoDateString(new Date()),
  );

  function initialize(): void {
    if (hasInitialized.value) return;

    activePlan.value = loadPlan();

    const loadedMessagesResult = loadAiMessagesFromStorage<AiMessage>(currentSessionId.value);
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

  function persistMessages(sessionId: string): void {
    const saveResult = saveAiMessagesToStorage(sessionId, messages.value);
    if (saveResult.isErr()) {
      Sentry.captureMessage("Failed to save AI messages to storage", {
        level: "warning",
        tags: { scope: "ai-store", feature: "storage-save" },
      });
    }
  }

  function askAi(question?: string): ResultAsync<void, AskAiError> {
    ensureInitialized();

    if (isLoading.value) {
      needsRerun.value = true;
      return okAsync(undefined);
    }

    return runAskAi(question);
  }

  function runAskAi(
    question?: string,
    mode: "planning" | "execution" = "execution",
  ): ResultAsync<void, AskAiError> {
    const apiKey = userProfileStore.apiKey;
    if (!apiKey) {
      return errAsync("missing-api-key");
    }

    isLoading.value = true;
    needsRerun.value = false;

    return ResultAsync.fromPromise(
      (async (): Promise<void> => {
        const currentId = currentSessionId.value;
        const currentSession = resolveCurrentSession(exerciseLogsStore.exerciseLogs);
        const todayLogsCount = getTodayLogsCount(aiCoachService, currentSession);
        const todayLogsChecksum = getTodayLogsChecksum(currentSession);

        if (
          !question &&
          lastRequestLogsChecksum.value === todayLogsChecksum &&
          messages.value.length > 0
        ) {
          return;
        }

        await classifyExercisesIfNeeded();

        let userMessageId = "";

        try {
          const previousMessages: PreviousAiMessage[] = toPreviousAiMessages(messages.value);

          const userMessage = createAiUserPlaceholder(currentId, todayLogsCount, todayLogsChecksum);
          if (question) {
            userMessage.content = question;
          }
          userMessageId = userMessage.id;
          messages.value.push(userMessage);
          persistMessages(currentId);

          const result = await askCoachWithSingleRetry(aiCoachService, {
            apiKey,
            userProfile: userProfileStore.userProfile,
            insights: trainingInsightsStore.insights,
            exerciseLogs: exerciseLogsStore.exerciseLogs,
            trainingSummaries: trainingSummaryStore.summaries,
            previousMessages,
            events: eventsStore.events,
            question,
            mode,
          });

          if (result.isErr()) {
            throw result.error;
          }

          try {
            const parsed = JSON.parse(result.value.responseText);
            if (parsed.trainingPlan) {
              const newPlan: TrainingPlan = {
                ...parsed.trainingPlan,
                createdAt: new Date().toISOString(),
              };
              savePlan(newPlan);
              activePlan.value = newPlan;
            }
          } catch (e) {
            Sentry.captureException(e, { tags: { scope: "ai-store", feature: "extract-plan" } });
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
            currentId,
            todayLogsCount,
            result.value.responseText,
            todayLogsChecksum,
          );
          messages.value.push(assistantMessage);
          persistMessages(currentId);
          lastRequestLogsChecksum.value = todayLogsChecksum;
        } catch (error) {
          if (userMessageId) {
            messages.value = removeMessageById(messages.value, userMessageId);
            persistMessages(currentId);
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
        if (needsRerun.value) return runAskAi(question, mode);
        return okAsync(result);
      })
      .orElse((error) => {
        isLoading.value = false;
        if (needsRerun.value) return runAskAi(question, mode);
        return errAsync(error);
      });
  }

  function generateNewPlan(): ResultAsync<void, AskAiError> {
    ensureInitialized();

    if (isLoading.value) {
      needsRerun.value = true;
      return okAsync(undefined);
    }

    return runAskAi("Please generate a new 2-week mesocycle plan.", "planning");
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
  const currentWorkoutPlan = computed<Array<{ exerciseName: string; restSeconds?: number }> | null>(
    () => {
      const lastAssistantMsg = [...messages.value].reverse().find((m) => m.role === "assistant");
      if (!lastAssistantMsg) return null;
      try {
        const parsed = JSON.parse(lastAssistantMsg.content);
        return (
          (parsed.recommendedWorkout as Array<{ exerciseName: string; restSeconds?: number }>) ||
          null
        );
      } catch {
        return null;
      }
    },
  );

  function clearMessages() {
    ensureInitialized();
    removeAiMessagesFromStorage(currentSessionId.value);
    messages.value = [];
  }

  function clearActivePlan() {
    clearStoragePlan();
    activePlan.value = null;
  }

  const isNewDataAvailable = computed<boolean>(() => {
    const currentSession = resolveCurrentSession(exerciseLogsStore.exerciseLogs);
    const todayLogsChecksum = getTodayLogsChecksum(currentSession);
    return messages.value.length === 0 || lastRequestLogsChecksum.value !== todayLogsChecksum;
  });

  return {
    initialize,
    askAi,
    generateNewPlan,
    classifyExercisesIfNeeded,
    clearMessages,
    clearActivePlan,
    isLoading,
    messages,
    hasInitialized,
    _currentSessionId: currentSessionId,
    activePlan,
    currentWorkoutPlan,
    isNewDataAvailable,
    lastRequestLogsChecksum,
  };
});
