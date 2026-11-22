import { App as CapacitorApp } from "@capacitor/app";
import * as Sentry from "@sentry/vue";
import {
  StorageSerializers,
  useDocumentVisibility,
  useLocalStorage,
  useWakeLock,
} from "@vueuse/core";
import { err, errAsync, ok, okAsync, type Result, ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { onScopeDispose, watch } from "vue";

import {
  classifyExerciseNames,
  evaluateCompletedSessions,
  getTodayLogsCount,
  requestAdviceWithSingleRetry,
} from "@/modules/aiCoach/application";
import {
  type CoachingAdvice,
  type CoachingAdviceError,
  type CoachingMessage,
  type CoachingMode,
  type RecoverCoachingAdviceError,
  type RecoverCoachingAdviceResult,
  resolveEffectiveCoachingMode,
  TrainingPlan,
} from "@/modules/aiCoach/domain";
import { createAiCoachService } from "@/modules/aiCoach/infrastructure";
import { useAuthStore } from "@/modules/auth/presentation";
import { useDeloadStore } from "@/modules/deload/presentation";
import { useEventsStore } from "@/modules/events/presentation";
import { useExerciseMuscleMapStore } from "@/modules/platform/presentation";
import { useUserProfileStore } from "@/modules/profile/presentation";
import { isoDateString } from "@/modules/sharedKernel/domain";
import {
  getMuscleActivation,
  normalizeExerciseName,
  useTrainingInsightsStore,
} from "@/modules/trainingInsights/presentation";
import { resolveCurrentSession, useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import { useTrainingSummaryStore } from "@/modules/trainingSummary/presentation";
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

const PENDING_REQUEST_STORAGE_KEY = "ai-coach:pending-request";
const PENDING_REQUEST_TTL_MS = 30 * 60 * 1000;
const RECOVERY_POLL_INTERVAL_MS = 2_000;
const RECOVERY_MAX_POLL_ATTEMPTS = 35;
const RECOVERY_MAX_CONSECUTIVE_TRANSPORT_ERRORS = 2;
const RECOVERY_MAX_WALL_CLOCK_MS = 90_000;

function isDeviceOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

interface PendingCoachRequest {
  clientRequestId: string;
  userMessageId: string;
  sessionId: string;
  mode: CoachingMode;
  startedAt: number;
}

function getTodayLogsChecksum(
  session: { logs: { id: string; reps?: number; weight?: number }[] } | null,
): string {
  if (!session) return "";
  return session.logs.map((l) => `${l.id}:${l.reps ?? ""}:${l.weight ?? ""}`).join("|");
}

function isPendingRequestExpired(pending: PendingCoachRequest): boolean {
  return (
    !Number.isFinite(pending.startedAt) || Date.now() - pending.startedAt > PENDING_REQUEST_TTL_MS
  );
}

export const useAiOrchestratorStore = defineStore("aiOrchestrator", () => {
  const chatStore = useCoachChatStore();
  const planStore = useTrainingPlanStore();

  const authStore = useAuthStore();
  const userProfileStore = useUserProfileStore();
  const exerciseLogsStore = useExerciseLogsStore();
  const trainingSummaryStore = useTrainingSummaryStore();
  const eventsStore = useEventsStore();
  const exerciseMuscleMapStore = useExerciseMuscleMapStore();
  const deloadStore = useDeloadStore();
  const trainingInsightsStore = useTrainingInsightsStore();

  const aiCoachService = createAiCoachService();
  const wakeLock = useWakeLock();
  const visibility = useDocumentVisibility();
  const pendingCoachRequest = useLocalStorage<PendingCoachRequest | null>(
    PENDING_REQUEST_STORAGE_KEY,
    null,
    { serializer: StorageSerializers.object, flush: "sync", listenToStorageChanges: false },
  );

  let hasInitialized = false;
  let inFlightMode: CoachingMode | null = null;
  let activeAttemptToken: symbol | null = null;
  let activeAttemptRequestId: string | null = null;
  let lastRecoveredRequestId: string | null = null;
  let inFlightRecovery: Promise<Result<void, CoachingAdviceError>> | null = null;
  let pendingRequest: { question?: string; mode: CoachingMode } | null = null;
  let pendingEnsureSessionAdvice = false;
  let hasObservedLoadedLogs = false;
  let attemptedRegenerationPlanKey: string | null = null;

  watch(
    () => chatStore.isLoading,
    (loading) => {
      if (loading) {
        void wakeLock.request("screen").catch(() => {
          // Silently degrade when Wake Lock is unsupported or denied (e.g. iOS Low Power Mode NotAllowedError)
        });
      } else {
        void wakeLock.release().catch(() => {});
      }
    },
  );

  function clearPendingCoachRequest(removeUserMessage = false): void {
    const userMessageId = pendingCoachRequest.value?.userMessageId;
    pendingCoachRequest.value = null;
    if (removeUserMessage && userMessageId) {
      chatStore.initialize();
      chatStore.removeMessage(userMessageId);
    }
  }

  function clearPendingRequest(): void {
    pendingEnsureSessionAdvice = false;
    attemptedRegenerationPlanKey = null;
    pendingRequest = null;
    activeAttemptRequestId = null;
    chatStore.streamingCoachMessage = "";
    clearPendingCoachRequest(true);
  }

  function pruneExpiredPendingRequest(): PendingCoachRequest | null {
    const pending = pendingCoachRequest.value;
    if (!pending) return null;
    if (isPendingRequestExpired(pending)) {
      clearPendingCoachRequest(true);
      return null;
    }
    return pending;
  }

  function isLogsBusyAndEmpty(): boolean {
    return (
      Boolean(exerciseLogsStore.isLoading || exerciseLogsStore.isRefreshing) &&
      exerciseLogsStore.exerciseLogs.length === 0
    );
  }

  function isPlanningQueuedOrInFlight(): boolean {
    return (
      inFlightMode === "planning" ||
      pendingRequest?.mode === "planning" ||
      Boolean(inFlightRecovery && pendingCoachRequest.value?.mode === "planning")
    );
  }

  function drainPendingRequest(
    attemptToken?: symbol,
  ): ResultAsync<void, CoachingAdviceError> | null {
    if (attemptToken && activeAttemptToken !== attemptToken) {
      return null;
    }
    activeAttemptToken = null;
    inFlightMode = null;
    chatStore.streamingCoachMessage = "";
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

    const preInitPendingRequestId = pendingCoachRequest.value?.clientRequestId;

    void (authStore.init?.() ?? Promise.resolve()).then(() => {
      if (inFlightMode || activeAttemptToken) {
        return;
      }
      if (!authStore.isLoggedIn) {
        clearPendingRequest();
        return;
      }
      if (preInitPendingRequestId && pruneExpiredPendingRequest()) {
        void recoverPendingRequest();
      }
    });
  }

  function getUnclassifiedExercises(): string[] {
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
    return unclassified;
  }

  function resolveAccessToken(): ResultAsync<string, CoachingAdviceError> {
    return authStore.ensureValidIdToken().mapErr((err): CoachingAdviceError => {
      if (err === "refresh-token-invalid" || !authStore.refreshToken) {
        authStore.logout();
        return "unauthorized";
      }
      return "coaching-request-failed";
    });
  }

  function refreshAuthAfterUnauthorized(): ResultAsync<string, CoachingAdviceError> {
    if (!authStore.refreshToken) {
      authStore.logout();
      return errAsync("unauthorized");
    }

    return authStore
      .refreshSession(true)
      .map((freshToken) => authStore.idToken ?? freshToken)
      .mapErr((refreshErr): CoachingAdviceError => {
        if (refreshErr === "refresh-token-invalid" || !authStore.refreshToken) {
          authStore.logout();
          return "unauthorized";
        }
        return "coaching-request-failed";
      });
  }

  let inFlightClassification: {
    attempt: symbol;
    token: string | undefined;
    request: ResultAsync<void, "unauthorized">;
  } | null = null;

  function classifyExercisesIfNeeded(
    explicitAccessToken?: string,
  ): ResultAsync<void, "unauthorized"> {
    if (
      inFlightClassification &&
      (explicitAccessToken === undefined || inFlightClassification.token === explicitAccessToken)
    ) {
      return inFlightClassification.request;
    }

    const unclassified = getUnclassifiedExercises();
    if (unclassified.length === 0) return okAsync(undefined);
    if (isDeviceOffline()) return okAsync(undefined);

    const attempt = Symbol();
    const tokenResult = explicitAccessToken ? okAsync(explicitAccessToken) : resolveAccessToken();
    const request = tokenResult
      .andThen((accessToken) =>
        classifyExerciseNames(aiCoachService, unclassified, accessToken)
          .andTee((cleanupResult) => {
            exerciseMuscleMapStore.applyCleanupResults(cleanupResult);
          })
          .map(() => undefined),
      )
      .orElse((error) => {
        if (error === "unauthorized") {
          return errAsync("unauthorized" as const);
        }
        Sentry.captureMessage("AI store exercise pre-classification failed", {
          level: "warning",
          tags: { scope: "ai-store", feature: "exercise-preclassification" },
          extra: { reason: error, unclassifiedCount: unclassified.length },
        });
        return okAsync(undefined);
      })
      .andTee(() => {
        if (inFlightClassification?.attempt === attempt) {
          inFlightClassification = null;
        }
      })
      .orTee(() => {
        if (inFlightClassification?.attempt === attempt) {
          inFlightClassification = null;
        }
      });

    inFlightClassification = { attempt, token: explicitAccessToken, request };
    return request;
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
      if (isFullPlanReset) {
        planStore.clearCompletedSessions();
        attemptedRegenerationPlanKey = null;
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
    result: { advice: CoachingAdvice; requestPayload?: string },
    userMessageId: string,
    currentId: string,
    todayLogsCount: number,
    todayLogsChecksum: string,
    isFullPlanReset: boolean,
  ): void {
    if (import.meta.env.DEV && result.requestPayload) {
      chatStore.updateMessageContent(userMessageId, result.requestPayload);
    }
    applyTrainingPlanIfPresent(result.advice, userMessageId, isFullPlanReset);
    exerciseMuscleMapStore.refresh();

    if (result.advice.startDeload === true && !deloadStore.active) {
      const { riskScore, triggeredBy } = trainingInsightsStore.insights.fatigue;
      deloadStore.startDeload(riskScore, triggeredBy);
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

  function applyRecoveredAdvice(pending: PendingCoachRequest, advice: CoachingAdvice): void {
    if (pendingCoachRequest.value?.clientRequestId !== pending.clientRequestId) return;
    lastRecoveredRequestId = pending.clientRequestId;
    pendingCoachRequest.value = null;
    const currentSession = resolveCurrentSession(exerciseLogsStore.exerciseLogs);
    const todayLogsCount = getTodayLogsCount(aiCoachService, currentSession);
    const todayLogsChecksum = getTodayLogsChecksum(currentSession);
    handleCoachingSuccess(
      { advice },
      pending.userMessageId,
      pending.sessionId,
      todayLogsCount,
      todayLogsChecksum,
      pending.mode === "planning",
    );
    activeAttemptToken = null;
    inFlightMode = null;
    if (pendingRequest) {
      void drainPendingRequest();
    } else {
      chatStore.isLoading = false;
    }
  }

  function recoverOnceWithAuthRetry(
    clientRequestId: string,
    accessToken: string,
  ): ResultAsync<RecoverCoachingAdviceResult, RecoverCoachingAdviceError> {
    return aiCoachService.recover(clientRequestId, accessToken).orElse((error) => {
      if (error !== "unauthorized") return errAsync(error);
      return refreshAuthAfterUnauthorized().andThen((freshToken) =>
        aiCoachService.recover(clientRequestId, freshToken),
      );
    });
  }

  async function waitBeforeNextPoll(
    pending: PendingCoachRequest,
  ): Promise<{ continue: boolean; pausedMs: number }> {
    if (visibility.value !== "visible") {
      const pauseStartedAt = Date.now();
      const canRecover = await waitForForeground();
      if (!canRecover) {
        if (pendingCoachRequest.value?.clientRequestId === pending.clientRequestId) {
          clearPendingCoachRequest(true);
        }
        return { continue: false, pausedMs: 0 };
      }
      return { continue: true, pausedMs: Date.now() - pauseStartedAt };
    }
    const sleepStartedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, RECOVERY_POLL_INTERVAL_MS));
    return {
      continue: true,
      pausedMs: Math.max(0, Date.now() - sleepStartedAt - RECOVERY_POLL_INTERVAL_MS),
    };
  }

  type PollStepOutcome =
    | { kind: "done"; result: Result<void, CoachingAdviceError> }
    | { kind: "pause" }
    | { kind: "processing" }
    | { kind: "transient-error" };

  const TERMINAL_RECOVERY_ERRORS: readonly RecoverCoachingAdviceError[] = [
    "not-found",
    "server-failed",
    "unauthorized",
    "rate-limit-exceeded",
    "coaching-request-server-error",
    "generate-content-stream-failed",
  ];

  async function pollRecoveryOnce(pending: PendingCoachRequest): Promise<PollStepOutcome> {
    if (pendingCoachRequest.value?.clientRequestId !== pending.clientRequestId) {
      return { kind: "done", result: ok(undefined) };
    }
    if (isPendingRequestExpired(pending) || !authStore.isLoggedIn) {
      clearPendingCoachRequest(true);
      return { kind: "done", result: err("coaching-request-failed") };
    }
    if (isDeviceOffline()) {
      return { kind: "pause" };
    }

    const tokenRes = await resolveAccessToken();
    if (tokenRes.isErr()) {
      if (tokenRes.error !== "unauthorized") return { kind: "transient-error" };
      clearPendingCoachRequest(true);
      return { kind: "done", result: err("unauthorized") };
    }

    const recoverRes = await recoverOnceWithAuthRetry(pending.clientRequestId, tokenRes.value);
    if (recoverRes.isOk()) {
      if (recoverRes.value.status === "completed") {
        applyRecoveredAdvice(pending, recoverRes.value.advice);
        return { kind: "done", result: ok(undefined) };
      }
      return { kind: "processing" };
    }

    if (!TERMINAL_RECOVERY_ERRORS.includes(recoverRes.error)) {
      return { kind: "transient-error" };
    }

    clearPendingCoachRequest(true);
    const mappedError: CoachingAdviceError =
      recoverRes.error === "unauthorized" || recoverRes.error === "rate-limit-exceeded"
        ? recoverRes.error
        : "coaching-request-failed";
    return { kind: "done", result: err(mappedError) };
  }

  function recoverPendingRequest(): Promise<Result<void, CoachingAdviceError>> {
    const pending = pruneExpiredPendingRequest();
    if (!pending) {
      return Promise.resolve(err("coaching-request-failed"));
    }
    if (!authStore.isLoggedIn) {
      clearPendingCoachRequest(true);
      return Promise.resolve(err("coaching-request-failed"));
    }
    if (isDeviceOffline()) {
      return Promise.resolve(err("coaching-request-failed"));
    }
    if (inFlightRecovery) {
      return inFlightRecovery;
    }

    chatStore.isLoading = true;
    const run = (async (): Promise<Result<void, CoachingAdviceError>> => {
      let recoveryStartedAt = Date.now();
      let consecutiveTransportErrors = 0;
      for (let attempt = 0; attempt < RECOVERY_MAX_POLL_ATTEMPTS; attempt++) {
        if (isDeviceOffline()) {
          return err("coaching-request-failed");
        }
        if (Date.now() - recoveryStartedAt >= RECOVERY_MAX_WALL_CLOCK_MS) {
          break;
        }
        const step = await pollRecoveryOnce(pending);
        if (step.kind === "done") return step.result;
        if (step.kind === "pause") return err("coaching-request-failed");

        consecutiveTransportErrors =
          step.kind === "transient-error" ? consecutiveTransportErrors + 1 : 0;
        if (consecutiveTransportErrors >= RECOVERY_MAX_CONSECUTIVE_TRANSPORT_ERRORS) {
          return err("coaching-request-failed");
        }
        if (attempt < RECOVERY_MAX_POLL_ATTEMPTS - 1) {
          const waitResult = await waitBeforeNextPoll(pending);
          if (!waitResult.continue) {
            return err("coaching-request-failed");
          }
          recoveryStartedAt += waitResult.pausedMs;
        }
      }

      clearPendingCoachRequest(true);
      return err("coaching-request-failed");
    })().finally(() => {
      inFlightRecovery = null;
      if (!inFlightMode && !activeAttemptToken) {
        if (pendingRequest) {
          void drainPendingRequest();
        } else {
          chatStore.isLoading = false;
          if (!pendingCoachRequest.value) {
            flushPendingSessionAdvice();
          }
        }
      }
    });

    inFlightRecovery = run;
    return run;
  }

  function waitForForeground(): Promise<boolean> {
    if (visibility.value === "visible") return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      let appHandle: { remove: () => Promise<void> } | null = null;
      const stopVis = watch(visibility, (state) => {
        if (state === "visible") finish(true);
      });
      const stopAuth = watch(
        () => authStore.isLoggedIn,
        (loggedIn) => {
          if (!loggedIn) finish(false);
        },
      );
      const timer = setTimeout(() => finish(false), PENDING_REQUEST_TTL_MS);
      void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) finish(true);
      })
        .then((handle) => {
          if (settled) void handle.remove().catch(() => {});
          else appHandle = handle;
        })
        .catch(() => {});

      function finish(res: boolean) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        stopVis();
        stopAuth();
        if (appHandle) void appHandle.remove().catch(() => {});
        resolve(res);
      }
    });
  }

  function finalizeActiveAttempt(clientRequestId: string): void {
    if (activeAttemptRequestId !== clientRequestId) return;
    activeAttemptRequestId = null;
    chatStore.streamingCoachMessage = "";
  }

  function clearPendingCoachIfMatches(clientRequestId: string): void {
    if (pendingCoachRequest.value?.clientRequestId === clientRequestId) {
      clearPendingCoachRequest(true);
    }
  }

  function executeCoachingAttempt(
    accessToken: string,
    question: string | undefined,
    mode: CoachingMode,
  ): ResultAsync<{ advice: CoachingAdvice; requestPayload?: string }, CoachingAdviceError> {
    const activeQuestion = question;
    const activeMode = mode;

    const currentId = chatStore.currentSessionId;
    const currentSession = resolveCurrentSession(exerciseLogsStore.exerciseLogs);
    const todayLogsCount = getTodayLogsCount(aiCoachService, currentSession);
    const todayLogsChecksum = getTodayLogsChecksum(currentSession);
    const effectiveMode = resolveEffectiveCoachingMode({
      requestedMode: activeMode,
      hasActivePlan: Boolean(planStore.activePlan && planStore.activePlan.sessions.length > 0),
    });
    inFlightMode = effectiveMode;

    if (pendingCoachRequest.value) {
      clearPendingCoachRequest(true);
    }

    const previousMessages = [...chatStore.messages];
    const userMessage = createUserMessagePlaceholder(currentId, todayLogsCount, todayLogsChecksum);
    if (activeQuestion) {
      userMessage.content = activeQuestion;
    }
    const userMessageId = userMessage.id;
    let attemptClientRequestId: string = crypto.randomUUID();
    activeAttemptRequestId = attemptClientRequestId;
    chatStore.streamingCoachMessage = "";
    chatStore.addMessage(userMessage);

    pendingCoachRequest.value = {
      clientRequestId: attemptClientRequestId,
      userMessageId,
      sessionId: currentId,
      mode: effectiveMode,
      startedAt: Date.now(),
    };

    return requestAdviceWithSingleRetry(
      aiCoachService,
      {
        accessToken,
        clientRequestId: attemptClientRequestId,
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
        onStreamPreview: (textSoFar) => {
          if (activeAttemptRequestId !== attemptClientRequestId) return;
          chatStore.streamingCoachMessage = textSoFar;
        },
      },
      undefined,
      (retryClientRequestId) => {
        attemptClientRequestId = retryClientRequestId;
        activeAttemptRequestId = retryClientRequestId;
        chatStore.streamingCoachMessage = "";
        if (pendingCoachRequest.value) {
          pendingCoachRequest.value = {
            ...pendingCoachRequest.value,
            clientRequestId: retryClientRequestId,
          };
        }
      },
    )
      .andTee((result) => {
        finalizeActiveAttempt(attemptClientRequestId);
        if (pendingCoachRequest.value?.clientRequestId !== attemptClientRequestId) return;
        pendingCoachRequest.value = null;
        handleCoachingSuccess(
          result,
          userMessageId,
          currentId,
          todayLogsCount,
          todayLogsChecksum,
          effectiveMode === "planning",
        );
      })
      .orElse((error) => {
        finalizeActiveAttempt(attemptClientRequestId);
        // Only short-circuit as resolved when this exact request was delivered via applyRecoveredAdvice
        if (lastRecoveredRequestId === attemptClientRequestId) {
          return okAsync({ advice: { coachMessage: "" } });
        }

        const normalizedError: CoachingAdviceError =
          error === "coaching-request-server-error" ? "coaching-request-failed" : error;

        if (pendingCoachRequest.value?.clientRequestId !== attemptClientRequestId) {
          return errAsync(normalizedError);
        }

        if (error !== "coaching-request-failed") {
          clearPendingCoachIfMatches(attemptClientRequestId);
          return errAsync(normalizedError);
        }

        if (isDeviceOffline()) {
          return errAsync(normalizedError);
        }

        return ResultAsync.fromPromise(
          waitForForeground().then((canRecover) => {
            if (!canRecover) {
              clearPendingCoachIfMatches(attemptClientRequestId);
              return err("coaching-request-failed" as const);
            }
            return recoverPendingRequest();
          }),
          () => "coaching-request-failed" as const,
        ).andThen((recoveryResult) =>
          recoveryResult.isOk()
            ? okAsync({ advice: { coachMessage: "" } })
            : errAsync(recoveryResult.error),
        );
      });
  }

  function runCoachingRequest(
    question?: string,
    mode: CoachingMode = "execution",
  ): ResultAsync<void, CoachingAdviceError> {
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

    const attemptToken = Symbol();
    activeAttemptToken = attemptToken;
    chatStore.isLoading = true;
    pendingRequest = null;
    inFlightMode = initialEffectiveMode;

    let attemptQuestion = question;
    let attemptMode = mode;
    const consumePlanningEscalation = () => {
      if (pendingRequest?.mode === "planning") {
        attemptQuestion = pendingRequest.question ?? attemptQuestion;
        attemptMode = "planning";
        pendingRequest = null;
      }
    };

    return resolveAccessToken()
      .andThen((accessToken) => {
        consumePlanningEscalation();
        void classifyExercisesIfNeeded(accessToken);
        return executeCoachingAttempt(accessToken, attemptQuestion, attemptMode).orElse((error) => {
          if (error !== "unauthorized") {
            return errAsync(error);
          }
          return refreshAuthAfterUnauthorized().andThen((freshToken) => {
            consumePlanningEscalation();
            void classifyExercisesIfNeeded(freshToken);
            return executeCoachingAttempt(freshToken, attemptQuestion, attemptMode).orTee(
              (retryErr) => {
                if (retryErr === "unauthorized") {
                  authStore.logout();
                }
              },
            );
          });
        });
      })
      .map(() => undefined)
      .andTee(() => {
        void drainPendingRequest(attemptToken);
      })
      .orTee(() => {
        void drainPendingRequest(attemptToken);
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

  function checkAndRegeneratePlanIfNeeded(plan: TrainingPlan): boolean {
    const activeSession = resolveCurrentSession(exerciseLogsStore.exerciseLogs);
    const needsRegeneration =
      plan.isFullyCompleted(planStore.completedSessions) || plan.isExpired();
    if (activeSession || !needsRegeneration || isDeviceOffline()) {
      return false;
    }

    if (attemptedRegenerationPlanKey === plan.createdAt) {
      return false;
    }

    attemptedRegenerationPlanKey = plan.createdAt;
    pendingEnsureSessionAdvice = false;
    void generateNewPlan();
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

    if (checkAndRegeneratePlanIfNeeded(plan)) {
      return true;
    }

    flushPendingSessionAdvice();
    return false;
  }

  function ensureSessionAdvice(): ResultAsync<void, CoachingAdviceError> {
    initialize();

    if (
      inFlightRecovery ||
      (!activeAttemptToken && !inFlightMode && pruneExpiredPendingRequest())
    ) {
      if (!inFlightRecovery && !isDeviceOffline()) {
        void recoverPendingRequest();
      }
      pendingEnsureSessionAdvice = true;
      return okAsync(undefined);
    }

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

    if (isDeviceOffline()) {
      pendingEnsureSessionAdvice = true;
      return okAsync(undefined);
    }

    if (!planStore.activePlan || planStore.activePlan.sessions.length === 0) {
      return generateNewPlan();
    }

    if (
      planStore.activePlan.isFullyCompleted(planStore.completedSessions) ||
      planStore.activePlan.isExpired()
    ) {
      return okAsync(undefined);
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

  watch(
    () => authStore.isLoggedIn,
    (loggedIn, prevLoggedIn) => {
      if (prevLoggedIn && !loggedIn) {
        clearPendingRequest();
      }
    },
  );

  watch(visibility, (state) => {
    if (state === "visible" && pendingCoachRequest.value && !inFlightMode && !activeAttemptToken) {
      void recoverPendingRequest();
    }
  });

  const appStateListenerPromise = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
    if (isActive && pendingCoachRequest.value && !inFlightMode && !activeAttemptToken) {
      void recoverPendingRequest();
    }
  });

  const onDeviceOnline = () => {
    if (pendingCoachRequest.value && !inFlightMode && !activeAttemptToken) {
      void recoverPendingRequest();
    } else if (!inFlightMode && !activeAttemptToken) {
      flushPendingSessionAdvice();
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("online", onDeviceOnline);
  }

  onScopeDispose(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onDeviceOnline);
    }
    void appStateListenerPromise.then((handle) => handle.remove()).catch(() => {});
  });

  return {
    initialize,
    requestAdvice,
    generateNewPlan,
    ensureSessionAdvice,
    classifyExercisesIfNeeded,
    clearPendingRequest,
  };
});
