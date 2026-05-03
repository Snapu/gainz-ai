import { useDebounceFn, useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref, watch, watchEffect } from "vue";
import { useAuthErrorHandler } from "@/composables/useAuthErrorHandler";
import {
  type EquipmentOption,
  type FitnessGoal,
  type FitnessLevel,
  loadUserProfile,
  migrateFromLocalStorage,
  saveUserProfile,
  type UserProfile,
  type UserProfileWithApiKey,
  type WorkoutLocation,
} from "@/services/userProfile";
import { useSpreadsheetStore } from "@/stores/spreadsheet";

export type {
  EquipmentOption,
  FitnessGoal,
  FitnessLevel,
  UserProfile,
  UserProfileWithApiKey,
  WorkoutLocation,
};

export const useUserProfileStore = defineStore("userProfile", () => {
  const userProfile = ref<UserProfile>({});
  const hasCompletedSetup = useLocalStorage<boolean>("hasCompletedSetup", false);
  const apiKey = useLocalStorage<string | null>("userProfile:apiKey", null);
  const isLoading = ref(true);

  const { handleAuthError } = useAuthErrorHandler();

  const setupCompleted = computed(() => hasCompletedSetup.value);

  function profileHasData(profile: UserProfile): boolean {
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
  }

  watchEffect(async () => {
    const spreadsheetStore = useSpreadsheetStore();
    const { doc } = spreadsheetStore;
    if (!doc) {
      isLoading.value = false;
      return;
    }

    isLoading.value = true;

    await migrateFromLocalStorage(doc);

    const result = await loadUserProfile(doc);
    if (result.isErr() && result.error === "auth-failed") {
      handleAuthError("user-profile-load");
      isLoading.value = false;
      return;
    }
    if (result.isOk() && result.value) {
      userProfile.value = { ...result.value };
      if (profileHasData(result.value)) {
        hasCompletedSetup.value = true;
      }
    }

    isLoading.value = false;
  });

  const debouncedSave = useDebounceFn(async () => {
    const spreadsheetStore = useSpreadsheetStore();
    const { doc } = spreadsheetStore;
    if (!doc) return;

    const result = await saveUserProfile(userProfile.value, doc);
    if (result.isErr() && result.error === "auth-failed") {
      handleAuthError("user-profile-save");
      return;
    }
    if (result.isOk()) {
      hasCompletedSetup.value = true;
    }
  }, 1500);

  watch(
    userProfile,
    (newProfile) => {
      if ("apiKey" in newProfile) {
        const { apiKey: _, ...cleanProfile } = newProfile as UserProfileWithApiKey;
        userProfile.value = cleanProfile;
      } else {
        void debouncedSave();
      }
    },
    { deep: true },
  );

  function updateProfile(partial: Partial<UserProfileWithApiKey>): void {
    const { apiKey: newApiKey, ...profileFields } = partial;
    if (newApiKey !== undefined) {
      apiKey.value = newApiKey;
    }
    userProfile.value = { ...userProfile.value, ...profileFields };
  }

  return {
    userProfile,
    hasCompletedSetup,
    apiKey,
    isLoading,
    setupCompleted,
    updateProfile,
  };
});
