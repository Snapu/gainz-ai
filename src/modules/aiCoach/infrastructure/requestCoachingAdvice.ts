import * as Sentry from "@sentry/vue";
import { errAsync, ResultAsync } from "neverthrow";
import { z } from "zod";
import { getStoredLocale, toBcp47Locale } from "@/lib/locale";
import { createExerciseMuscleMapRepository } from "@/modules/platform/infrastructure";
import { normalizeEquipmentList } from "@/modules/profile/domain";
import {
  getLearnedMuscleMap,
  learnFromCoachingAdvice,
  VALID_MUSCLE_GROUPS,
} from "@/modules/sharedKernel/application";
import { isoDateString } from "@/modules/sharedKernel/domain";
import {
  classifyExercise,
  getMuscleActivation,
  getProgressionIncrement,
  type MuscleActivation,
} from "@/modules/trainingInsights/domain";
import {
  getSessionStartBoundary,
  resolveCurrentSession,
  type WorkoutPhase,
  type WorkoutSession,
} from "@/modules/trainingLogs/application";
import {
  type CoachingAdvice,
  type CoachingAdviceError,
  type CoachingAdviceRequest,
  type CoachingAdviceResult,
  type CoachingMessage,
  type CoachingMode,
  extractUserQuestion,
  type RecoverCoachingAdviceError,
  type RecoverCoachingAdviceResult,
  resolveCoachingIntent,
  sanitizeSuggestedFollowUps,
  TrainingPlan,
} from "../domain";
import { AiEdgeHttpError, postAiCoachStream, postAiEdgeFunction } from "./aiEdgeClient";

const plannedExerciseResponseSchema = z.object({
  exerciseName: z.string().min(1),
  targetSets: z.number().int().min(1),
  targetReps: z.string().optional(),
  targetDurationSeconds: z.number().int().positive().optional(),
  targetDistanceMeters: z.number().int().positive().optional(),
  targetWeight: z.string().optional(),
  targetRpe: z.number().optional(),
  restSeconds: z.number().int().nonnegative().optional(),
  isMetabolicProtocol: z.boolean().optional(),
  notes: z.string().optional(),
  supersetId: z.string().optional(),
  primaryMuscle: z.string().optional(),
  secondaryMuscles: z
    .array(
      z.object({
        muscleGroup: z.string(),
        contribution: z.number().optional(),
      }),
    )
    .optional(),
});

const coachAdviceSchema = z.object({
  coachMessage: z.string().min(1),
  scratchpad: z.string().optional(),
  startDeload: z.boolean().optional(),
  suggestedFollowUps: z.unknown().optional(),
  recommendedWorkout: z.array(plannedExerciseResponseSchema).optional(),
  trainingPlan: z
    .object({
      cycleWeeks: z.number().int().min(1),
      sessions: z.array(
        z.object({
          dayOfWeek: z.number().int().min(0).max(6),
          weekNumber: z.number().int().min(1),
          sessionLabel: z.string(),
          focusDescription: z.string(),
          exercises: z.array(plannedExerciseResponseSchema),
        }),
      ),
    })
    .optional(),
});

const coachEndpointResponseSchema = z.union([
  z.object({
    advice: coachAdviceSchema,
  }),
  z.object({
    status: z.literal("processing"),
  }),
]);

const recoverEndpointResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("completed"),
    advice: coachAdviceSchema,
  }),
  z.object({
    status: z.literal("processing"),
  }),
]);

