import { useDebounceFn, useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref, watch, watchEffect } from "vue";
import {
  loadUserProfile,
  migrateFromLocalStorage,
  saveUserProfile,
  type UserProfileForSheet,
} from "@/services/userProfile";
import { useSpreadsheetStore } from "@/stores/spreadsheet";

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
  const apiKey = useLocalStorage<string | null>("userProfile:apiKey", null);
  const isLoading = ref(false);

  const setupCompleted = computed(() => {
    const profile = userProfile.value;
    return !!(
      profile.fitnessGoal?.length ||
      profile.age ||
      profile.heightCm ||
      profile.weightKg ||
      profile.fitnessLevel ||
      profile.workoutDaysPerWeek ||
      profile.workoutLocation ||
      profile.equipmentAccess?.length ||
      profile.freeUserInput
    );
  });

  watchEffect(async () => {
    const spreadsheetStore = useSpreadsheetStore();
    const { doc } = spreadsheetStore;
    if (!doc) return;

    isLoading.value = true;

    await migrateFromLocalStorage(doc);

    const result = await loadUserProfile(doc);
    if (result.isOk() && result.value) {
      userProfile.value = { ...result.value };
    }

    isLoading.value = false;
  });

  const debouncedSave = useDebounceFn(async () => {
    const spreadsheetStore = useSpreadsheetStore();
    const { doc } = spreadsheetStore;
    if (!doc) return;

    const { apiKey: _, ...profileData } = userProfile.value;
    await saveUserProfile(profileData as UserProfileForSheet, doc);
  }, 1500);

  watch(
    userProfile,
    () => {
      void debouncedSave();
    },
    { deep: true },
  );

  return { userProfile, apiKey, isLoading, setupCompleted };
});
