import { errAsync, type ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useAuthStore } from "@/modules/auth/presentation";
import { fetchEntitlement as fetchEntitlementUseCase } from "../../application";
import {
  type BillingError,
  canUseClassify as canUseClassifyRule,
  canUseCoach as canUseCoachRule,
  type Entitlement,
  getRemainingFreeCoachCount,
  isFreeAllowance as isFreeAllowanceRule,
  isInPastDueGrace as isInPastDueGraceRule,
  isNewerOrEqualSnapshot,
} from "../../domain";
import { createBillingGateway, createLocalStorageEntitlementCache } from "../../infrastructure";

export const useBillingStore = defineStore("billing", () => {
  const authStore = useAuthStore();
  const gateway = createBillingGateway();
  const cache = createLocalStorageEntitlementCache();

  if (!authStore.isLoggedIn) {
    cache.clear();
  }

  const entitlement = ref<Entitlement | null>(authStore.isLoggedIn ? cache.load() : null);
  const isFetching = ref(false);
  const lastError = ref<BillingError | null>(null);

  let sessionGeneration = 0;
  let inFlightFetch: ResultAsync<Entitlement, BillingError> | null = null;

  const canUseCoach = computed(() => canUseCoachRule(entitlement.value));
  const canUseClassify = computed(() => canUseClassifyRule(entitlement.value));
  const isFreeAllowance = computed(() => isFreeAllowanceRule(entitlement.value));
  const freeCoachRemaining = computed(() => getRemainingFreeCoachCount(entitlement.value));
  const freeCoachLimit = computed(() => entitlement.value?.freeAllowance.coachLimit ?? 30);
  const isInPastDueGrace = computed(() => isInPastDueGraceRule(entitlement.value));

  function applyEntitlement(incoming: Entitlement): void {
    if (!authStore.isLoggedIn) return;
    if (!isNewerOrEqualSnapshot(incoming, entitlement.value)) {
      return;
    }
    entitlement.value = incoming;
    lastError.value = null;
    cache.save(incoming);
  }

  function clear(): void {
    sessionGeneration++;
    inFlightFetch = null;
    isFetching.value = false;
    entitlement.value = null;
    lastError.value = null;
    cache.clear();
  }

  function fetchEntitlement(): ResultAsync<Entitlement, BillingError> {
    if (!authStore.isLoggedIn) {
      return errAsync("unauthorized");
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return errAsync("billing-unavailable");
    }
    if (inFlightFetch) {
      return inFlightFetch;
    }

    const requestGeneration = sessionGeneration;
    isFetching.value = true;

    const request = authStore
      .ensureValidIdToken()
      .mapErr((): BillingError => "unauthorized")
      .andThen((idToken) =>
        fetchEntitlementUseCase(gateway, idToken).orElse((error) => {
          if (error !== "unauthorized") return errAsync(error);
          return authStore
            .refreshSession(true)
            .mapErr((): BillingError => "unauthorized")
            .andThen((freshToken) =>
              fetchEntitlementUseCase(gateway, authStore.idToken ?? freshToken),
            );
        }),
      )
      .andTee((freshEntitlement) => {
        if (requestGeneration !== sessionGeneration || !authStore.isLoggedIn) return;
        applyEntitlement(freshEntitlement);
        isFetching.value = false;
        inFlightFetch = null;
      })
      .orTee((error) => {
        if (requestGeneration !== sessionGeneration) return;
        lastError.value = error;
        isFetching.value = false;
        inFlightFetch = null;
      });

    inFlightFetch = request;
    return request;
  }

  watch(
    () => authStore.isLoggedIn,
    (loggedIn) => {
      if (!loggedIn) {
        clear();
      }
    },
  );

  return {
    entitlement,
    isFetching,
    lastError,
    canUseCoach,
    canUseClassify,
    isFreeAllowance,
    freeCoachRemaining,
    freeCoachLimit,
    isInPastDueGrace,
    applyEntitlement,
    fetchEntitlement,
    clear,
  };
});
