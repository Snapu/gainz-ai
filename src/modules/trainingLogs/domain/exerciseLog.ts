import { z } from "zod";
import { cleanExerciseName, parseOptionalNumber } from "@/modules/sharedKernel/domain";

const ExerciseNameSchema = z.string().overwrite(cleanExerciseName);

const optionalNumberSchema = z.preprocess((val) => {
  // Spreadsheet locale is set to en_US, so values use period as decimal separator
  return parseOptionalNumber(val);
}, z.number().optional());

/**
 * Canonical schema for an exercise log entry.
 * Encapsulates domain rules: names are trimmed/normalized, numbers are optional,
 * dates are coerced to Date objects.
 */
export const ExerciseLogSchema = z.object({
  id: z.uuid(),
  exerciseName: ExerciseNameSchema,
  reps: optionalNumberSchema,
  weight: optionalNumberSchema,
  distance: optionalNumberSchema,
  duration: optionalNumberSchema,
  rpe: optionalNumberSchema,
  loggedAt: z.coerce.date(),
});

export type ExerciseLog = z.infer<typeof ExerciseLogSchema>;
