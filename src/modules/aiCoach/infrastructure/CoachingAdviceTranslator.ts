import * as Sentry from "@sentry/vue";
import { Result } from "neverthrow";
import { z } from "zod";
import type { CoachingAdvice } from "../domain";

const coachingAdviceSchema = z.object({
  scratchpad: z.string().optional(),
  coachMessage: z.string(),
  startDeload: z.boolean().optional(),
  recommendedWorkout: z
    .array(
      z.object({
        exerciseName: z.string(),
        targetSets: z.number(),
        targetReps: z.string(),
        targetWeight: z.string().optional(),
        targetRpe: z.number().optional(),
        restSeconds: z.number().optional(),
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
      }),
    )
    .optional(),
  trainingPlan: z
    .object({
      cycleWeeks: z.number(),
      sessions: z.array(
        z.object({
          dayOfWeek: z.number(),
          weekNumber: z.number(),
          sessionLabel: z.string(),
          focusDescription: z.string(),
          exercises: z.array(
            z.object({
              exerciseName: z.string(),
              targetSets: z.number(),
              targetReps: z.string(),
              targetWeight: z.string().optional(),
              targetRpe: z.number().optional(),
              restSeconds: z.number().optional(),
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
            }),
          ),
        }),
      ),
    })
    .optional(),
});

/**
 * Anti-Corruption Layer (ACL) Translator
 * Safely parses the raw JSON response from the LLM into a strongly typed CoachingAdvice domain object.
 */
export function translateCoachingAdviceJson(
  rawJson: string,
): Result<CoachingAdvice, "invalid-json"> {
  return Result.fromThrowable(
    () => {
      const parsed = JSON.parse(rawJson);
      return coachingAdviceSchema.parse(parsed) as CoachingAdvice;
    },
    (e) => {
      Sentry.captureException(e, { extra: { coachingAdviceText: rawJson } });
      return "invalid-json" as const;
    },
  )();
}
