import { errAsync, type Result, type ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useAuthStore } from "@/modules/auth/presentation";
import {
  fetchEntitlement as fetchEntitlementUseCase,
  redeemInviteCode as redeemInviteCodeUseCase,
} from "../../application";
import {
  type BillingError,
  canUseClassify as canUseClassifyRule,
  canUseCoach as canUseCoachRule,
  type Entitlement,
  getRemainingFreeCoachCount,
  isFreeAllowance as isFreeAllowanceRule,
  isInPastDueGrace as isInPastDueGraceRule,
  isInviteGrant as isInviteGrantRule,
  isNewerOrEqualSnapshot,
  normalizeInviteCode,
} from "../../domain";
import {
  capturePendingInviteFromUrl,
  clearPendingInviteCode,
  createBillingGateway,
  createLocalStorageEntitlementCache,
  peekPendingInviteCode,
} from "../../infrastructure";

export { capturePendingInviteFromUrl, clearPendingInviteCode };

const TRANSIENT_PENDING_INVITE_ERRORS = new Set<BillingError>([
  "unauthorized",
  "billing-unavailable",
  "rate-limit-exceeded",
]);

export const useBillingStore = defineStore("billing", () => {
  const authStore = useAuthStore();
  const gateway = createBillingGateway();
  const cache = createLocalStorageEntitlementCache();

  if (!authStore.isLoggedIn) {
    cache.clear();
  }

  const entitlement = ref<Entitlement | null>(authStore.isLoggedIn ? cache.load() : null);
  const isFetching = ref(false);
  const isRedeemingInvite = ref(false);
  const lastError = ref<BillingError | null>(null);

  let sessionGeneration = 0;
  let fetchEpoch = 0;
  let inFlightFetch: ResultAsync<Entitlement, BillingError> | null = null;
  let inFlightPendingRedeem: Promise<Result<Entitlement, BillingError> | null> | null = null;

  const canUseCoach = computed(() => canUseCoachRule(entitlement.value));
  const canUseClassify = computed(() => canUseClassifyRule(entitlement.value));
  const isFreeAllowance = computed(() => isFreeAllowanceRule(entitlement.value));
  const isInviteGrant = computed(() => isInviteGrantRule(entitlement.value));
  const inviteExpiresAt = computed(() => entitlement.value?.inviteGrant?.expiresAt ?? null);
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
    fetchEpoch++;
    inFlightFetch = null;
    inFlightPendingRedeem = null;
    isFetching.value = false;
    isRedeemingInvite.value = false;
    entitlement.value = null;
    lastError.value = null;
    cache.clear();
  }

  function callWithAuthRetry(
    execute: (accessToken: string) => ResultAsync<Entitlement, BillingError>,
  ): ResultAsync<Entitlement, BillingError> {
    return authStore
      .ensureValidIdToken()
      .mapErr((): BillingError => "unauthorized")
      .andThen((idToken) =>
        execute(idToken).orElse((error) => {
          if (error !== "unauthorized") return errAsync(error);
          return authStore
            .refreshSession(true)
            .mapErr((): BillingError => "unauthorized")
            .andThen((freshToken) => execute(authStore.idToken ?? freshToken));
        }),
      );
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
    const requestFetchEpoch = fetchEpoch;
    isFetching.value = true;

    const request = callWithAuthRetry((token) => fetchEntitlementUseCase(gateway, token))
      .andTee((freshEntitlement) => {
        if (requestGeneration !== sessionGeneration || !authStore.isLoggedIn) return;
        if (requestFetchEpoch === fetchEpoch) {
          applyEntitlement(freshEntitlement);
          isFetching.value = false;
          inFlightFetch = null;
        }
      })
      .orTee((error) => {
        if (requestGeneration !== sessionGeneration) return;
        if (requestFetchEpoch === fetchEpoch) {
          lastError.value = error;
          isFetching.value = false;
          inFlightFetch = null;
        }
      });

    inFlightFetch = request;
    return request;
  }

  function redeemInvite(rawCode: string): ResultAsync<Entitlement, BillingError> {
    const normalizedCode = normalizeInviteCode(rawCode);
    if (!normalizedCode) {
      lastError.value = "invite-invalid";
      return errAsync("invite-invalid");
    }
    if (!authStore.isLoggedIn) {
      return errAsync("unauthorized");
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      lastError.value = "billing-unavailable";
      return errAsync("billing-unavailable");
    }

    const requestGeneration = sessionGeneration;
    isRedeemingInvite.value = true;
    lastError.value = null;

    return callWithAuthRetry((token) => redeemInviteCodeUseCase(gateway, token, normalizedCode))
      .andTee((freshEntitlement) => {
        if (requestGeneration !== sessionGeneration || !authStore.isLoggedIn) return;
        fetchEpoch++;
        inFlightFetch = null;
        isFetching.value = false;
        applyEntitlement(freshEntitlement);
        isRedeemingInvite.value = false;
      })
      .orTee((error) => {
        if (requestGeneration !== sessionGeneration) return;
        lastError.value = error;
        isRedeemingInvite.value = false;
      });
  }

  async function redeemPendingInviteIfPresent(): Promise<Result<Entitlement, BillingError> | null> {
    const pendingCode = peekPendingInviteCode();
    if (!pendingCode || !authStore.isLoggedIn) {
      return null;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return null;
    }
    if (inFlightPendingRedeem) {
      return inFlightPendingRedeem;
    }

    const requestGeneration = sessionGeneration;
    const run = (async (): Promise<Result<Entitlement, BillingError> | null> => {
      const result = await redeemInvite(pendingCode);
      if (requestGeneration !== sessionGeneration || !authStore.isLoggedIn) {
        return null;
      }
      if (result.isOk() || !TRANSIENT_PENDING_INVITE_ERRORS.has(result.error)) {
        if (peekPendingInviteCode() === pendingCode) {
          clearPendingInviteCode();
        }
      }
      return result;
    })();

    inFlightPendingRedeem = run;
    try {
      return await run;
    } finally {
      if (inFlightPendingRedeem === run) {
        inFlightPendingRedeem = null;
      }
    }
  }

  watch(
    () => authStore.isLoggedIn,
    (loggedIn, wasLoggedIn) => {
      if (!loggedIn) {
        clear();
        if (wasLoggedIn) {
          clearPendingInviteCode();
        }
      }
    },
  );

  return {
    entitlement,
    isFetching,
    isRedeemingInvite,
    lastError,
    canUseCoach,
    canUseClassify,
    isFreeAllowance,
    isInviteGrant,
    inviteExpiresAt,
    freeCoachRemaining,
    freeCoachLimit,
    isInPastDueGrace,
    applyEntitlement,
    fetchEntitlement,
    redeemInvite,
    redeemPendingInviteIfPresent,
    clear,
  };
});
