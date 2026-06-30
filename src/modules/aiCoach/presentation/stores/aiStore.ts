import * as Sentry from "@sentry/vue";
import { useLocalStorage } from "@vueuse/core";
import { errAsync, okAsync, Result, ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref, shallowRef, watch } from "vue";

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
import {
  createAiCoachService,
  LocalStorageMessageRepository,
  LocalStoragePlanRepository,
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
  const lastRequestState = useLocalStorage<{ date: string; checksum: string }>(
    "ai-coach:last-request-state",
    { date: "", checksum: "" },
  );
  const pendingRequest = ref<{ question?: string; mode: "planning" | "execution" } | null>(null);
  const activePlan = shallowRef<TrainingPlan | null>(null);
  const completedSessions = ref<Set<string>>(new Set());

  const userProfileStore = useUserProfileStore();
  const exerciseLogsStore = useExerciseLogsStore();
  const trainingSummaryStore = useTrainingSummaryStore();
  const eventsStore = useEventsStore();
  const exerciseMuscleMapStore = useExerciseMuscleMapStore();
  const deloadStore = useDeloadStore();
  const trainingInsightsStore = useTrainingInsightsStore();
  const aiCoachService = createAiCoachService();
  const planRepository = new LocalStoragePlanRepository();
  const messageRepository = new LocalStorageMessageRepository();

  const activeSession = computed(() => resolveCurrentSession(exerciseLogsStore.exerciseLogs));

  const currentSessionId = computed<string>(() => {
    // Anchor messages to the start of the day of the active session
    // This keeps pre-workout and mid-workout chat on the same ID, and supports midnight spanning
    const session = activeSession.value;
    const boundary = session
      ? new Date(session.startTime).setHours(0, 0, 0, 0)
      : new Date().setHours(0, 0, 0, 0);
    return isoDateString(new Date(boundary));
  });

  watch(currentSessionId, (newSessionId, oldSessionId) => {
    if (!hasInitialized.value || newSessionId === oldSessionId) return;

    const loadedMessagesResult = messageRepository.loadMessages(newSessionId);
    if (loadedMessagesResult.isOk()) {
      messages.value = loadedMessagesResult.value;
    } else {
      messages.value = [];
    }
  });

  function initialize(): void {
    if (hasInitialized.value) return;
    hasInitialized.value = true;
    const planResult = planRepository.loadPlan();
    if (planResult.isOk() && planResult.value) {
      activePlan.value = planResult.value;
    }

    const completedResult = planRepository.loadCompletedSessions();
    if (completedResult.isOk()) {
      completedSessions.value = new Set(completedResult.value);
    }

    const loadedMessagesResult = messageRepository.loadMessages(currentSessionId.value);
    if (loadedMessagesResult.isErr()) {
      Sentry.captureMessage("Failed to load messages from storage", {
        level: "warning",
        tags: { scope: "ai-store", feature: "storage-load" },
      });
      messages.value = [];
    } else {
      messages.value = loadedMessagesResult.value;
    }

    messageRepository.cleanOldSessions();
  }

  function requestAdvice(
    question?: string,
    mode: "planning" | "execution" = "execution",
  ): ResultAsync<void, CoachingAdviceError> {
    initialize();

    if (isLoading.value) {
      pendingRequest.value = { question, mode };
      return okAsync(undefined);
    }

    return runCoachingRequest(question, mode);
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
        planRepository.savePlan(newPlan);
        activePlan.value = newPlan;
        const newSessionId = currentSessionId.value;
        if (newSessionId !== oldSessionId) {
          messageRepository.removeMessages(oldSessionId);
          currentId = newSessionId;
          messages.value = messages.value.filter((m) => m.id === userMessageId);
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

    messages.value = replaceMessageContentById(
      messages.value,
      userMessageId,
      result.requestPayload,
    );

    const coachMessage = createCoachMessage(
      currentId,
      todayLogsCount,
      JSON.stringify(result.advice),
      todayLogsChecksum,
    );
    messages.value.push(coachMessage);
    messageRepository.saveMessages(currentId, messages.value);
    lastRequestState.value = {
      date: isoDateString(new Date()),
      checksum: todayLogsChecksum,
    };
  }

  function handleCoachingError(error: unknown, userMessageId: string, currentId: string) {
    if (userMessageId) {
      messages.value = removeMessageById(messages.value, userMessageId);
      messageRepository.saveMessages(currentId, messages.value);
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

    isLoading.value = true;
    pendingRequest.value = null;

    return ResultAsync.fromPromise(
      (async (): Promise<void> => {
        const currentId = currentSessionId.value;
        const currentSession = resolveCurrentSession(exerciseLogsStore.exerciseLogs);
        const todayLogsCount = getTodayLogsCount(aiCoachService, currentSession);
        const todayLogsChecksum = getTodayLogsChecksum(currentSession);
        const today = isoDateString(new Date());

        if (
          !question &&
          lastRequestState.value.date === today &&
          lastRequestState.value.checksum === todayLogsChecksum &&
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
          messageRepository.saveMessages(currentId, messages.value);

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
            activePlan: activePlan.value ?? undefined,
            completedSessionKeys: completedSessions.value,
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
        isLoading.value = false;
        const pending = pendingRequest.value;
        if (pending) return runCoachingRequest(pending.question, pending.mode);
        return okAsync(result);
      })
      .orElse((error) => {
        isLoading.value = false;
        const pending = pendingRequest.value;
        if (pending) return runCoachingRequest(pending.question, pending.mode);
        return errAsync(error);
      });
  }

  function generateNewPlan(): ResultAsync<void, CoachingAdviceError> {
    initialize();

    if (isLoading.value) {
      pendingRequest.value = {
        question: "Please generate a new 2-week mesocycle plan.",
        mode: "planning",
      };
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
    messages.value = [];
    messageRepository.removeMessages(currentSessionId.value);
  }

  function evaluateCompletedSessions() {
    const plan = activePlan.value;
    if (!plan) return;

    // Reset completedSessions before evaluating, since we rely ENTIRELY on the current cycle's logs
    const newCompletedSessions = new Set<string>();

    // Group logs by local date
    const logsByDate = new Map<
      string,
      { date: Date; logs: typeof exerciseLogsStore.exerciseLogs }
    >();

    const today = new Date();

    for (const log of exerciseLogsStore.exerciseLogs) {
      if (!plan.isInCurrentCycle(log.loggedAt, today)) continue;

      const key = `${log.loggedAt.getFullYear()}-${log.loggedAt.getMonth()}-${log.loggedAt.getDate()}`;
      if (!logsByDate.has(key)) {
        logsByDate.set(key, { date: log.loggedAt, logs: [] });
      }
      logsByDate.get(key)!.logs.push(log);
    }

    let changed = false;

    for (const { date, logs } of logsByDate.values()) {
      const weekNum = plan.getCurrentWeekNumber(date);
      const dayOfWeek = date.getDay();

      let satisfiedSession = plan.getPlannedSessionForDay(dayOfWeek, weekNum);
      const resolveMuscle = (name: string) => getMuscleActivation(name, exerciseMuscleMapStore.learnedMap)?.primaryMuscle;

      if (!satisfiedSession || !plan.isSessionSatisfiedByLogs(satisfiedSession, logs, normalizeExerciseName, resolveMuscle)) {
        // Fallback: Check if the logs satisfy ANY uncompleted session
        const uncompletedSessions = plan.sessions.filter(
          (s) => !newCompletedSessions.has(TrainingPlan.sessionKey(s.weekNumber, s.dayOfWeek))
        );
        
        satisfiedSession = uncompletedSessions.find((s) => 
          plan.isSessionSatisfiedByLogs(s, logs, normalizeExerciseName, resolveMuscle)
        );
      }

      if (satisfiedSession) {
        const sessionKey = TrainingPlan.sessionKey(satisfiedSession.weekNumber, satisfiedSession.dayOfWeek);
        if (!newCompletedSessions.has(sessionKey)) {
          newCompletedSessions.add(sessionKey);
        }
      }
    }

    if (newCompletedSessions.size !== completedSessions.value.size) {
      changed = true;
    } else {
      for (const key of newCompletedSessions) {
        if (!completedSessions.value.has(key)) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      completedSessions.value = newCompletedSessions;
      planRepository.saveCompletedSessions(Array.from(newCompletedSessions));

      if (plan.isFullyCompleted(newCompletedSessions)) {
        clearMessages();
        planRepository.clearPlan();
        planRepository.clearCompletedSessions();
        activePlan.value = null;
        completedSessions.value = new Set();
        generateNewPlan();
      }
    }
  }

  watch(
    () => exerciseLogsStore.exerciseLogs,
    () => {
      evaluateCompletedSessions();
    },
    { immediate: true },
  );

  const hasTodayCoachMessage = computed<boolean>(() => {
    const today = isoDateString(new Date());
    return messages.value.some(
      (m) => m.role === "coach" && isoDateString(new Date(m.timestamp)) === today,
    );
  });

  return {
    initialize,
    requestAdvice,
    generateNewPlan,
    classifyExercisesIfNeeded,
    clearMessages,
    isLoading,
    messages,
    hasInitialized,
    activePlan,
    completedSessions,
    currentWorkoutPlan,
    hasTodayCoachMessage,
  };
});
