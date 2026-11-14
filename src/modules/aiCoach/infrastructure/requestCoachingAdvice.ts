import * as Sentry from "@sentry/vue";
import { errAsync, ResultAsync } from "neverthrow";
import { z } from "zod";

import { createExerciseMuscleMapRepository } from "@/modules/platform/infrastructure";
import { learnFromCoachingAdvice, VALID_MUSCLE_GROUPS } from "@/modules/sharedKernel/application";
import type { WorkoutSession } from "@/modules/trainingLogs/application";
import { postProcessCoachingAdvice } from "../application";
import {
  type CoachingAdvice,
  type CoachingAdviceError,
  type CoachingAdviceRequest,
  type CoachingAdviceResult,
  type CoachingMessage,
  type CoachingMode,
  extractUserQuestion,
  resolveCoachingIntent,
} from "../domain";
import { AiEdgeHttpError, postAiEdgeFunction } from "./aiEdgeClient";
import { translateCoachingAdviceJson } from "./CoachingAdviceTranslator";
import { assembleCoachingPrompt, assemblePromptContext } from "./promptAssembler";

interface ConversationContent {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

const MAX_CONVERSATION_TURNS = 40;
const MAX_PART_TEXT_LENGTH = 35_000;
const MAX_TOTAL_CONVERSATION_CHARS = 50_000;

function clampPartText(text: string): string {
  return text.length > MAX_PART_TEXT_LENGTH ? text.slice(0, MAX_PART_TEXT_LENGTH) : text;
}

function totalContentsLength(contents: ConversationContent[]): number {
  return contents.reduce((sum, item) => sum + (item.parts[0]?.text.length ?? 0), 0);
}

function normalizeAlternatingHistory(history: ConversationContent[]): ConversationContent[] {
  const normalized: ConversationContent[] = [];

  for (const turn of history) {
    // Gemini generateContent expects the conversation to begin with a "user" turn
    if (normalized.length === 0 && turn.role !== "user") {
      continue;
    }

    const previous = normalized.at(-1);
    if (previous && previous.role === turn.role) {
      const mergedText = clampPartText(
        `${previous.parts[0]?.text ?? ""}\n\n${turn.parts[0]?.text ?? ""}`.trim(),
      );
      previous.parts = [{ text: mergedText }];
      continue;
    }

    normalized.push({ role: turn.role, parts: [{ text: turn.parts[0]?.text ?? "" }] });
  }

  // Active turn is appended as "user", so history must end on "model"
  while (normalized.at(-1)?.role === "user") {
    normalized.pop();
  }

  return normalized;
}

function buildBoundedConversationContents(
  previousMessages: CoachingMessage[],
  currentUserInput: string,
): ConversationContent[] {
  const activeText = clampPartText(currentUserInput);
  const historyCharBudget = MAX_TOTAL_CONVERSATION_CHARS - activeText.length;
  let remainingChars = historyCharBudget;
  const maxHistoryItems = MAX_CONVERSATION_TURNS - 1;

  const recentCandidates = previousMessages.slice(-maxHistoryItems);
  const keptHistory: ConversationContent[] = [];

  for (let i = recentCandidates.length - 1; i >= 0; i--) {
    const mapped = mapPreviousMessageToContent(recentCandidates[i]);
    const partText = clampPartText(mapped.parts[0]?.text ?? "");
    if (partText.length > remainingChars) break;
    remainingChars -= partText.length;
    keptHistory.unshift({
      role: mapped.role,
      parts: [{ text: partText }],
    });
  }

  const normalized = normalizeAlternatingHistory(keptHistory);
  while (normalized.length > 0 && totalContentsLength(normalized) > historyCharBudget) {
    normalized.shift();
    if (normalized[0]?.role === "model") {
      normalized.shift();
    }
  }

  return [...normalized, { role: "user" as const, parts: [{ text: activeText }] }];
}

const aiCoachEndpointResponseSchema = z.object({
  text: z.string().min(1),
  thought: z.string().optional(),
});

function mapPreviousMessageToContent(msg: CoachingMessage): ConversationContent {
  if (msg.role === "user") {
    const question = extractUserQuestion(msg.content);
    return {
      role: "user",
      parts: [
        {
          text:
            question ??
            (msg.content.startsWith("# session")
              ? "Please evaluate my workout readiness and recommend today's session."
              : msg.content),
        },
      ],
    };
  }

  let text = msg.content;
  try {
    const parsed = JSON.parse(msg.content) as { coachMessage?: unknown };
    if (parsed && typeof parsed.coachMessage === "string") {
      text = parsed.coachMessage;
    }
  } catch {
    // not JSON, keep as-is
  }

  return {
    role: "model",
    parts: [{ text }],
  };
}

export function getTodayLogsCount(session: WorkoutSession | null): number {
  return session?.logs.length ?? 0;
}

async function executeBackendCoachRequest(options: {
  accessToken: string;
  mode: CoachingMode;
  allowPlanUpdate: boolean;
  muscleGroups: string[];
  contents: ConversationContent[];
  timeoutMs: number;
}): Promise<{ text: string; thought?: string }> {
  const payload = await postAiEdgeFunction<unknown>({
    accessToken: options.accessToken,
    body: {
      action: "coach",
      mode: options.mode,
      allowPlanUpdate: options.allowPlanUpdate,
      muscleGroups: options.muscleGroups,
      contents: options.contents,
    },
    timeoutMs: options.timeoutMs,
  });

  return aiCoachEndpointResponseSchema.parse(payload);
}

function attachThoughtIfMissing(advice: CoachingAdvice, thought?: string): CoachingAdvice {
  if (!advice.scratchpad && thought) {
    return { ...advice, scratchpad: thought };
  }
  return advice;
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
  return "coaching-request-failed";
}

export function requestCoachingAdvice(
  options: CoachingAdviceRequest,
): ResultAsync<CoachingAdviceResult, CoachingAdviceError> {
  const { accessToken, previousMessages, insights } = options;
  if (!accessToken) return errAsync("unauthorized");

  const context = assemblePromptContext(options.exerciseLogs, previousMessages);
  const { workoutPhase, isFirstMessage } = context;

  const intent = resolveCoachingIntent({
    requestedMode: options.mode,
    activePlan: options.activePlan,
  });
  const { effectiveMode } = intent;

  const currentUserInput = assembleCoachingPrompt(options, context, intent);

  // Server times out at 55s for planning, 40s for follow-ups. Client timeout gives safe buffer for network transit.
  const isPlanningMode =
    effectiveMode === "planning" || isFirstMessage || workoutPhase === "planning";
  const clientTimeoutMs = isPlanningMode ? 65_000 : 48_000;

  if (import.meta.env.DEV) console.debug(currentUserInput);

  const conversationContents = buildBoundedConversationContents(previousMessages, currentUserInput);

  return ResultAsync.fromPromise(
    executeBackendCoachRequest({
      accessToken,
      mode: effectiveMode,
      allowPlanUpdate: Boolean(options.question),
      muscleGroups: Array.from(VALID_MUSCLE_GROUPS),
      contents: conversationContents,
      timeoutMs: clientTimeoutMs,
    }),
    (error): CoachingAdviceError => mapCoachRequestError(error, effectiveMode),
  )
    .andThen(({ text, thought }) =>
      translateCoachingAdviceJson(text, effectiveMode)
        .mapErr((): CoachingAdviceError => "generate-content-stream-failed")
        .map((parsed) =>
          postProcessCoachingAdvice(
            attachThoughtIfMissing(parsed, thought),
            workoutPhase,
            insights.deloadStatus,
            effectiveMode === "planning" ? new Set() : options.completedSessionKeys,
            options.activePlan,
          ),
        ),
    )
    .andTee(persistLearnedMuscleGroups)
    .map((advice) => ({ advice, requestPayload: currentUserInput }));
}
