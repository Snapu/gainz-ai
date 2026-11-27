<script setup lang="ts">
import { useRegisterSW } from "virtual:pwa-register/vue";
import { App as CapacitorApp } from "@capacitor/app";
import { ConfigProvider } from "reka-ui";
import { type EffectScope, effectScope, onMounted, onScopeDispose, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useAiOrchestratorStore } from "@/modules/aiCoach/presentation";
import { useAuthErrorHandler, useAuthStore } from "@/modules/auth/presentation";
import {
  capturePendingCheckoutReturnFromUrl,
  capturePendingInviteFromUrl,
  clearPendingCheckoutRoute,
  hasPendingCheckoutReturn,
  resolveInviteErrorMessage,
  useBillingStore,
} from "@/modules/billing/presentation";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import { isPublicRoute } from "@/router/routePolicy";
import UiToaster from "@/shared/presentation/components/ui/UiToaster.vue";
import { useAuthExpirationWatcher } from "@/shared/presentation/composables/useAuthExpirationWatcher";
import { useLegalConsent } from "@/shared/presentation/composables/useLegalConsent";
import { useSheetCacheSync } from "@/shared/presentation/composables/useSheetCacheSync";
import { useToast } from "@/shared/presentation/composables/useToast";
import { t } from "@/shared/presentation/i18n";
import { useLocale } from "@/shared/presentation/i18n/useLocale";

const { bcp47Locale } = useLocale();

const router = useRouter();
const authStore = useAuthStore();
const { handleAuthError } = useAuthErrorHandler();
const { hasLegalConsent } = useLegalConsent();
const { toast } = useToast();

function showPendingInviteToast(
  result: Awaited<ReturnType<ReturnType<typeof useBillingStore>["redeemPendingInviteIfPresent"]>>,
): void {
  if (!result) return;
  if (result.isOk()) {
    toast({
      variant: "default",
      title: t("billing.inviteRedeemSuccessTitle"),
      description: t("billing.inviteRedeemSuccessDesc"),
    });
    return;
  }
  toast({
    variant: "destructive",
    title: t("billing.inviteRedeemErrorTitle"),
    description: resolveInviteErrorMessage(result.error),
  });
}

function showCheckoutSyncToast(outcome: "activated" | "pending" | null): void {
  if (!outcome) return;
  toast({
    variant: "default",
    title:
      outcome === "activated"
        ? t("billing.checkoutSuccessTitle")
        : t("billing.checkoutPendingTitle"),
    description:
      outcome === "activated" ? t("billing.checkoutSuccessDesc") : t("billing.checkoutPendingDesc"),
  });
}

let consentedServicesScope: EffectScope | null = null;
let triggerConsentedBillingSync: (() => void) | null = null;

function startConsentedServices(): void {
  if (consentedServicesScope) return;
  consentedServicesScope = effectScope();
  consentedServicesScope.run(() => {
    useAuthExpirationWatcher();
    useSheetCacheSync();
    let disposed = false;
    let isSyncing = false;
    let pendingResync = false;
    const billingStore = useBillingStore();
    const isScopeActive = () => !disposed && authStore.isLoggedIn;
    const syncPendingInvite = async () => {
      const result = await billingStore.redeemPendingInviteIfPresent();
      if (!isScopeActive() || !result) return false;
      showPendingInviteToast(result);
      return result.isOk() && !hasPendingCheckoutReturn();
    };
    const runSingleBillingSync = async () => {
      if (await syncPendingInvite()) return;
      if (!isScopeActive()) return;
      if (hasPendingCheckoutReturn()) {
        const pollOutcome = await billingStore.pollCheckoutEntitlementIfPending();
        if (isScopeActive()) showCheckoutSyncToast(pollOutcome);
        return;
      }
      await billingStore.fetchEntitlement();
    };
    const syncBillingOnConnect = async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (isSyncing) {
        pendingResync = true;
        return;
      }
      isSyncing = true;
      try {
        do {
          pendingResync = false;
          await runSingleBillingSync();
        } while (pendingResync && !disposed && authStore.isLoggedIn);
      } finally {
        isSyncing = false;
      }
    };
    const triggerSync = () => {
      void syncBillingOnConnect();
    };
    triggerConsentedBillingSync = triggerSync;
    triggerSync();
    if (typeof window !== "undefined") {
      window.addEventListener("online", triggerSync);
    }
    onScopeDispose(() => {
      disposed = true;
      if (triggerConsentedBillingSync === triggerSync) {
        triggerConsentedBillingSync = null;
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", triggerSync);
      }
    });
  });
}

