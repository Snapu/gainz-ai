import { z } from "zod";

import { parseOptionalNumber } from "@/modules/sharedKernel/domain";

export const FitnessGoalSchema = z.enum([
  "build_muscle",
  "lose_fat",
  "improve_endurance",
  "increase_mobility",
  "general_fitness",
]);
export type FitnessGoal = z.infer<typeof FitnessGoalSchema>;

export const FitnessLevelSchema = z.enum(["beginner", "intermediate", "advanced"]);
export type FitnessLevel = z.infer<typeof FitnessLevelSchema>;

export const WorkoutLocationSchema = z.enum(["gym", "home", "both"]);
export type WorkoutLocation = z.infer<typeof WorkoutLocationSchema>;

export const EquipmentOptionSchema = z.enum([
  "bodyweight",
  "dumbbells",
  "barbell_rack",
  "resistance_bands",
  "kettlebells",
  "pull_up_bar",
  "dip_bar",
  "gymnastic_rings",
  "cable_machine",
  "cardio_machine",
  "suspension_trainer",
  "medicine_ball",
  "bench",
]);
export type EquipmentOption = z.infer<typeof EquipmentOptionSchema>;

const optionalNumberSchema = z.preprocess((val) => parseOptionalNumber(val), z.number().optional());

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
  workoutLocation: optionalEnumSchema(WorkoutLocationSchema),
  equipmentAccess: commaSeparatedArraySchema(EquipmentOptionSchema),
  freeUserInput: z.preprocess((val) => (val === "" ? undefined : val), z.string().optional()),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
export type UserProfileWithApiKey = UserProfile & { apiKey?: string };
