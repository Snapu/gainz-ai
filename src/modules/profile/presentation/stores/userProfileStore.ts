import { useDebounceFn, useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { retryOnAuthError, useAuthStore } from "@/modules/auth/presentation";
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
  WorkoutLocation,
} from "@/modules/profile/domain";
import { createUserProfileRepository, purgeLegacyApiKeys } from "@/modules/profile/infrastructure";

export type { EquipmentOption, FitnessGoal, FitnessLevel, UserProfile, WorkoutLocation };
export { purgeLegacyApiKeys };

export const useUserProfileStore = defineStore("userProfile", () => {
  const userProfile = ref<UserProfile>({});
  const hasCompletedSetup = useLocalStorage<boolean>("hasCompletedSetup", false, {
    flush: "sync",
  });
  const isLoading = ref(true);

  const authStore = useAuthStore();
  const { createRepository, getDoc } = useSpreadsheetRepositoryFactory(createUserProfileRepository);
  let isHydrating = false;

  const setupCompleted = computed<boolean>(() => hasCompletedSetup.value);

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

  function setHydratedProfile(nextProfile: UserProfile): void {
    isHydrating = true;
    userProfile.value = nextProfile;
    isHydrating = false;
  }

  async function hydrateProfileForDoc(
    doc: NonNullable<ReturnType<typeof getDoc>>,
    isCancelled: () => boolean,
  ): Promise<void> {
    isLoading.value = true;

    const repository = createRepository(doc);
    if (!repository) {
      isLoading.value = false;
      return;
    }

    await retryOnAuthError("user-profile-migration", () => migrateFromLocalStorage(repository), {
      fallbackError: "migration-failed",
      isCancelled,
    });
    if (isCancelled()) return;

    const result = await retryOnAuthError("user-profile-load", () => loadUserProfile(repository), {
      fallbackError: "load-failed",
      isCancelled,
    });
    if (isCancelled()) return;

    if (result.isOk() && result.value) {
      setHydratedProfile({ ...result.value });
      if (profileHasData(result.value)) {
        hasCompletedSetup.value = true;
      }
    }

    isLoading.value = false;
  }

  watch(
    () => getDoc(),
    (doc, _previousDoc, onCleanup) => {
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });

      if (!doc) {
        setHydratedProfile({});
        isLoading.value = false;
        return;
      }

      void hydrateProfileForDoc(doc, () => cancelled);
    },
    { immediate: true },
  );

  watch(
    () => authStore.isLoggedIn,
    (loggedIn, previousLoggedIn) => {
      if (!loggedIn && previousLoggedIn) {
        hasCompletedSetup.value = false;
      }
    },
    { flush: "sync" },
  );

  void authStore.init().then(() => {
    if (!authStore.isLoggedIn && !getDoc()) {
      hasCompletedSetup.value = false;
    }
  });

  const debouncedSave = useDebounceFn(async () => {
    const repository = createRepository();
    if (!repository) return;

    await retryOnAuthError(
      "user-profile-save",
      () => saveUserProfile(userProfile.value, repository),
      { fallbackError: "save-failed" },
    );
  }, 1500);

  watch(
    userProfile,
    () => {
      if (isHydrating) return;
      void debouncedSave();
    },
    { deep: true, flush: "sync" },
  );

  function updateProfile(partial: Partial<UserProfile>): void {
    userProfile.value = { ...userProfile.value, ...partial };
  }

  return {
    userProfile,
    hasCompletedSetup,
    isLoading,
    setupCompleted,
    updateProfile,
  };
});
