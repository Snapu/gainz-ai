import { z } from "zod";

import { parseOptionalNumber } from "@/modules/sharedKernel/domain";
import { EquipmentAccessSchema } from "./equipment";

const FitnessGoalSchema = z.enum([
  "build_muscle",
  "lose_fat",
  "improve_endurance",
  "increase_mobility",
  "general_fitness",
]);
export type FitnessGoal = z.infer<typeof FitnessGoalSchema>;

const FitnessLevelSchema = z.enum(["beginner", "intermediate", "advanced"]);
export type FitnessLevel = z.infer<typeof FitnessLevelSchema>;

const WorkoutLocationSchema = z.enum(["gym", "home", "both"]);
export type WorkoutLocation = z.infer<typeof WorkoutLocationSchema>;

const optionalNumberSchema = z.preprocess((val) => parseOptionalNumber(val), z.number().optional());

export function parsePositiveOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  return undefined;
}

const optionalPositiveNumberSchema = z.preprocess(
  parsePositiveOptionalNumber,
  z.number().positive().optional(),
);

const commaSeparatedArraySchema = <T extends z.ZodTypeAny>(enumSchema: T) =>
  z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    if (typeof val === "string") {
      return val
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
    return val;
  }, z.array(enumSchema).optional());

const optionalEnumSchema = <T extends z.ZodTypeAny>(enumSchema: T) =>
  z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    return val;
  }, enumSchema.optional());

export const UserProfileSchema = z.object({
  age: optionalNumberSchema,
  heightCm: optionalNumberSchema,
  weightKg: optionalNumberSchema,
  fitnessGoal: commaSeparatedArraySchema(FitnessGoalSchema),
  fitnessLevel: optionalEnumSchema(FitnessLevelSchema),
  workoutDaysPerWeek: optionalNumberSchema,
  workoutDurationMinutes: optionalPositiveNumberSchema,
  workoutLocation: optionalEnumSchema(WorkoutLocationSchema),
  equipmentAccess: EquipmentAccessSchema,
  freeUserInput: z.preprocess((val) => (val === "" ? undefined : val), z.string().optional()),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
