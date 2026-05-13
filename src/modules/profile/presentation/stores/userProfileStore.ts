import { useDebounceFn, useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useSpreadsheetRepositoryFactory } from "@/modules/platform/presentation";
import {
  loadUserProfile,
  migrateFromLocalStorage,
  saveUserProfile,
} from "@/modules/profile/application";
import type {
  EquipmentOption,
  FitnessGoal,
  FitnessLevel,
  UserProfile,
  UserProfileWithApiKey,
  WorkoutLocation,
} from "@/modules/profile/domain";
import { createUserProfileRepository } from "@/modules/profile/infrastructure";
import { useAuthErrorHandler } from "@/shared/presentation/composables/useAuthErrorHandler";

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

  const { createRepository, getDoc } = useSpreadsheetRepositoryFactory(createUserProfileRepository);
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

  watch(
    () => getDoc(),
    (doc, _previousDoc, onCleanup) => {
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });

      void (async () => {
        if (!doc) {
          isLoading.value = false;
          return;
        }

        isLoading.value = true;

        const repository = createRepository(doc);
        if (!repository) {
          isLoading.value = false;
          return;
        }

        await migrateFromLocalStorage(repository);
        if (cancelled) return;

        const result = await loadUserProfile(repository);
        if (cancelled) return;

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
      })();
    },
    { immediate: true },
  );

  const debouncedSave = useDebounceFn(async () => {
    const repository = createRepository();
    if (!repository) return;

    const result = await saveUserProfile(userProfile.value, repository);
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