export type CoachActionRequestDto = {
  action: "coach";
  clientRequestId?: string;
  mode: CoachingMode;
  muscleGroups: string[];
  locale: string;
  localDate: string;
  nowIso: string;
  workoutPhase: WorkoutPhase;
  workoutStatus: string;
  sessionStartBoundaryMs: number;
  question?: string;
  userProfile: {
    age?: number;
    heightCm?: number;
    weightKg?: number;
    fitnessGoal?: CoachingAdviceRequest["userProfile"]["fitnessGoal"];
    fitnessLevel?: CoachingAdviceRequest["userProfile"]["fitnessLevel"];
    workoutDaysPerWeek?: number;
    workoutDurationMinutes?: number;
    workoutLocation?: CoachingAdviceRequest["userProfile"]["workoutLocation"];
    equipmentAccess?: CoachingAdviceRequest["userProfile"]["equipmentAccess"];
    freeUserInput?: string;
  };
  insights: {
    acwr: number | null;
    deloadStatus: CoachingAdviceRequest["insights"]["deloadStatus"];
    deloadEndsAt: string | null;
    deloadTimeRemainingMs: number | null;
    deloadTriggerSnapshot: CoachingAdviceRequest["insights"]["deloadTriggerSnapshot"];
    fatigue: {
      shouldDeload: boolean;
      reason?: string;
      hasSufficientHistory: boolean;
      decliningExercises: number;
      riskScore: number;
      loadWindow: CoachingAdviceRequest["insights"]["fatigue"]["loadWindow"];
    };
    muscleGroups: Record<
      string,
      {
        sets: number;
        directSets: number;
        landmark:
          | "detraining"
          | "below_MEV"
          | "at_MEV"
          | "at_MAV"
          | "approaching_MRV"
          | "above_MRV";
        frequencyPerWeek: number;
        hoursSinceLastTrained: number | null;
        recoveryReady: boolean;
        trendStatus?: "improving" | "plateau" | "dropping" | "stable";
      }
    >;
    e1rm: Record<
      string,
      {
        e1rm: number;
        trend: number[];
        trendDates: string[];
        plateau: boolean;
        bestRPE?: number;
        rpeOverloadReady: boolean;
        targetWeightHyp: { low: number; high: number } | null;
        targetWeightStr: { low: number; high: number } | null;
        swapRecommended: boolean;
        primaryMuscle?: string;
        progressionIncrementKg: number;
      }
    >;
  };
  recentLogs: Array<{
    exerciseName: string;
    reps?: number;
    weight?: number;
    distance?: number;
    duration?: number;
    rpe?: number;
    loggedAt: string;
    localDate: string;
  }>;
  trainingSummaries: Array<{
    year: number;
    month: number;
    workoutDays: number;
    exercises: Array<{
      exerciseName: string;
      sets: number;
      totalReps?: number;
      maxWeight?: number;
      totalVolume?: number;
    }>;
  }>;
  previousMessages: Array<{
    role: "user" | "coach";
    content: string;
    timestamp: string;
  }>;
  events?: Array<{
    type: string;
    dates: string[];
  }>;
  activePlan?: {
    createdAt: string;
    cycleWeeks: number;
    currentWeekNumber: number;
    nextUncompletedSessionKey?: string;
    sessions: Array<{
      dayOfWeek: number;
      weekNumber: number;
      sessionLabel: string;
      focusDescription: string;
      exercises: Array<{
        exerciseName: string;
        targetSets: number;
        targetReps?: string;
        targetDurationSeconds?: number;
        targetDistanceMeters?: number;
        targetWeight?: string;
        targetRpe?: number;
        restSeconds?: number;
        notes?: string;
        supersetId?: string;
        isMetabolicProtocol?: boolean;
        primaryMuscle?: string;
      }>;
    }>;
  } | null;
  completedSessionKeys?: string[];
};

const NINETY_DAYS_MS = 90 * 86_400_000;
const MAX_PREVIOUS_MESSAGES = 40;
const MAX_RECENT_LOGS = 500;
const MAX_SUMMARY_MONTHS = 12;
const MAX_EXERCISES_PER_MONTH = 20;

function sanitizePreviousMessage(msg: CoachingMessage): {
  role: "user" | "coach";
  content: string;
  timestamp: string;
} {
  if (msg.role === "user") {
    const question = extractUserQuestion(msg.content);
    const content =
      question ??
      (msg.content.startsWith("# session")
        ? "Please evaluate my workout readiness and recommend today's session."
        : msg.content);
    return {
      role: "user",
      content: content.slice(0, 8000),
      timestamp: msg.timestamp,
    };
  }

  let content = msg.content;
  try {
    const parsed = JSON.parse(msg.content) as {
      coachMessage?: unknown;
      recommendedWorkout?: unknown;
    };
    if (parsed && typeof parsed.coachMessage === "string" && parsed.coachMessage.trim()) {
      content = JSON.stringify({
        coachMessage: parsed.coachMessage,
        ...(Array.isArray(parsed.recommendedWorkout)
          ? { recommendedWorkout: parsed.recommendedWorkout }
          : {}),
      });
    }
  } catch {
    // Plain text fallback preserved
  }

  return {
    role: "coach",
    content: content.slice(0, 8000),
    timestamp: msg.timestamp,
  };
}

