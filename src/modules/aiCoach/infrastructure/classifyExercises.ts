import * as Sentry from "@sentry/vue";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { z } from "zod";
import { VALID_MUSCLE_GROUPS } from "@/modules/sharedKernel/application";
import type { CoachingAdviceError, ExerciseCleanupResult } from "../domain/types";
import { AiEdgeHttpError, postAiEdgeFunction } from "./aiEdgeClient";

const exerciseCleanupValidationSchema = z.object({
  classifications: z.array(
    z.object({
      exerciseName: z.string(),
      primaryMuscle: z.string(),
      secondaryMuscles: z
        .array(
          z.object({
            muscleGroup: z.string(),
            contribution: z.number().optional(),
          }),
        )
        .optional(),
      confidence: z.number(),
    }),
  ),
});

const classifyEndpointResponseSchema = z.object({
  text: z.string().min(1),
});

async function executeClassifyRequest(
  exerciseNames: string[],
  accessToken: string,
): Promise<ExerciseCleanupResult> {
  const json = await postAiEdgeFunction<{ text: string }>({
    accessToken,
    body: {
      action: "classify",
      exerciseNames,
      muscleGroups: [...VALID_MUSCLE_GROUPS],
    },
    timeoutMs: 35_000,
  });

  const response = classifyEndpointResponseSchema.parse(json);
  return exerciseCleanupValidationSchema.parse(JSON.parse(response.text)) as ExerciseCleanupResult;
}

/**
 * Ask the backend AI service to classify unknown exercise names.
 * Returns structured proposals that should be passed to `applyAiCleanupResults()`.
 */
export function classifyExercises(
  exerciseNames: string[],
  accessToken: string | undefined,
): ResultAsync<ExerciseCleanupResult, CoachingAdviceError> {
  if (!accessToken) return errAsync("unauthorized");
  if (exerciseNames.length === 0) return okAsync({ classifications: [] });

  return ResultAsync.fromPromise(
    executeClassifyRequest(exerciseNames, accessToken),
    (error): CoachingAdviceError => {
      if (error instanceof AiEdgeHttpError) {
        if (error.status === 401) return "unauthorized";
        if (error.status === 429) return "rate-limit-exceeded";
      }
      console.error("Exercise classification failed:", error);
      Sentry.captureException(error, {
        tags: { scope: "ai-service", feature: "exercise-classification" },
        extra: { exerciseCount: exerciseNames.length },
      });
      return "coaching-request-failed";
    },
  );
}
