/**
 * User profile types - shared between store and service
 * Extracted to avoid circular dependency between
 * src/stores/userProfile.ts and src/services/userProfile.ts
 */

export type FitnessGoal =
  | "build_muscle"
  | "lose_fat"
  | "improve_endurance"
  | "increase_mobility"
  | "general_fitness";

export type FitnessLevel = "beginner" | "intermediate" | "advanced";

export type WorkoutLocation = "gym" | "home" | "both";

export type EquipmentOption =
  | "bodyweight"
  | "dumbbells"
  | "barbell_rack"
  | "resistance_bands"
  | "kettlebells"
  | "pull_up_bar"
  | "dip_bar"
  | "gymnastic_rings"
  | "cable_machine"
  | "cardio_machine"
  | "suspension_trainer"
  | "medicine_ball"
  | "bench";

export type UserProfile = {
  age?: number;
  heightCm?: number;
  weightKg?: number;
  fitnessGoal?: FitnessGoal[];
  fitnessLevel?: FitnessLevel;
  workoutDaysPerWeek?: number;
  workoutLocation?: WorkoutLocation;
  equipmentAccess?: EquipmentOption[];
  freeUserInput?: string;
};

export type UserProfileWithApiKey = UserProfile & { apiKey?: string };

/**
 * Type: UserProfile without apiKey (for spreadsheet storage)
 */
export type UserProfileForSheet = Omit<UserProfile, "apiKey">;