function resolveLocale(): string {
  return toBcp47Locale(getStoredLocale());
}

function inRange(value: number | undefined, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value >= min && value <= max ? value : undefined;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampOptionalInt(value: number | undefined, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return clampNumber(Math.round(value), min, max);
}

function finiteOrUndefined(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function mapTrainingSummariesDto(
  summaries: CoachingAdviceRequest["trainingSummaries"],
): CoachActionRequestDto["trainingSummaries"] {
  const byMonth = new Map<
    number,
    {
      year: number;
      month: number;
      workoutDays: number;
      exercises: CoachActionRequestDto["trainingSummaries"][number]["exercises"];
    }
  >();

  for (const s of summaries) {
    const year = inRange(Math.round(s.year), 2000, 2100);
    const month = inRange(Math.round(s.month), 1, 12);
    const exerciseName = s.exerciseName.trim().slice(0, 120);
    if (year === undefined || month === undefined || !exerciseName) continue;

    const workoutDays = clampOptionalInt(s.workoutDays, 0, 31) ?? 0;
    const key = year * 12 + month;
    let group = byMonth.get(key);
    if (!group) {
      group = { year, month, workoutDays, exercises: [] };
      byMonth.set(key, group);
    } else if (workoutDays > group.workoutDays) {
      group.workoutDays = workoutDays;
    }

    group.exercises.push(
      compactObject({
        exerciseName,
        sets: clampOptionalInt(s.sets, 0, 10000) ?? 0,
        totalReps: finiteOrUndefined(s.totalReps),
        maxWeight: finiteOrUndefined(s.maxWeight),
        totalVolume: finiteOrUndefined(s.totalVolume),
      }),
    );
  }

  return [...byMonth.entries()]
    .sort(([aKey], [bKey]) => aKey - bKey)
    .slice(-MAX_SUMMARY_MONTHS)
    .map(([, group]) => ({
      year: group.year,
      month: group.month,
      workoutDays: group.workoutDays,
      exercises: group.exercises
        .sort(
          (a, b) =>
            b.sets - a.sets ||
            (b.totalVolume ?? 0) - (a.totalVolume ?? 0) ||
            a.exerciseName.localeCompare(b.exerciseName),
        )
        .slice(0, MAX_EXERCISES_PER_MONTH),
    }));
}

function compactObject<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function mapUserProfileDto(
  p: CoachingAdviceRequest["userProfile"],
): CoachActionRequestDto["userProfile"] {
  return compactObject({
    age: inRange(p.age, 0, 120),
    heightCm: inRange(p.heightCm, 50, 300),
    weightKg: inRange(p.weightKg, 20, 400),
    fitnessGoal: p.fitnessGoal?.length ? p.fitnessGoal : undefined,
    fitnessLevel: p.fitnessLevel,
    workoutDaysPerWeek: inRange(p.workoutDaysPerWeek, 1, 7),
    workoutDurationMinutes: inRange(p.workoutDurationMinutes, 5, 300),
    workoutLocation: p.workoutLocation,
    equipmentAccess: normalizeEquipmentList(p.equipmentAccess),
    freeUserInput: p.freeUserInput ? p.freeUserInput.slice(0, 2000) : undefined,
  });
}

function mapInsightsDto(
  insights: CoachingAdviceRequest["insights"],
  muscleMap: Record<string, MuscleActivation>,
): CoachActionRequestDto["insights"] {
  const muscleGroups: CoachActionRequestDto["insights"]["muscleGroups"] = {};
  for (const [muscle, data] of Object.entries(insights.muscleGroups).slice(0, 25)) {
    const cleanMuscle = muscle.trim().slice(0, 40);
    if (!data || !cleanMuscle) continue;
    muscleGroups[cleanMuscle] = compactObject({
      sets: data.sets,
      directSets: data.directSets,
      landmark: data.landmark,
      frequencyPerWeek: data.frequencyPerWeek,
      hoursSinceLastTrained: data.hoursSinceLastTrained,
      recoveryReady: data.recoveryReady,
      trendStatus: data.trendStatus,
    });
  }

  const e1rm: CoachActionRequestDto["insights"]["e1rm"] = {};
  for (const [name, data] of Object.entries(insights.e1rm).slice(0, 200)) {
    const cleanName = name.trim().slice(0, 120);
    if (!cleanName) continue;
    e1rm[cleanName] = compactObject({
      e1rm: data.e1rm,
      trend: data.trend.slice(-20),
      trendDates: data.trendDates
        .slice(-20)
        .map((dt) => (dt instanceof Date ? isoDateString(dt) : String(dt))),
      plateau: data.plateau,
      bestRPE: data.bestRPE,
      rpeOverloadReady: data.rpeOverloadReady,
      targetWeightHyp: data.targetWeightHyp,
      targetWeightStr: data.targetWeightStr,
      swapRecommended: data.swapRecommended,
      primaryMuscle: getMuscleActivation(name, muscleMap)?.primaryMuscle,
      progressionIncrementKg: getProgressionIncrement(classifyExercise(name, muscleMap)),
    });
  }

  return {
    acwr: insights.acwr,
    deloadStatus: insights.deloadStatus,
    deloadEndsAt: insights.deloadEndsAt,
    deloadTimeRemainingMs: insights.deloadTimeRemainingMs,
    deloadTriggerSnapshot: insights.deloadTriggerSnapshot,
    fatigue: compactObject({
      shouldDeload: insights.fatigue.shouldDeload,
      reason: insights.fatigue.reason?.slice(0, 200),
      hasSufficientHistory: insights.fatigue.hasSufficientHistory,
      decliningExercises: insights.fatigue.decliningExercises,
      riskScore: insights.fatigue.riskScore,
      loadWindow: insights.fatigue.loadWindow,
    }),
    muscleGroups,
    e1rm,
  };
}

function mapRecentLogsDto(
  exerciseLogs: CoachingAdviceRequest["exerciseLogs"],
  now: Date,
): CoachActionRequestDto["recentLogs"] {
  const cutoffMs = now.getTime() - NINETY_DAYS_MS;
  return exerciseLogs
    .filter((log) => log.loggedAt.getTime() >= cutoffMs && log.exerciseName.trim().length > 0)
    .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime())
    .slice(-MAX_RECENT_LOGS)
    .map((log) =>
      compactObject({
        exerciseName: log.exerciseName.trim().slice(0, 120),
        reps: log.reps,
        weight: log.weight,
        distance: log.distance,
        duration: log.duration,
        rpe: log.rpe,
        loggedAt: log.loggedAt.toISOString(),
        localDate: isoDateString(log.loggedAt),
      }),
    );
}

function mapPlannedExerciseDto(
  ex: NonNullable<CoachingAdviceRequest["activePlan"]>["sessions"][number]["exercises"][number],
) {
  const exerciseName = ex.exerciseName.trim().slice(0, 120);
  if (!exerciseName) return null;

  const targetRpe =
    typeof ex.targetRpe === "number" && Number.isFinite(ex.targetRpe)
      ? clampNumber(ex.targetRpe, 1, 10)
      : undefined;

  return compactObject({
    exerciseName,
    targetSets: clampOptionalInt(ex.targetSets, 1, 20) ?? 3,
    targetReps: ex.targetReps?.slice(0, 40),
    targetDurationSeconds: clampOptionalInt(ex.targetDurationSeconds, 1, 14400),
    targetDistanceMeters: clampOptionalInt(ex.targetDistanceMeters, 1, 100000),
    targetWeight: ex.targetWeight?.slice(0, 40),
    targetRpe,
    restSeconds: clampOptionalInt(ex.restSeconds, 0, 600),
    notes: ex.notes?.slice(0, 300),
    supersetId: ex.supersetId?.slice(0, 20),
    isMetabolicProtocol: ex.isMetabolicProtocol,
    primaryMuscle: ex.primaryMuscle?.slice(0, 40),
  });
}

function mapActivePlanDto(
  plan: TrainingPlan | undefined,
  completedSessionKeys: string[],
  now: Date,
): CoachActionRequestDto["activePlan"] {
  if (!plan) return null;
  const nextSession = plan.getNextUncompletedSession(new Set(completedSessionKeys));
  return compactObject({
    createdAt: plan.createdAt.slice(0, 40),
    cycleWeeks: clampOptionalInt(plan.cycleWeeks, 1, 4) ?? 2,
    currentWeekNumber: clampOptionalInt(plan.getCurrentWeekNumber(now), 1, 4) ?? 1,
    nextUncompletedSessionKey: nextSession
      ? TrainingPlan.sessionKey(nextSession.weekNumber, nextSession.dayOfWeek)
      : undefined,
    sessions: plan.sessions.slice(0, 28).map((sessionItem) => {
      const normalizedDay = Number.isFinite(sessionItem.dayOfWeek)
        ? ((Math.round(sessionItem.dayOfWeek) % 7) + 7) % 7
        : 0;
      return {
        dayOfWeek: normalizedDay,
        weekNumber: clampOptionalInt(sessionItem.weekNumber, 1, 4) ?? 1,
        sessionLabel: sessionItem.sessionLabel.trim().slice(0, 120),
        focusDescription: sessionItem.focusDescription.trim().slice(0, 200),
        exercises: sessionItem.exercises
          .slice(0, 30)
          .map(mapPlannedExerciseDto)
          .filter((ex): ex is NonNullable<typeof ex> => ex !== null),
      };
    }),
  });
}

function deriveWorkoutStatus(session: WorkoutSession | null): string {
  if (!session) return "Not started";
  return session.phase === "post-workout" ? "Completed" : "In progress";
}

export function buildCoachActionRequestDto(
  options: CoachingAdviceRequest,
  learnedMuscleMap?: Record<string, MuscleActivation>,
  now: Date = new Date(),
): CoachActionRequestDto {
  const nowMs = now.getTime();
  const muscleMap = learnedMuscleMap ?? getLearnedMuscleMap(createExerciseMuscleMapRepository());
  const session = resolveCurrentSession(options.exerciseLogs, nowMs);
  const intent = resolveCoachingIntent({
    requestedMode: options.mode,
    activePlan: options.activePlan,
  });
  const completedSessionKeys =
    intent.effectiveMode === "planning"
      ? []
      : Array.from(options.completedSessionKeys ?? []).slice(0, 28);

  return compactObject({
    action: "coach" as const,
    clientRequestId: options.clientRequestId,
    mode: intent.effectiveMode,
    muscleGroups: Array.from(VALID_MUSCLE_GROUPS),
    locale: resolveLocale(),
    localDate: isoDateString(now),
    nowIso: now.toISOString(),
    workoutPhase: session?.phase ?? "planning",
    workoutStatus: deriveWorkoutStatus(session),
    sessionStartBoundaryMs: getSessionStartBoundary(session, nowMs),
    question: options.question?.slice(0, 2000),
    userProfile: mapUserProfileDto(options.userProfile),
    insights: mapInsightsDto(options.insights, muscleMap),
    recentLogs: mapRecentLogsDto(options.exerciseLogs, now),
    trainingSummaries: mapTrainingSummariesDto(options.trainingSummaries),
    previousMessages: options.previousMessages
      .slice(-MAX_PREVIOUS_MESSAGES)
      .map(sanitizePreviousMessage),
    events: options.events?.length
      ? options.events.slice(-50).map((e) => ({
          type: e.type.slice(0, 60),
          dates: e.dates.slice(0, 60),
        }))
      : undefined,
    activePlan: mapActivePlanDto(intent.activePlanForPrompt, completedSessionKeys, now),
    completedSessionKeys,
  });
}

export function getTodayLogsCount(session: WorkoutSession | null): number {
  return session?.logs.length ?? 0;
}

function persistLearnedMuscleGroups(advice: CoachingAdvice): void {
  const exercisesToLearn = [
    ...(advice.recommendedWorkout ?? []),
    ...(advice.trainingPlan?.sessions.flatMap((s) => s.exercises) ?? []),
  ];
  if (exercisesToLearn.length === 0) return;

  try {
    learnFromCoachingAdvice(exercisesToLearn, createExerciseMuscleMapRepository());
  } catch (e) {
    Sentry.captureException(e, {
      tags: { scope: "ai-service", feature: "learn-from-response" },
    });
  }
}

function mapCoachRequestError(error: unknown, effectiveMode: CoachingMode): CoachingAdviceError {
  const isTerminalHttpError =
    error instanceof AiEdgeHttpError &&
    (error.status === 400 || error.status === 413 || error.status === 500 || error.status === 502);

  if (error instanceof AiEdgeHttpError) {
    if (error.status === 401) {
      return "unauthorized";
    }
    if (error.status === 429) {
      return "rate-limit-exceeded";
    }
  }
  console.error("AI request failed:", error);
  Sentry.captureException(error, {
    tags: { scope: "ai-service", feature: "ask-ai-request" },
    extra: {
      mode: effectiveMode,
      status: error instanceof AiEdgeHttpError ? error.status : undefined,
    },
  });
  return isTerminalHttpError ? "coaching-request-server-error" : "coaching-request-failed";
}

function normalizeParsedAdvice(rawAdvice: z.infer<typeof coachAdviceSchema>): CoachingAdvice {
  return {
    ...rawAdvice,
    suggestedFollowUps: sanitizeSuggestedFollowUps(rawAdvice.suggestedFollowUps),
  };
}

class ProcessingInProgressError extends Error {
  constructor() {
    super("Request is still processing");
    this.name = "ProcessingInProgressError";
  }
}

export function requestCoachingAdvice(
  options: CoachingAdviceRequest,
): ResultAsync<CoachingAdviceResult, CoachingAdviceError> {
  if (!options.accessToken) return errAsync("unauthorized");
  const accessToken = options.accessToken;

  const dto = buildCoachActionRequestDto({
    ...options,
    clientRequestId: options.clientRequestId ?? crypto.randomUUID(),
  });
  const isPlanningMode =
    dto.mode === "planning" ||
    options.previousMessages.length === 0 ||
    dto.workoutPhase === "planning";
  const clientTimeoutMs = isPlanningMode ? 65_000 : 48_000;

  return ResultAsync.fromPromise(
    postAiCoachStream<unknown>({
      accessToken,
      body: dto,
      timeoutMs: clientTimeoutMs,
      onPreview: options.onStreamPreview,
    }).then((payload): CoachingAdvice => {
      const parsed = coachEndpointResponseSchema.parse(payload);
      if (!("advice" in parsed)) {
        throw new ProcessingInProgressError();
      }
      return normalizeParsedAdvice(parsed.advice);
    }),
    (error): CoachingAdviceError => {
      if (error instanceof ProcessingInProgressError) {
        return "coaching-request-failed";
      }
      if (error instanceof z.ZodError) {
        return "generate-content-stream-failed";
      }
      return mapCoachRequestError(error, dto.mode);
    },
  )
    .andTee(persistLearnedMuscleGroups)
    .map((advice) => ({ advice }));
}

export function recoverCoachingAdvice(
  clientRequestId: string,
  accessToken: string | undefined,
): ResultAsync<RecoverCoachingAdviceResult, RecoverCoachingAdviceError> {
  if (!accessToken) return errAsync("unauthorized");

  return ResultAsync.fromPromise(
    postAiEdgeFunction<unknown>({
      accessToken,
      body: { action: "recover", clientRequestId },
      timeoutMs: 15_000,
    }).then((payload): RecoverCoachingAdviceResult => {
      const parsed = recoverEndpointResponseSchema.parse(payload);
      if (parsed.status === "processing") {
        return { status: "processing" };
      }
      return { status: "completed", advice: normalizeParsedAdvice(parsed.advice) };
    }),
    (error): RecoverCoachingAdviceError => {
      if (error instanceof z.ZodError) {
        return "generate-content-stream-failed";
      }
      if (error instanceof AiEdgeHttpError) {
        if (error.status === 404) return "not-found";
        if (error.status === 502) return "server-failed";
      }
      return mapCoachRequestError(error, "execution");
    },
  ).andTee((result) => {
    if (result.status === "completed") {
      persistLearnedMuscleGroups(result.advice);
    }
  });
}
