import { GoogleGenAI, type Schema, Type } from "@google/genai";
import * as Sentry from "@sentry/vue";
import { errAsync, okAsync, Result, ResultAsync } from "neverthrow";
import { VALID_MUSCLE_GROUPS } from "@/modules/sharedKernel/application";
import type { AskAiError, ExerciseCleanupResult } from "../domain/types";

const CLASSIFICATION_TEMPERATURE = 0.1;
const MUSCLE_GROUPS_PROMPT_LIST = [...VALID_MUSCLE_GROUPS].join(", ");

const exerciseCleanupSchema: Schema = {
  type: Type.OBJECT,
  required: ["classifications"],
  properties: {
    classifications: {
      type: Type.ARRAY,
      description: "Muscle group assignments for unknown exercises.",
      items: {
        type: Type.OBJECT,
        required: ["exerciseName", "primaryMuscle", "confidence"],
        properties: {
          exerciseName: { type: Type.STRING },
          primaryMuscle: {
            type: Type.STRING,
            description: `Primary muscle group. Must be one of: ${MUSCLE_GROUPS_PROMPT_LIST}.`,
          },
          secondaryMuscles: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ["muscleGroup"],
              properties: {
                muscleGroup: { type: Type.STRING },
                contribution: { type: Type.NUMBER },
              },
            },
          },
          confidence: {
            type: Type.NUMBER,
            description: "Confidence score 0.0–1.0. Use < 0.8 only when genuinely ambiguous.",
          },
        },
      },
    },
  },
};

function isServiceUnavailableError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (!("status" in error)) return false;
  const status = (error as { status?: unknown }).status;
  return status === 503 || status === "UNAVAILABLE";
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
): ResultAsync<ExerciseCleanupResult, AskAiError> {
  if (!apiKey) return errAsync("missing-api-key");
  if (exerciseNames.length === 0) return okAsync({ classifications: [] });

  const ai = new GoogleGenAI({ apiKey });

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
    responseSchema: exerciseCleanupSchema,
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
      "Classification primary model unavailable, falling back to gemini-3.1-flash-lite-preview",
      {
        level: "info",
        tags: { scope: "ai-service", feature: "model-fallback" },
        extra: { exerciseCount: exerciseNames.length },
      },
    );

    return ResultAsync.fromPromise(
      ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
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
      return "ai-request-failed" as const;
    })
    .andThen((response) => {
      const parseResult = Result.fromThrowable(
        () => JSON.parse(response.text ?? "") as ExerciseCleanupResult,
        (error) => {
          console.error("Exercise classification failed:", error);
          Sentry.captureException(error, {
            tags: { scope: "ai-service", feature: "exercise-classification" },
            extra: { exerciseCount: exerciseNames.length },
          });
          return "ai-request-failed" as const;
        },
      )();

      if (parseResult.isErr()) {
        return errAsync<ExerciseCleanupResult, AskAiError>(parseResult.error);
      }

      const parsed = parseResult.value;
      if (!Array.isArray(parsed?.classifications)) {
        Sentry.captureMessage("Exercise classification returned invalid schema", {
          level: "warning",
          tags: { scope: "ai-service", feature: "exercise-classification" },
          extra: { exerciseCount: exerciseNames.length },
        });
        return errAsync<ExerciseCleanupResult, AskAiError>("ai-request-failed");
      }

      return okAsync<ExerciseCleanupResult, AskAiError>(parsed);
    });
}
