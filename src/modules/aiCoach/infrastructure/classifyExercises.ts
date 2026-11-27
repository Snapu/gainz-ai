import * as Sentry from "@sentry/vue";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { z } from "zod";
import type { Entitlement } from "@/modules/billing/domain";
import { parseEntitlement } from "@/modules/billing/infrastructure";
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
  entitlement: z.unknown().optional(),
});

async function executeClassifyRequest(
  exerciseNames: string[],
  accessToken: string,
): Promise<ExerciseCleanupResult> {
  const json = await postAiEdgeFunction<unknown>({
    accessToken,
    body: {
      action: "classify",
      exerciseNames,
      muscleGroups: [...VALID_MUSCLE_GROUPS],
    },
    timeoutMs: 35_000,
  });

  const response = classifyEndpointResponseSchema.parse(json);
  const parsed = exerciseCleanupValidationSchema.parse(
    JSON.parse(response.text),
  ) as ExerciseCleanupResult;
  const entitlement = parseEntitlement(response.entitlement) ?? undefined;
  return {
    ...parsed,
    ...(entitlement ? { entitlement } : {}),
  };
}

/**
 * Ask the backend AI service to classify unknown exercise names.
 * Returns structured proposals that should be passed to `applyAiCleanupResults()`.
 */
export function classifyExercises(
  exerciseNames: string[],
  accessToken: string | undefined,
  onEntitlementUpdate?: (entitlement: Entitlement) => void,
): ResultAsync<ExerciseCleanupResult, CoachingAdviceError> {
  if (!accessToken) return errAsync("unauthorized");
  if (exerciseNames.length === 0) return okAsync({ classifications: [] });

  return ResultAsync.fromPromise(
    executeClassifyRequest(exerciseNames, accessToken),
    (error): CoachingAdviceError => {
      if (error instanceof AiEdgeHttpError) {
        if (error.status === 401) return "unauthorized";
        if (error.status === 402 || error.status === 429) {
          const body = error.body;
          const updated =
            body && typeof body === "object"
              ? parseEntitlement((body as { entitlement?: unknown }).entitlement)
              : null;
          if (updated) onEntitlementUpdate?.(updated);
          return error.status === 402 ? "payment-required" : "rate-limit-exceeded";
        }
      }
      console.error("Exercise classification failed:", error);
      Sentry.captureException(error, {
        tags: { scope: "ai-service", feature: "exercise-classification" },
        extra: { exerciseCount: exerciseNames.length },
      });
      return "coaching-request-failed";
    },
  ).andTee((result) => {
    if (result.entitlement) {
      onEntitlementUpdate?.(result.entitlement);
    }
  });
}
