import { errAsync, okAsync, Result, ResultAsync } from "neverthrow";
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
  AskAiResult,
  ExerciseCleanupResult,
  PreviousAiMessage,
} from "../domain/types";

export interface AiCoachService {
  ask(
    apiKey: string | undefined,
    userProfile: UserProfile,
    insights: TrainingInsights,
    exerciseLogs: ExerciseLog[],
    trainingSummaries: TrainingSummary[],
    previousMessages: PreviousAiMessage[],
    events?: Event[],
  ): Promise<Result<AskAiResult, AskAiError>>;
  classifyExercises(
    exerciseNames: string[],
    apiKey: string | undefined,
  ): Promise<Result<ExerciseCleanupResult, AskAiError>>;
  getTodayLogsCount(session: WorkoutSession | null): number;
}

export function askCoach(
  service: AiCoachService,
  apiKey: string | undefined,
  userProfile: UserProfile,
  insights: TrainingInsights,
  exerciseLogs: ExerciseLog[],
  trainingSummaries: TrainingSummary[],
  previousMessages: PreviousAiMessage[],
  events?: Event[],
): Promise<Result<AskAiResult, AskAiError>> {
  return service.ask(
    apiKey,
    userProfile,
    insights,
    exerciseLogs,
    trainingSummaries,
    previousMessages,
    events,
  );
}

export function classifyExerciseNames(
  service: AiCoachService,
  exerciseNames: string[],
  apiKey: string | undefined,
): Promise<Result<ExerciseCleanupResult, AskAiError>> {
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
  apiKey: string | undefined,
  userProfile: UserProfile,
  insights: TrainingInsights,
  exerciseLogs: ExerciseLog[],
  trainingSummaries: TrainingSummary[],
  previousMessages: PreviousAiMessage[],
  events?: Event[],
  retryDelayMs = 2000,
): ResultAsync<AskAiResult, AskAiError> {
  return ResultAsync.fromPromise(
    (async () => {
      let result = await askCoach(
        service,
        apiKey,
        userProfile,
        insights,
        exerciseLogs,
        trainingSummaries,
        previousMessages,
        events,
      );

      if (result.isErr() && result.error !== "missing-api-key") {
        await delay(retryDelayMs);
        result = await askCoach(
          service,
          apiKey,
          userProfile,
          insights,
          exerciseLogs,
          trainingSummaries,
          previousMessages,
          events,
        );
      }

      return result;
    })(),
    () => "ai-request-failed" as AskAiError,
  ).andThen((result) => {
    if (result.isErr()) return errAsync(result.error);
    return okAsync(result.value);
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
