import { useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";

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
  apiKey?: string;
};

export const useUserProfileStore = defineStore("userProfile", () => {
  const userProfile = useLocalStorage("userProfile", {} as UserProfile);
  const setupCompleted = useLocalStorage("setupCompleted", false);

  function saveUserProfile(value: UserProfile) {
    if (Object.keys(value).length === 0) return;
    console.debug("save user profile", value);
    userProfile.value = value;
    setupCompleted.value = true;
  }

  return { userProfile, setupCompleted, saveUserProfile };
});
