import { errAsync, ResultAsync } from "neverthrow";
import type { WorkoutSession } from "@/modules/trainingLogs/application";

/**
 * Application-level use-cases for AI coaching.
 * Uses an injected service port so application remains infrastructure-agnostic.
 */

import type {
  CoachingAdviceError,
  CoachingAdviceRequest,
  CoachingAdviceResult,
  ExerciseCleanupResult,
} from "../domain/types";

export interface AiCoachService {
  ask(options: CoachingAdviceRequest): ResultAsync<CoachingAdviceResult, CoachingAdviceError>;
  classifyExercises(
    exerciseNames: string[],
    accessToken: string | undefined,
  ): ResultAsync<ExerciseCleanupResult, CoachingAdviceError>;
  getTodayLogsCount(session: WorkoutSession | null): number;
}

export function requestAdvice(
  service: AiCoachService,
  options: CoachingAdviceRequest,
): ResultAsync<CoachingAdviceResult, CoachingAdviceError> {
  return service.ask(options);
}

export function classifyExerciseNames(
  service: AiCoachService,
  exerciseNames: string[],
  accessToken: string | undefined,
): ResultAsync<ExerciseCleanupResult, CoachingAdviceError> {
  return service.classifyExercises(exerciseNames, accessToken);
}

export function getTodayLogsCount(service: AiCoachService, session: WorkoutSession | null): number {
  return service.getTodayLogsCount(session);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries once, but only when the model produced unusable output
 * (`generate-content-stream-failed`). Request failures (`coaching-request-failed`),
 * `unauthorized`, and `rate-limit-exceeded` are never retried.
 */
export function requestAdviceWithSingleRetry(
  service: AiCoachService,
  options: CoachingAdviceRequest,
  retryDelayMs = 2000,
): ResultAsync<CoachingAdviceResult, CoachingAdviceError> {
  const askOnce = () => requestAdvice(service, options);

  return askOnce().orElse((error) => {
    if (error !== "generate-content-stream-failed") return errAsync(error);

    return ResultAsync.fromPromise(
      delay(retryDelayMs),
      () => "coaching-request-failed" as const,
    ).andThen(() => askOnce());
  });
}

export * from "./fatigueTriggerMapper";
