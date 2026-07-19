import * as Sentry from "@sentry/vue";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { watch } from "vue";

import {
  adviceStartsDeload,
  classifyExerciseNames,
  evaluateCompletedSessions,
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
import { createAiCoachService } from "@/modules/aiCoach/infrastructure";
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
import { useCoachChatStore } from "./coachChatStore";
import { useTrainingPlanStore } from "./trainingPlanStore";

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

export const useAiOrchestratorStore = defineStore("aiOrchestrator", () => {
  const chatStore = useCoachChatStore();
  const planStore = useTrainingPlanStore();

  const userProfileStore = useUserProfileStore();
  const exerciseLogsStore = useExerciseLogsStore();
  const trainingSummaryStore = useTrainingSummaryStore();
  const eventsStore = useEventsStore();
  const exerciseMuscleMapStore = useExerciseMuscleMapStore();
  const deloadStore = useDeloadStore();
  const trainingInsightsStore = useTrainingInsightsStore();

  const aiCoachService = createAiCoachService();

  let hasInitialized = false;

  function initialize(): void {
    if (hasInitialized) return;
    hasInitialized = true;

    planStore.initialize();
    chatStore.initialize();
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

  function handleCoachingSuccess(
    result: { advice: CoachingAdvice; requestPayload: string },
    userMessageId: string,
    currentId: string,
    todayLogsCount: number,
    todayLogsChecksum: string,
  ) {
    try {
      const advice = result.advice;
      if (advice.trainingPlan) {
        const oldSessionId = currentId;
        const newPlan = TrainingPlan.create(
          new Date().toISOString(),
          advice.trainingPlan.cycleWeeks,
          advice.trainingPlan.sessions,
        );
        planStore.setPlan(newPlan);

        const newSessionId = chatStore.currentSessionId;
        if (newSessionId !== oldSessionId) {
          chatStore.removeMessagesFromSession(oldSessionId);
          currentId = newSessionId;
          // Clean up old messages locally, keep only current user message
          chatStore.retainOnlyMessage(userMessageId);
        }
      }
    } catch (e) {
      Sentry.captureException(e, { tags: { scope: "ai-store", feature: "extract-plan" } });
    }

    exerciseMuscleMapStore.refresh();

    if (adviceStartsDeload(result.advice) && !deloadStore.active) {
      const { riskScore, triggeredBy } = trainingInsightsStore.insights.fatigue;
      deloadStore.startDeload(riskScore, mapTrainingFatigueTriggersToDeload(triggeredBy));
    }

    chatStore.updateMessageContent(userMessageId, result.requestPayload);

    const coachMessage = createCoachMessage(
      currentId,
      todayLogsCount,
      JSON.stringify(result.advice),
      todayLogsChecksum,
    );
    chatStore.addMessage(coachMessage);

    chatStore.lastRequestState = {
      date: isoDateString(new Date()),
      checksum: todayLogsChecksum,
    };
  }

  function handleCoachingError(error: unknown, userMessageId: string, _currentId: string) {
    if (userMessageId) {
      chatStore.removeMessage(userMessageId);
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

  function runCoachingRequest(
    question?: string,
    mode: "planning" | "execution" = "execution",
  ): ResultAsync<void, CoachingAdviceError> {
    const apiKey = userProfileStore.apiKey;
    if (!apiKey) {
      return errAsync("missing-api-key" as CoachingAdviceError);
    }

    chatStore.isLoading = true;
    chatStore.pendingRequest = null;

    return ResultAsync.fromPromise(
      (async (): Promise<void> => {
        const currentId = chatStore.currentSessionId;
        const currentSession = resolveCurrentSession(exerciseLogsStore.exerciseLogs);
        const todayLogsCount = getTodayLogsCount(aiCoachService, currentSession);
        const todayLogsChecksum = getTodayLogsChecksum(currentSession);
        const today = isoDateString(new Date());

        if (
          !question &&
          chatStore.lastRequestState.date === today &&
          chatStore.lastRequestState.checksum === todayLogsChecksum &&
          chatStore.messages.length > 0
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
          const previousMessages = [...chatStore.messages];
          if (question) {
            userMessage.content = question;
          }
          chatStore.addMessage(userMessage);

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
            activePlan: planStore.activePlan ?? undefined,
            completedSessionKeys: planStore.completedSessions,
          });

          if (result.isErr()) {
            throw result.error;
          }

          handleCoachingSuccess(
            result.value,
            userMessageId,
            currentId,
            todayLogsCount,
            todayLogsChecksum,
          );
        } catch (error) {
          handleCoachingError(error, userMessageId, currentId);
        }
      })(),
      (error) => (isCoachingAdviceError(error) ? error : "coaching-request-failed"),
    )
      .andThen((result) => {
        chatStore.isLoading = false;
        const pending = chatStore.pendingRequest;
        if (pending) return runCoachingRequest(pending.question, pending.mode);
        return okAsync(result);
      })
      .orElse((error) => {
        chatStore.isLoading = false;
        const pending = chatStore.pendingRequest;
        if (pending) return runCoachingRequest(pending.question, pending.mode);
        return errAsync(error);
      });
  }

  function requestAdvice(
    question?: string,
    mode: "planning" | "execution" = "execution",
  ): ResultAsync<void, CoachingAdviceError> {
    initialize();

    if (chatStore.isLoading) {
      chatStore.pendingRequest = { question, mode };
      return okAsync(undefined);
    }

    return runCoachingRequest(question, mode);
  }

  function generateNewPlan(): ResultAsync<void, CoachingAdviceError> {
    initialize();

    if (chatStore.isLoading) {
      chatStore.pendingRequest = {
        question: "Please generate a new 2-week mesocycle plan.",
        mode: "planning",
      };
      return okAsync(undefined);
    }

    return runCoachingRequest("Please generate a new 2-week mesocycle plan.", "planning");
  }

  // Watch for completed sessions logic
  watch(
    () => exerciseLogsStore.exerciseLogs,
    () => {
      const plan = planStore.activePlan;
      if (!plan) return;

      const resolveMuscle = (name: string) =>
        getMuscleActivation(name, exerciseMuscleMapStore.learnedMap)?.primaryMuscle;

      const { newCompletedSessions, hasChanged, isPlanFullyCompleted } = evaluateCompletedSessions(
        plan,
        planStore.completedSessions,
        exerciseLogsStore.exerciseLogs,
        normalizeExerciseName,
        resolveMuscle,
      );

      if (hasChanged) {
        planStore.setCompletedSessions(newCompletedSessions);

        if (isPlanFullyCompleted) {
          chatStore.clearMessages();
          planStore.clearPlan();
          planStore.clearCompletedSessions();
          generateNewPlan();
        }
      }
    },
    { immediate: true },
  );

  return {
    initialize,
    requestAdvice,
    generateNewPlan,
    classifyExercisesIfNeeded,
  };
});
