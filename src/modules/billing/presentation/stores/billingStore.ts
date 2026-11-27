import { err, errAsync, ok, type Result, type ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useAuthStore } from "@/modules/auth/presentation";
import {
  fetchEntitlement as fetchEntitlementUseCase,
  openCustomerPortal as openCustomerPortalUseCase,
  redeemInviteCode as redeemInviteCodeUseCase,
  startSubscriptionCheckout as startSubscriptionCheckoutUseCase,
} from "../../application";
import {
  type BillingError,
  canUseClassify as canUseClassifyRule,
  canUseCoach as canUseCoachRule,
  type Entitlement,
  getRemainingFreeCoachCount,
  hasCustomerPortalAccess,
  isFreeAllowance as isFreeAllowanceRule,
  isInPastDueGrace as isInPastDueGraceRule,
  isInviteGrant as isInviteGrantRule,
  isNewerOrEqualSnapshot,
  isSubscriptionActive,
  isSubscriptionCancelling as isSubscriptionCancellingRule,
  normalizeInviteCode,
} from "../../domain";
import {
  capturePendingCheckoutReturnFromUrl,
  capturePendingInviteFromUrl,
  clearPendingCheckoutPoll,
  clearPendingCheckoutReturn,
  clearPendingCheckoutRoute,
  clearPendingInviteCode,
  createBillingGateway,
  createLocalStorageEntitlementCache,
  hasPendingCheckoutReturn,
  hasPendingCheckoutRoute,
  navigateToTrustedBillingUrl,
  peekPendingInviteCode,
} from "../../infrastructure";

export {
  capturePendingCheckoutReturnFromUrl,
  capturePendingInviteFromUrl,
  clearPendingCheckoutReturn,
  clearPendingCheckoutRoute,
  clearPendingInviteCode,
  hasPendingCheckoutReturn,
  hasPendingCheckoutRoute,
};