function handleHashChange(): void {
  const capturedInvite = capturePendingInviteFromUrl();
  const capturedCheckout = capturePendingCheckoutReturnFromUrl();
  if (!authStore.isLoggedIn || !hasLegalConsent.value) {
    return;
  }
  if (capturedCheckout) {
    if (router.currentRoute.value.path === "/app/coach") {
      clearPendingCheckoutRoute();
    } else {
      void router.push("/app/coach");
    }
  }
  if (capturedInvite || capturedCheckout) {
    triggerConsentedBillingSync?.();
  }
}

function stopConsentedServices(): void {
  consentedServicesScope?.stop();
  consentedServicesScope = null;
}

watch(
  () => authStore.isLoggedIn && hasLegalConsent.value,
  (canRunServices) => {
    if (canRunServices) {
      startConsentedServices();
    } else {
      stopConsentedServices();
    }
  },
  { immediate: true },
);

let swUpdateInterval: ReturnType<typeof setInterval> | undefined;

const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      // Check for updates every 30 minutes
      swUpdateInterval = setInterval(
        () => {
          registration.update().catch(() => {});
        },
        30 * 60 * 1000,
      );

      // Check for updates when the app comes to foreground (Mobile via Capacitor)
      CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) {
          registration.update().catch(() => {});
        }
      });

      // Check for updates when the browser tab becomes visible again (Web)
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          registration.update().catch(() => {});
        }
      });

      // Check for updates on route changes
      router.afterEach(() => {
        registration.update().catch(() => {});
      });
    }
  },
});

function postToServiceWorker(message: Record<string, unknown>): void {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(message);
  }
}

function handleServiceWorkerMessage(event: MessageEvent) {
  if (!authStore.isLoggedIn || !hasLegalConsent.value) return;

  const type = (event.data as { type?: string } | null)?.type;
  if (type === "BACKGROUND_SYNC_SUCCESS") {
    void useExerciseLogsStore().refresh();
  } else if (type === "BACKGROUND_SYNC_AUTH_REQUIRED") {
    const previousToken = authStore.accessToken;
    void handleAuthError("service-worker-sync").then((recovered) => {
      if (recovered && authStore.accessToken && authStore.accessToken === previousToken) {
        postToServiceWorker({ type: "AUTH_TOKEN_UPDATED", accessToken: authStore.accessToken });
      }
    });
  }
}

onUnmounted(() => {
  stopConsentedServices();
  clearInterval(swUpdateInterval);
  if (typeof window !== "undefined") {
    window.removeEventListener("hashchange", handleHashChange);
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage);
  }
});

watch(
  needRefresh,
  (isNeeded) => {
    if (isNeeded) {
      toast({
        title: t("pwa.updateTitle"),
        description: t("pwa.updateDescription"),
        duration: 100000,
        action: {
          label: t("pwa.reload"),
          onClick: () => updateServiceWorker(true),
        },
      });
    }
  },
  { immediate: true },
);

// Move sync listener from main.ts to App.vue
onMounted(() => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("hashchange", handleHashChange);
  }
});

watch(
  () => [authStore.accessToken, hasLegalConsent.value] as const,
  ([token, consented]) => {
    if (token && consented) {
      postToServiceWorker({ type: "AUTH_TOKEN_UPDATED", accessToken: token });
    }
  },
  { immediate: true },
);

// Keep runtime session-loss handling here; router guards remain the single source
// for normal auth/setup/document routing decisions.
watch(
  () => authStore.isLoggedIn,
  (isLoggedIn) => {
    if (isLoggedIn) return;

    useAiOrchestratorStore().clearPendingRequest();
    useBillingStore().clear();
    postToServiceWorker({ type: "CLEAR_SYNC_QUEUE" });
    const currentPath = router.currentRoute.value.path;
    if (isPublicRoute(currentPath) || currentPath === "/") return;

    void router.push("/").catch(() => {});
  },
  { immediate: false },
);
</script>

<template>
  <ConfigProvider :locale="bcp47Locale" :scroll-body="false">
    <RouterView />
    <UiToaster />
  </ConfigProvider>
</template>
