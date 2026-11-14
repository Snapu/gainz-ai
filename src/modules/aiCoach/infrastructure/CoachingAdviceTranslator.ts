import * as Sentry from "@sentry/vue";
import { Result } from "neverthrow";
import { z } from "zod";
import { type CoachingAdvice, type CoachingMode, sanitizeSuggestedFollowUps } from "../domain";

const roundedInt = z.number().transform((n) => Math.round(n));
const validationIntSchemas = {
  sets: roundedInt.pipe(z.number().min(1)),
  duration: roundedInt.pipe(z.number().min(1)),
  distance: roundedInt.pipe(z.number().min(1)),
  rest: roundedInt.pipe(z.number().min(0)),
  dayOfWeek: roundedInt.transform((n) => (n === 7 ? 0 : n)).pipe(z.number().min(0).max(6)),
  weekNumber: roundedInt.pipe(z.number().min(1)),
  cycleWeeks: roundedInt.pipe(z.number().min(1)),
};

function buildExerciseFields() {
  const secondaryMuscleSchema = z.object({
    muscleGroup: z.string(),
    contribution: z.number().optional(),
  });

  return {
    exerciseName: z.string(),
    targetSets: validationIntSchemas.sets,
    targetReps: z.string().optional(),
    targetDurationSeconds: validationIntSchemas.duration.optional(),
    targetDistanceMeters: validationIntSchemas.distance.optional(),
    targetWeight: z.string().optional(),
    targetRpe: z.number().min(1).max(10).optional(),
    restSeconds: validationIntSchemas.rest.optional(),
    notes: z.string().optional(),
    supersetId: z.string().optional(),
    primaryMuscle: z.string().optional(),
    secondaryMuscles: z.array(secondaryMuscleSchema).optional(),
  };
}

function buildTrainingPlanSchema() {
  const plannedExerciseSchema = z.object(buildExerciseFields());

  const plannedSessionSchema = z.object({
    dayOfWeek: validationIntSchemas.dayOfWeek,
    weekNumber: validationIntSchemas.weekNumber,
    sessionLabel: z.string(),
    focusDescription: z.string(),
    exercises: z.array(plannedExerciseSchema).min(1),
  });

  return z.object({
    cycleWeeks: validationIntSchemas.cycleWeeks,
    sessions: z.array(plannedSessionSchema).min(1),
  });
}

const coachingAdviceValidationSchema = z.object({
  scratchpad: z.string().optional(),
  coachMessage: z.string(),
  startDeload: z.boolean().optional(),
  suggestedFollowUps: z.unknown().optional().transform(sanitizeSuggestedFollowUps),
  recommendedWorkout: z
    .array(
      z.object({
        ...buildExerciseFields(),
        isMetabolicProtocol: z.boolean().optional(),
      }),
    )
    .optional(),
  trainingPlan: buildTrainingPlanSchema().optional(),
});

function stripMarkdownCodeFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\r?\n?/, "")
      .replace(/\r?\n?```$/, "")
      .trim();
  }
  return trimmed;
}

/**
 * Anti-Corruption Layer (ACL) Translator
 * Safely parses the raw JSON response from the backend AI service into a strongly typed CoachingAdvice domain object.
 * When `mode === "planning"`, strictly enforces that a non-empty `trainingPlan` was returned.
 */
export function translateCoachingAdviceJson(
  rawJson: string,
  mode: CoachingMode = "execution",
): Result<CoachingAdvice, "invalid-json"> {
  return Result.fromThrowable(
    () => {
      const cleaned = stripMarkdownCodeFences(rawJson);
      const parsed = JSON.parse(cleaned);
      const validated = coachingAdviceValidationSchema.parse(parsed) as CoachingAdvice;
      if (
        mode === "planning" &&
        (!validated.trainingPlan || validated.trainingPlan.sessions.length === 0)
      ) {
        throw new Error("Missing required trainingPlan in planning mode");
      }
      return validated;
    },
    (e) => {
      Sentry.captureException(e, {
        extra: {
          mode,
          rawLength: rawJson.length,
          zodIssues:
            e instanceof z.ZodError
              ? e.issues.map((issue) => `${issue.path.join(".")}:${issue.code}`)
              : undefined,
        },
      });
      return "invalid-json" as const;
    },
  )();
}