export type CheckoutPollOutcome = "activated" | "pending";
const DEFAULT_CHECKOUT_POLL_DELAYS_MS = [0, 1000, 1500, 2000, 2500, 3000];

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
  const isRedirectingToCheckout = ref(false);
  const isOpeningPortal = ref(false);
  const isPollingCheckout = ref(false);
  const lastError = ref<BillingError | null>(null);

  let sessionGeneration = 0;
  let fetchEpoch = 0;
  let inFlightFetch: ResultAsync<Entitlement, BillingError> | null = null;
  let inFlightPendingRedeem: Promise<Result<Entitlement, BillingError> | null> | null = null;
  let inFlightCheckoutPoll: Promise<CheckoutPollOutcome | null> | null = null;

  const canUseCoach = computed(() => canUseCoachRule(entitlement.value));
  const canUseClassify = computed(() => canUseClassifyRule(entitlement.value));
  const isFreeAllowance = computed(() => isFreeAllowanceRule(entitlement.value));
  const isInviteGrant = computed(() => isInviteGrantRule(entitlement.value));
  const inviteExpiresAt = computed(() => entitlement.value?.inviteGrant?.expiresAt ?? null);
  const freeCoachRemaining = computed(() => getRemainingFreeCoachCount(entitlement.value));
  const freeCoachLimit = computed(() => entitlement.value?.freeAllowance.coachLimit ?? 30);
  const isSubscription = computed(() => isSubscriptionActive(entitlement.value));
  const isSubscriptionCancelling = computed(() => isSubscriptionCancellingRule(entitlement.value));
  const subscriptionPeriodEnd = computed(
    () => entitlement.value?.subscription?.currentPeriodEnd ?? null,
  );
  const subscriptionGraceEndsAt = computed(
    () => entitlement.value?.subscription?.graceEndsAt ?? null,
  );
  const hasCustomerPortal = computed(() => hasCustomerPortalAccess(entitlement.value));
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
    inFlightCheckoutPoll = null;
    isFetching.value = false;
    isRedeemingInvite.value = false;
    isRedirectingToCheckout.value = false;
    isOpeningPortal.value = false;
    isPollingCheckout.value = false;
    entitlement.value = null;
    lastError.value = null;
    cache.clear();
  }

  function callWithAuthRetry<T>(
    execute: (accessToken: string) => ResultAsync<T, BillingError>,
  ): ResultAsync<T, BillingError> {
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

  function startCheckout(
    navigate: (url: string) => boolean = navigateToTrustedBillingUrl,
  ): ResultAsync<void, BillingError> {
    if (!authStore.isLoggedIn) {
      return errAsync("unauthorized");
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      lastError.value = "billing-unavailable";
      return errAsync("billing-unavailable");
    }

    const requestGeneration = sessionGeneration;
    isRedirectingToCheckout.value = true;
    lastError.value = null;

    return callWithAuthRetry((token) => startSubscriptionCheckoutUseCase(gateway, token))
      .andThen(({ checkoutUrl }) => {
        if (requestGeneration !== sessionGeneration || !authStore.isLoggedIn) {
          return ok(undefined);
        }
        isRedirectingToCheckout.value = false;
        if (!navigate(checkoutUrl)) {
          lastError.value = "billing-unavailable";
          return err("billing-unavailable" as const);
        }
        return ok(undefined);
      })
      .orTee((error) => {
        if (requestGeneration !== sessionGeneration) return;
        lastError.value = error;
        isRedirectingToCheckout.value = false;
      });
  }

  function openPortal(
    navigate: (url: string) => boolean = navigateToTrustedBillingUrl,
  ): ResultAsync<void, BillingError> {
    if (!authStore.isLoggedIn) {
      return errAsync("unauthorized");
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      lastError.value = "billing-unavailable";
      return errAsync("billing-unavailable");
    }

    const requestGeneration = sessionGeneration;
    isOpeningPortal.value = true;
    lastError.value = null;

    return callWithAuthRetry((token) => openCustomerPortalUseCase(gateway, token))
      .andThen(({ portalUrl }) => {
        if (requestGeneration !== sessionGeneration || !authStore.isLoggedIn) {
          return ok(undefined);
        }
        isOpeningPortal.value = false;
        if (!navigate(portalUrl)) {
          lastError.value = "billing-unavailable";
          return err("billing-unavailable" as const);
        }
        return ok(undefined);
      })
      .orTee((error) => {
        if (requestGeneration !== sessionGeneration) return;
        lastError.value = error;
        isOpeningPortal.value = false;
      });
  }

  async function pollCheckoutEntitlementIfPending(options?: {
    delaysMs?: number[];
  }): Promise<CheckoutPollOutcome | null> {
    if (!hasPendingCheckoutReturn() || !authStore.isLoggedIn) {
      return null;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return null;
    }
    if (inFlightCheckoutPoll) {
      return inFlightCheckoutPoll;
    }

    const requestGeneration = sessionGeneration;
    const delays = options?.delaysMs ?? DEFAULT_CHECKOUT_POLL_DELAYS_MS;
    const run = (async (): Promise<CheckoutPollOutcome | null> => {
      isPollingCheckout.value = true;
      try {
        for (const delay of delays) {
          if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
          if (
            requestGeneration !== sessionGeneration ||
            !authStore.isLoggedIn ||
            !hasPendingCheckoutReturn()
          ) {
            return null;
          }
          if (typeof navigator !== "undefined" && navigator.onLine === false) {
            return null;
          }

          const res = await fetchEntitlement();
          if (requestGeneration !== sessionGeneration || !authStore.isLoggedIn) {
            return null;
          }
          if (res.isOk() && res.value.source === "subscription") {
            clearPendingCheckoutPoll();
            return "activated";
          }
        }
        clearPendingCheckoutPoll();
        return "pending";
      } finally {
        if (requestGeneration === sessionGeneration) {
          isPollingCheckout.value = false;
        }
      }
    })();

    inFlightCheckoutPoll = run;
    try {
      return await run;
    } finally {
      if (inFlightCheckoutPoll === run) {
        inFlightCheckoutPoll = null;
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
          clearPendingCheckoutReturn();
        }
      }
    },
  );

  return {
    entitlement,
    isFetching,
    isRedeemingInvite,
    isRedirectingToCheckout,
    isOpeningPortal,
    isPollingCheckout,
    lastError,
    canUseCoach,
    canUseClassify,
    isFreeAllowance,
    isInviteGrant,
    inviteExpiresAt,
    freeCoachRemaining,
    freeCoachLimit,
    isSubscription,
    isSubscriptionCancelling,
    subscriptionPeriodEnd,
    subscriptionGraceEndsAt,
    hasCustomerPortal,
    isInPastDueGrace,
    applyEntitlement,
    fetchEntitlement,
    redeemInvite,
    redeemPendingInviteIfPresent,
    startCheckout,
    openPortal,
    pollCheckoutEntitlementIfPending,
    clear,
  };
});
