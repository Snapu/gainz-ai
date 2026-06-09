import * as Sentry from "@sentry/vue";
import { errAsync, okAsync, Result, ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

import {
  adviceStartsDeload,
  classifyExerciseNames,
  getTodayLogsCount,
  mapTrainingFatigueTriggersToDeload,
  requestAdviceWithSingleRetry,
} from "@/modules/aiCoach/application";
import {
  type CoachingAdvice,
  type CoachingAdviceError,
  type CoachingMessage,
  TrainingPlan,
} from "@/modules/aiCoach/domain";
import { createAiCoachService, LocalStoragePlanRepository } from "@/modules/aiCoach/infrastructure";
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

function createUserMessagePlaceholder(
  sessionId: string,
  logsCount: number,
  logsChecksum?: string,
): CoachingMessage {
  return {
    id: `${Date.now()}-user`,
    role: "user",
    content: "AI request",
    timestamp: new Date().toISOString(),
    sessionId,
    logsCount,
    logsChecksum,
  };
}

function createCoachMessage(
  sessionId: string,
  logsCount: number,
  responseText: string,
  logsChecksum?: string,
): CoachingMessage {
  return {
    id: `${Date.now()}-coach`,
    role: "coach",
    content: responseText,
    timestamp: new Date().toISOString(),
    sessionId,
    logsCount,
    logsChecksum,
  };
}

function removeMessageById(messages: CoachingMessage[], messageId: string): CoachingMessage[] {
  return messages.filter((msg) => msg.id !== messageId);
}

function replaceMessageContentById(
  messages: CoachingMessage[],
  messageId: string,
  content: string,
): CoachingMessage[] {
  return messages.map((msg) => (msg.id === messageId ? { ...msg, content } : msg));
}

import {
  cleanOldCoachingSessions,
  createPlanSessionId,
  extractDateFromSessionId,
  loadMessagesFromStorage,
  removeMessagesFromStorage,
  saveMessagesToStorage,
} from "@/modules/aiCoach/infrastructure/messageStorage";

function isCoachingAdviceError(value: unknown): value is CoachingAdviceError {
  return (
    value === "missing-api-key" ||
    value === "coaching-request-failed" ||
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
  const messages = ref<CoachingMessage[]>([]);
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
  const planRepository = new LocalStoragePlanRepository();

  const currentSessionId = computed<string>(() => {
    // Use the active plan's creation date as a stable conversation anchor.
    // This ensures messages persist across the entire mesocycle (not just one day).
    const plan = activePlan.value;
    if (plan?.createdAt) {
      return createPlanSessionId(isoDateString(new Date(plan.createdAt)));
    }
    // During a live workout session (no plan yet), use the workout session ID
    const session = resolveCurrentSession(exerciseLogsStore.exerciseLogs);
    if (session) return session.sessionId;
    // Fallback: today's date (for users without a plan)
    return isoDateString(new Date());
  });

  function initialize(): void {
    if (hasInitialized.value) return;
    hasInitialized.value = true;
    const planResult = planRepository.loadPlan();
    if (planResult.isOk() && planResult.value) {
      activePlan.value = planResult.value;
    }

    const loadedMessagesResult = loadMessagesFromStorage<CoachingMessage>(currentSessionId.value);
    if (loadedMessagesResult.isErr()) {
      Sentry.captureMessage("Failed to load messages from storage", {
        level: "warning",
        tags: { scope: "ai-store", feature: "storage-load" },
      });
      messages.value = [];
    } else {
      messages.value = loadedMessagesResult.value;
    }

    cleanOldCoachingSessions();
    hasInitialized.value = true;
  }

  function ensureInitialized(): void {
    if (!hasInitialized.value) {
      initialize();
    }
  }

  function persistMessages(sessionId: string): void {
    const saveResult = saveMessagesToStorage(sessionId, messages.value);
    if (saveResult.isErr()) {
      Sentry.captureMessage("Failed to save messages to storage", {
        level: "warning",
        tags: { scope: "ai-store", feature: "storage-save" },
      });
    }
  }

  function requestAdvice(
    question?: string,
    mode: "planning" | "execution" = "execution",
  ): ResultAsync<void, CoachingAdviceError> {
    ensureInitialized();

    if (isLoading.value) {
      needsRerun.value = true;
      return okAsync(undefined);
    }

    return runCoachingRequest(question, mode);
  }

  function runCoachingRequest(
    question?: string,
    mode: "planning" | "execution" = "execution",
  ): ResultAsync<void, CoachingAdviceError> {
    const apiKey = userProfileStore.apiKey;
    if (!apiKey) {
      return errAsync("missing-api-key" as CoachingAdviceError);
    }

    isLoading.value = true;
    needsRerun.value = false;

    return ResultAsync.fromPromise(
      (async (): Promise<void> => {
        let currentId = currentSessionId.value;
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

        const userMessage = createUserMessagePlaceholder(
          currentId,
          todayLogsCount,
          todayLogsChecksum,
        );
        const userMessageId = userMessage.id;

        try {
          const previousMessages = [...messages.value];

          if (question) {
            userMessage.content = question;
          }
          messages.value.push(userMessage);
          persistMessages(currentId);

          const result = await requestAdviceWithSingleRetry(aiCoachService, {
            apiKey,
            userProfile: userProfileStore.userProfile,
            insights: trainingInsightsStore.insights,
            exerciseLogs: exerciseLogsStore.exerciseLogs,
            trainingSummaries: trainingSummaryStore.summaries,
            previousMessages: previousMessages,
            events: eventsStore.events,
            question,
            mode,
          });

          if (result.isErr()) {
            throw result.error;
          }

          try {
            const advice = result.value.advice;
            if (advice.trainingPlan) {
              const oldSessionId = currentId; // captured before plan changes session ID
              const newPlan = TrainingPlan.create(
                new Date().toISOString(),
                advice.trainingPlan.cycleWeeks,
                advice.trainingPlan.sessions,
              );
              planRepository.savePlan(newPlan);
              activePlan.value = newPlan;
              const newSessionId = currentSessionId.value;
              if (newSessionId !== oldSessionId) {
                removeMessagesFromStorage(oldSessionId);
                currentId = newSessionId;

                // Atomically clear old messages now that the new plan is saved.
                // We keep the user's request so the coach message can be appended to it.
                messages.value = messages.value.filter((m) => m.id === userMessageId);
              }
            }
          } catch (e) {
            Sentry.captureException(e, { tags: { scope: "ai-store", feature: "extract-plan" } });
          }

          exerciseMuscleMapStore.refresh();

          if (adviceStartsDeload(result.value.advice) && !deloadStore.active) {
            const { riskScore, triggeredBy } = trainingInsightsStore.insights.fatigue;
            deloadStore.startDeload(riskScore, mapTrainingFatigueTriggersToDeload(triggeredBy));
          }

          messages.value = replaceMessageContentById(
            messages.value,
            userMessageId,
            result.value.requestPayload,
          );

          const coachMessage = createCoachMessage(
            currentId,
            todayLogsCount,
            JSON.stringify(result.value.advice),
            todayLogsChecksum,
          );
          messages.value.push(coachMessage);
          persistMessages(currentId);
          lastRequestLogsChecksum.value = todayLogsChecksum;
        } catch (error) {
          if (userMessageId) {
            messages.value = removeMessageById(messages.value, userMessageId);
            persistMessages(currentId);
          }

          if (isCoachingAdviceError(error)) {
            throw error;
          }

          console.error("AI request failed:", error);
          Sentry.captureException(error, {
            tags: { scope: "ai-store", feature: "ask-ai" },
            extra: { hasPendingUserMessage: !!userMessageId },
          });
          throw "coaching-request-failed" as const;
        }
      })(),
      (error) => (isCoachingAdviceError(error) ? error : "coaching-request-failed"),
    )
      .andThen((result) => {
        isLoading.value = false;
        if (needsRerun.value) return runCoachingRequest(question, mode);
        return okAsync(result);
      })
      .orElse((error) => {
        isLoading.value = false;
        if (needsRerun.value) return runCoachingRequest(question, mode);
        return errAsync(error);
      });
  }

  function generateNewPlan(): ResultAsync<void, CoachingAdviceError> {
    ensureInitialized();

    if (isLoading.value) {
      needsRerun.value = true;
      return okAsync(undefined);
    }

    return runCoachingRequest("Please generate a new 2-week mesocycle plan.", "planning");
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
      const lastCoachMessage = [...messages.value].reverse().find((m) => m.role === "coach");
      if (!lastCoachMessage) return null;

      const parsedResult = Result.fromThrowable(
        (json: string) => JSON.parse(json) as CoachingAdvice,
        () => new Error("Invalid json in coach message"),
      )(lastCoachMessage.content);

      if (parsedResult.isErr()) return null;
      return parsedResult.value.recommendedWorkout ?? null;
    },
  );

  function clearMessages() {
    initialize();
    removeMessagesFromStorage(currentSessionId.value);
    messages.value = [];
  }

  function resetPlan(): void {
    planRepository.clearPlan();
    activePlan.value = null;
    cleanOldCoachingSessions();
    messages.value = [];
    needsRerun.value = true;
  }

  function clearActivePlan() {
    planRepository.clearPlan();
    activePlan.value = null;
  }

  const isNewDataAvailable = computed<boolean>(() => {
    const currentSession = resolveCurrentSession(exerciseLogsStore.exerciseLogs);
    const todayLogsChecksum = getTodayLogsChecksum(currentSession);
    return messages.value.length === 0 || lastRequestLogsChecksum.value !== todayLogsChecksum;
  });

  return {
    initialize,
    requestAdvice,
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
