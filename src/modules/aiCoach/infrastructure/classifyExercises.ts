import { GoogleGenAI } from "@google/genai";
import * as Sentry from "@sentry/vue";
import { errAsync, okAsync, Result, ResultAsync } from "neverthrow";
import { z } from "zod";
import { VALID_MUSCLE_GROUPS } from "@/modules/sharedKernel/application";
import type { CoachingAdviceError, ExerciseCleanupResult } from "../domain/types";

const CLASSIFICATION_TEMPERATURE = 0.1;
const MUSCLE_GROUPS_LIST = [...VALID_MUSCLE_GROUPS];
const MUSCLE_GROUPS_PROMPT_LIST = MUSCLE_GROUPS_LIST.join(", ");

const muscleGroupSchema =
  MUSCLE_GROUPS_LIST.length > 0
    ? z
        .enum(MUSCLE_GROUPS_LIST as [string, ...string[]])
        .describe(`Must be one of: ${MUSCLE_GROUPS_PROMPT_LIST}.`)
    : z.string();

function createExerciseCleanupSchema(muscleSchema: z.ZodType<string>) {
  return z.object({
    classifications: z
      .array(
        z.object({
          exerciseName: z.string(),
          primaryMuscle: muscleSchema.describe(
            `Primary muscle group. Must be one of: ${MUSCLE_GROUPS_PROMPT_LIST}.`,
          ),
          secondaryMuscles: z
            .array(
              z.object({
                muscleGroup: muscleSchema,
                contribution: z.number().optional(),
              }),
            )
            .optional(),
          confidence: z
            .number()
            .describe("Confidence score 0.0–1.0. Use < 0.8 only when genuinely ambiguous."),
        }),
      )
      .describe("Muscle group assignments for unknown exercises."),
  });
}

const { $schema: _omitted, ...exerciseCleanupJsonSchema } = z.toJSONSchema(
  createExerciseCleanupSchema(muscleGroupSchema),
) as Record<string, unknown>;

const exerciseCleanupValidationSchema = createExerciseCleanupSchema(z.string());

function isServiceUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  const nestedCode = (e.error as Record<string, unknown> | undefined)?.code;
  if (nestedCode === 503 || nestedCode === 429) return true;
  if (
    e.status === 503 ||
    e.status === 429 ||
    e.status === "UNAVAILABLE" ||
    e.status === "RESOURCE_EXHAUSTED"
  ) {
    return true;
  }
  if (
    typeof e.message === "string" &&
    /high demand|503|429|unavailable|resource_exhausted|rate limit/i.test(e.message)
  ) {
    return true;
  }
  return false;
}

/**
 * Ask AI to classify unknown exercise names and detect aliases among them
 * and against well-known exercises. Used for automatic Insights cleanup.
 *
 * Returns structured proposals that should be passed to `applyAiCleanupResults()`.
 */
export function classifyExercises(
  exerciseNames: string[],
  apiKey: string | undefined,
): ResultAsync<ExerciseCleanupResult, CoachingAdviceError> {
  if (!apiKey) return errAsync("missing-api-key");
  if (exerciseNames.length === 0) return okAsync({ classifications: [] });

  const ai = new GoogleGenAI({ apiKey, apiVersion: "v1beta" });

  const prompt = `You are a fitness data expert. For each exercise name in the list below, classify it:

Assign the primary muscle group and any significant secondary muscles. Use only: ${MUSCLE_GROUPS_PROMPT_LIST}.

Exercise names to process:
${exerciseNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Important rules:
- Classify ALL exercises in the list, including locale variants (e.g. "Bankdrücken", "RDL") — assign their muscles directly, do not redirect to a canonical name.
- Never output duplicate entries.
- Muscle group values must exactly match the allowed list.
- Set confidence < 0.8 only when genuinely ambiguous (e.g. "Press" with no context).`;

  const classifyConfig = {
    responseMimeType: "application/json",
    responseJsonSchema: exerciseCleanupJsonSchema,
    temperature: CLASSIFICATION_TEMPERATURE,
  };
  const classifyContents = [{ role: "user" as const, parts: [{ text: prompt }] }];

  const requestPrimary = ResultAsync.fromPromise(
    ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: classifyContents,
      config: classifyConfig,
    }),
    (error) => error,
  );

  // Elegant fallback pattern: try primary model → if unavailable (503), try fallback
  // Per neverthrow-elegant: .orElse() for error recovery and fallback chains
  const requestWithFallback = requestPrimary.orElse((error) => {
    if (!isServiceUnavailableError(error)) {
      return errAsync<{ text?: string }, unknown>(error);
    }

    Sentry.captureMessage(
      "Classification primary model unavailable, falling back to gemini-3.5-flash-lite",
      {
        level: "info",
        tags: { scope: "ai-service", feature: "model-fallback" },
        extra: { exerciseCount: exerciseNames.length },
      },
    );

    return ResultAsync.fromPromise(
      ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: classifyContents,
        config: classifyConfig,
      }),
      (fallbackError) => fallbackError,
    );
  });

  return requestWithFallback
    .mapErr((error) => {
      console.error("Exercise classification failed:", error);
      Sentry.captureException(error, {
        tags: { scope: "ai-service", feature: "exercise-classification" },
        extra: { exerciseCount: exerciseNames.length },
      });
      return "coaching-request-failed" as const;
    })
    .andThen((response) =>
      Result.fromThrowable(
        () =>
          exerciseCleanupValidationSchema.parse(
            JSON.parse(response.text ?? ""),
          ) as ExerciseCleanupResult,
        (error) => {
          console.error("Exercise classification failed:", error);
          Sentry.captureException(error, {
            tags: { scope: "ai-service", feature: "exercise-classification" },
            extra: { exerciseCount: exerciseNames.length },
          });
          return "coaching-request-failed" as const;
        },
      )(),
    );
}
