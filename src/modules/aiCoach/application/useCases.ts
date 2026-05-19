import { errAsync, Result, ResultAsync } from "neverthrow";
import type { Event } from "@/modules/events/domain";
import type { UserProfile } from "@/modules/profile/domain";
import type { TrainingInsights } from "@/modules/trainingInsights/domain";
import type { WorkoutSession } from "@/modules/trainingLogs/application";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import type { TrainingSummary } from "@/modules/trainingSummary/application";

/**
 * Application-level use-cases for AI coaching.
 * Uses an injected service port so application remains infrastructure-agnostic.
 */

export type {
  AiResponseData,
  AskAiError,
  AskAiResult,
  ExerciseCleanupResult,
  PreviousAiMessage,
} from "../domain/types";

import type {
  AskAiError,
  AskAiOptions,
  AskAiResult,
  ExerciseCleanupResult,
  PreviousAiMessage,
} from "../domain/types";

export interface AiCoachService {
  ask(options: AskAiOptions): ResultAsync<AskAiResult, AskAiError>;
  classifyExercises(
    exerciseNames: string[],
    apiKey: string | undefined,
  ): ResultAsync<ExerciseCleanupResult, AskAiError>;
  getTodayLogsCount(session: WorkoutSession | null): number;
}

export function askCoach(
  service: AiCoachService,
  options: AskAiOptions,
): ResultAsync<AskAiResult, AskAiError> {
  return service.ask(options);
}

export function classifyExerciseNames(
  service: AiCoachService,
  exerciseNames: string[],
  apiKey: string | undefined,
): ResultAsync<ExerciseCleanupResult, AskAiError> {
  return service.classifyExercises(exerciseNames, apiKey);
}

export function getTodayLogsCount(service: AiCoachService, session: WorkoutSession | null): number {
  return service.getTodayLogsCount(session);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function askCoachWithSingleRetry(
  service: AiCoachService,
  options: AskAiOptions,
  retryDelayMs = 2000,
): ResultAsync<AskAiResult, AskAiError> {
  const askOnce = () => askCoach(service, options);

  return askOnce().orElse((error) => {
    if (error === "missing-api-key") return errAsync(error);

    return ResultAsync.fromPromise(delay(retryDelayMs), () => "ai-request-failed" as const).andThen(
      () => askOnce(),
    );
  });
}

const parseResponseJson = Result.fromThrowable(JSON.parse, () => "invalid-json" as const);

export function responseStartsDeload(responseText: string): boolean {
  return parseResponseJson(responseText)
    .map((parsed) => {
      const response = parsed as { startDeload?: boolean };
      return response.startDeload === true;
    })
    .unwrapOr(false);
}

export * from "./fatigueTriggerMapper";
