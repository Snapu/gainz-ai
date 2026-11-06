import * as Sentry from "@sentry/vue";
import { errAsync, okAsync, type ResultAsync } from "neverthrow";
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
  type CoachingMode,
  type PlannedSession,
  resolveEffectiveCoachingMode,
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
import { findStaleTodayMessageIds } from "../helpers/aiCoachPageHelpers";
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
  let inFlightMode: CoachingMode | null = null;
  let pendingRequest: { question?: string; mode: CoachingMode } | null = null;
  let pendingEnsureSessionAdvice = false;
  let hasObservedLoadedLogs = false;

  function isLogsBusyAndEmpty(): boolean {
    return (
      Boolean(exerciseLogsStore.isLoading || exerciseLogsStore.isRefreshing) &&
      exerciseLogsStore.exerciseLogs.length === 0
    );
  }

  function isPlanningQueuedOrInFlight(): boolean {
    return inFlightMode === "planning" || pendingRequest?.mode === "planning";
  }

  function drainPendingRequest(): ResultAsync<void, CoachingAdviceError> | null {
    inFlightMode = null;
    chatStore.isLoading = false;
    const next = pendingRequest;
    if (!next) return null;
    pendingRequest = null;
    return runCoachingRequest(next.question, next.mode);
  }

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

  /** Surfaces bad model output when `TrainingPlan.create` had to move a session to a free day. */
  function reportRescheduledSessions(
    requested: PlannedSession[],
    created: readonly PlannedSession[],
  ): void {
    const createdByWeekAndLabel = new Map(
      created.map((s) => [`${s.weekNumber}:${s.sessionLabel}`, s]),
    );
    const moved = requested.filter((session) => {
      const match = createdByWeekAndLabel.get(`${session.weekNumber}:${session.sessionLabel}`);
      return match && match.dayOfWeek !== session.dayOfWeek;
    });
    if (moved.length === 0) return;

    Sentry.captureMessage("AI training plan contained colliding session days", {
      level: "warning",
      tags: { scope: "ai-store", feature: "plan-day-collision" },
      extra: {
        moved: moved.map((s) => ({ week: s.weekNumber, day: s.dayOfWeek, label: s.sessionLabel })),
      },
    });
  }

  function applyTrainingPlanIfPresent(
    advice: CoachingAdvice,
    userMessageId: string,
    explicitFullReset: boolean,
  ): void {
    if (!advice.trainingPlan) return;

    try {
      const newPlanDraft = TrainingPlan.create(
        new Date().toISOString(),
        advice.trainingPlan.cycleWeeks,
        advice.trainingPlan.sessions,
      );

      const isFullPlanReset =
        explicitFullReset ||
        !planStore.activePlan ||
        planStore.activePlan.sessions.length === 0 ||
        newPlanDraft.isStructuralReplacementFor(planStore.activePlan);

      const planCreatedAt =
        !isFullPlanReset && planStore.activePlan
          ? planStore.activePlan.createdAt
          : new Date().toISOString();
      const newPlan = TrainingPlan.create(
        planCreatedAt,
        advice.trainingPlan.cycleWeeks,
        advice.trainingPlan.sessions,
      );
      reportRescheduledSessions(advice.trainingPlan.sessions, newPlan.sessions);
      if (isFullPlanReset) {
        planStore.clearCompletedSessions();
      }
      planStore.setPlan(newPlan);
      if (isFullPlanReset) {
        chatStore.retainOnlyMessage(userMessageId);
      }
    } catch (e) {
      Sentry.captureException(e, { tags: { scope: "ai-store", feature: "extract-plan" } });
    }
  }

  function handleCoachingSuccess(
    result: { advice: CoachingAdvice; requestPayload: string },
    userMessageId: string,
    currentId: string,
    todayLogsCount: number,
    todayLogsChecksum: string,
    isFullPlanReset: boolean,
  ): void {
    chatStore.updateMessageContent(userMessageId, result.requestPayload);
    applyTrainingPlanIfPresent(result.advice, userMessageId, isFullPlanReset);
    exerciseMuscleMapStore.refresh();

    if (adviceStartsDeload(result.advice) && !deloadStore.active) {
      const { riskScore, triggeredBy } = trainingInsightsStore.insights.fatigue;
      deloadStore.startDeload(riskScore, mapTrainingFatigueTriggersToDeload(triggeredBy));
    }

    const coachMessage = createCoachMessage(
      currentId,
      todayLogsCount,
      JSON.stringify(result.advice),
      todayLogsChecksum,
    );
    chatStore.addMessage(coachMessage);

    const currentSession = resolveCurrentSession(exerciseLogsStore.exerciseLogs);
    chatStore.lastRequestState = {
      date: currentSession ? isoDateString(currentSession.startTime) : isoDateString(new Date()),
      checksum: todayLogsChecksum,
    };
  }

  function runCoachingRequest(
    question?: string,
    mode: CoachingMode = "execution",
  ): ResultAsync<void, CoachingAdviceError> {
    const apiKey = userProfileStore.apiKey;
    if (!apiKey) {
      return errAsync("missing-api-key" as CoachingAdviceError);
    }

    const initialSession = resolveCurrentSession(exerciseLogsStore.exerciseLogs);
    const initialChecksum = getTodayLogsChecksum(initialSession);
    const sessionDate = initialSession
      ? isoDateString(initialSession.startTime)
      : isoDateString(new Date());
    const initialEffectiveMode = resolveEffectiveCoachingMode({
      requestedMode: mode,
      hasActivePlan: Boolean(planStore.activePlan && planStore.activePlan.sessions.length > 0),
    });

    if (
      !question &&
      initialEffectiveMode === "execution" &&
      planStore.activePlan &&
      planStore.activePlan.sessions.length > 0 &&
      chatStore.lastRequestState.date === sessionDate &&
      chatStore.lastRequestState.checksum === initialChecksum &&
      chatStore.messages.length > 0
    ) {
      return okAsync(undefined);
    }

    chatStore.isLoading = true;
    pendingRequest = null;
    inFlightMode = initialEffectiveMode;

    return classifyExercisesIfNeeded()
      .andThen(() => {
        let activeQuestion = question;
        let activeMode = mode;
        if (pendingRequest?.mode === "planning") {
          activeQuestion = pendingRequest.question ?? activeQuestion;
          activeMode = "planning";
          pendingRequest = null;
        }

        const currentId = chatStore.currentSessionId;
        const currentSession = resolveCurrentSession(exerciseLogsStore.exerciseLogs);
        const todayLogsCount = getTodayLogsCount(aiCoachService, currentSession);
        const todayLogsChecksum = getTodayLogsChecksum(currentSession);
        const effectiveMode = resolveEffectiveCoachingMode({
          requestedMode: activeMode,
          hasActivePlan: Boolean(planStore.activePlan && planStore.activePlan.sessions.length > 0),
        });
        inFlightMode = effectiveMode;

        const previousMessages = [...chatStore.messages];
        const userMessage = createUserMessagePlaceholder(
          currentId,
          todayLogsCount,
          todayLogsChecksum,
        );
        if (activeQuestion) {
          userMessage.content = activeQuestion;
        }
        const userMessageId = userMessage.id;
        chatStore.addMessage(userMessage);

        return requestAdviceWithSingleRetry(aiCoachService, {
          apiKey,
          userProfile: userProfileStore.userProfile,
          insights: trainingInsightsStore.insights,
          exerciseLogs: exerciseLogsStore.exerciseLogs,
          trainingSummaries: trainingSummaryStore.summaries,
          previousMessages,
          events: eventsStore.events,
          question: activeQuestion,
          mode: activeMode,
          activePlan: planStore.activePlan ?? undefined,
          completedSessionKeys: planStore.completedSessions,
        })
          .andTee((result) => {
            handleCoachingSuccess(
              result,
              userMessageId,
              currentId,
              todayLogsCount,
              todayLogsChecksum,
              effectiveMode === "planning",
            );
          })
          .orTee(() => {
            chatStore.removeMessage(userMessageId);
          });
      })
      .map(() => undefined)
      .andTee(() => {
        void drainPendingRequest();
      })
      .orTee(() => {
        void drainPendingRequest();
      });
  }

  function requestAdvice(
    question?: string,
    mode: CoachingMode = "execution",
  ): ResultAsync<void, CoachingAdviceError> {
    initialize();

    if (chatStore.isLoading) {
      if (!question && mode === "execution") {
        return okAsync(undefined);
      }
      pendingRequest = { question, mode };
      return okAsync(undefined);
    }

    return runCoachingRequest(question, mode);
  }

  function generateNewPlan(): ResultAsync<void, CoachingAdviceError> {
    initialize();

    if (chatStore.isLoading) {
      if (isPlanningQueuedOrInFlight()) {
        return okAsync(undefined);
      }
      pendingRequest = {
        question: "Please generate a new 2-week mesocycle plan.",
        mode: "planning",
      };
      return okAsync(undefined);
    }

    return runCoachingRequest("Please generate a new 2-week mesocycle plan.", "planning");
  }

  function pruneStaleTodayCoachMessages(): void {
    const plan = planStore.activePlan;
    if (!plan || plan.sessions.length === 0 || chatStore.messages.length === 0) return;

    const activeSession = resolveCurrentSession(exerciseLogsStore.exerciseLogs);
    if (activeSession) return;

    const now = new Date();
    const todayIso = isoDateString(now);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todaysLogs = exerciseLogsStore.exerciseLogs.filter(
      (l) => l.loggedAt.getTime() >= startOfToday,
    );
    const resolveMuscle = (name: string) =>
      getMuscleActivation(name, exerciseMuscleMapStore.learnedMap)?.primaryMuscle;
    const targetSession = plan.getTodayTargetSession(
      planStore.completedSessions,
      todaysLogs,
      normalizeExerciseName,
      resolveMuscle,
    );

    const staleIds = findStaleTodayMessageIds({
      messages: chatStore.messages,
      todayIso,
      plan,
      completedSessions: planStore.completedSessions,
      targetSession,
    });
    for (const id of staleIds) {
      chatStore.removeMessage(id);
    }
  }

  function evaluatePlanProgress(plan: TrainingPlan) {
    const resolveMuscle = (name: string) =>
      getMuscleActivation(name, exerciseMuscleMapStore.learnedMap)?.primaryMuscle;

    return evaluateCompletedSessions(
      plan,
      planStore.completedSessions,
      exerciseLogsStore.exerciseLogs,
      normalizeExerciseName,
      resolveMuscle,
    );
  }

  function flushPendingSessionAdvice(): void {
    if (!pendingEnsureSessionAdvice) return;
    pendingEnsureSessionAdvice = false;
    void ensureSessionAdvice();
  }

  function checkAndRegenerateIfPlanCompleted(plan: TrainingPlan): boolean {
    const activeSession = resolveCurrentSession(exerciseLogsStore.exerciseLogs);
    if (activeSession || !plan.isFullyCompleted(planStore.completedSessions)) {
      return false;
    }

    pendingEnsureSessionAdvice = false;
    chatStore.clearMessages();
    planStore.clearPlan();
    planStore.clearCompletedSessions();
    generateNewPlan();
    return true;
  }

  function syncCompletedSessionsFromLogs(): boolean {
    if (isLogsBusyAndEmpty()) return false;

    if (exerciseLogsStore.exerciseLogs.length > 0) {
      hasObservedLoadedLogs = true;
    } else if (!hasObservedLoadedLogs && planStore.completedSessions.size > 0) {
      // Avoid wiping persisted completedSessions when initial fetchRemote() resolved to []
      // before spreadsheetStore.doc was ready or due to an offline/network error.
      flushPendingSessionAdvice();
      return false;
    }

    const plan = planStore.activePlan;
    if (!plan) {
      flushPendingSessionAdvice();
      return false;
    }

    const { newCompletedSessions, hasChanged } = evaluatePlanProgress(plan);

    if (hasChanged) {
      planStore.setCompletedSessions(newCompletedSessions);
    }

    if (checkAndRegenerateIfPlanCompleted(plan)) {
      return true;
    }

    flushPendingSessionAdvice();
    return false;
  }

  function ensureSessionAdvice(): ResultAsync<void, CoachingAdviceError> {
    initialize();

    if (isLogsBusyAndEmpty()) {
      pendingEnsureSessionAdvice = true;
      return okAsync(undefined);
    }
    pendingEnsureSessionAdvice = false;

    const activeSession = resolveCurrentSession(exerciseLogsStore.exerciseLogs);
    if (activeSession) {
      return okAsync(undefined);
    }

    const planRegenerated = syncCompletedSessionsFromLogs();
    if (planRegenerated) {
      return okAsync(undefined);
    }

    if (!planStore.activePlan || planStore.activePlan.sessions.length === 0) {
      return generateNewPlan();
    }

    pruneStaleTodayCoachMessages();
    if (!chatStore.hasTodayCoachMessage) {
      chatStore.lastRequestState = { date: "", checksum: "" };
      return requestAdvice();
    }
    return okAsync(undefined);
  }

  // Watch for completed sessions logic
  watch(
    [
      () => exerciseLogsStore.exerciseLogs,
      () => exerciseLogsStore.isLoading,
      () => exerciseLogsStore.isRefreshing,
      () => planStore.activePlan,
      () => exerciseMuscleMapStore.learnedMap,
    ],
    () => {
      syncCompletedSessionsFromLogs();
    },
    { immediate: true },
  );

  return {
    initialize,
    requestAdvice,
    generateNewPlan,
    ensureSessionAdvice,
    classifyExercisesIfNeeded,
  };
});
