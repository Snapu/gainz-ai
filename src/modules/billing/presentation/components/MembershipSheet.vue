<script setup lang="ts">
import { computed, watch } from "vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiBottomSheet from "@/shared/presentation/components/ui/UiBottomSheet.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiTelemetryLoader from "@/shared/presentation/components/ui/UiTelemetryLoader.vue";
import { useToast } from "@/shared/presentation/composables/useToast";
import { t } from "@/shared/presentation/i18n";
import { formatMediumDate } from "@/shared/presentation/i18n/formatters";
import { useBillingStore } from "../stores/billingStore";
import InviteCodeForm from "./InviteCodeForm.vue";

const open = defineModel<boolean>("open", { required: true });

const billingStore = useBillingStore();
const { toast } = useToast();

watch(
  open,
  (isOpen) => {
    if (isOpen && !billingStore.entitlement && !billingStore.isFetching) {
      void billingStore.fetchEntitlement();
    }
  },
  { immediate: true },
);

const isLoadingStatus = computed(() => billingStore.isFetching && !billingStore.entitlement);

function formatValidDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? formatMediumDate(date) : null;
}

const statusInfo = computed(() => {
  const entitlement = billingStore.entitlement;
  if (!entitlement) {
    return {
      variant: "secondary" as const,
      label: t("billing.statusUnavailableTitle"),
      detail: t("billing.statusUnavailableDetail"),
    };
  }
  if (billingStore.isInPastDueGrace) {
    const graceDate = formatValidDate(billingStore.subscriptionGraceEndsAt);
    return {
      variant: "warning" as const,
      label: t("billing.statusPastDue"),
      detail: graceDate
        ? t("billing.pastDueDesc", { date: graceDate })
        : t("billing.pastDueFallbackDesc"),
    };
  }
  if (billingStore.isSubscription) {
    const periodEnd = formatValidDate(billingStore.subscriptionPeriodEnd);
    const detail = periodEnd
      ? billingStore.isSubscriptionCancelling
        ? t("billing.cancelsOn", { date: periodEnd })
        : t("billing.renewsOn", { date: periodEnd })
      : t("billing.priceLabel");
    return {
      variant: "default" as const,
      label: t("billing.statusPro"),
      detail,
    };
  }
  if (billingStore.isInviteGrant) {
    const formatted = formatValidDate(billingStore.inviteExpiresAt);
    const detail = formatted
      ? t("billing.inviteExpiresOn", { date: formatted })
      : t("billing.inviteUnlimited");
    return {
      variant: "default" as const,
      label: t("billing.statusTester"),
      detail,
    };
  }
  if (billingStore.isFreeAllowance) {
    return {
      variant: "secondary" as const,
      label: t("billing.statusStarter"),
      detail: t("billing.statusStarterDetail", {
        remaining: billingStore.freeCoachRemaining,
        limit: billingStore.freeCoachLimit,
      }),
    };
  }
  return {
    variant: "secondary" as const,
    label: t("billing.statusFree"),
    detail: t("billing.upgradeSubtitle"),
  };
});

const canRedeemInvite = computed(() => !billingStore.isInviteGrant && !billingStore.isSubscription);

const portalButtonLabel = computed(() => {
  if (billingStore.isOpeningPortal) return t("billing.openingPortal");
  return billingStore.isSubscription
    ? t("billing.manageSubscription")
    : t("billing.viewBillingHistory");
});

function handleOpenPortal(): void {
  void billingStore.openPortal().orTee(() => {
    toast({
      variant: "destructive",
      title: t("billing.portalErrorTitle"),
      description: t("billing.portalErrorDesc"),
    });
  });
}
</script>

<template>
  <UiBottomSheet
    :open="open"
    :title="t('billing.membershipTitle')"
    :subtitle="t('billing.membershipSubtitle')"
    @update:open="(val) => { open = val; }"
  >
    <div class="px-6 pt-4 pb-safe">
      <div class="mb-4 flex flex-col gap-4">
        <div class="rounded-xl bg-white/5 border border-white/5 p-4 flex flex-col gap-2">
          <UiTelemetryLoader v-if="isLoadingStatus" :text="t('billing.statusLoading')" />
          <template v-else>
            <div class="flex items-center justify-between gap-2">
              <span class="text-micro font-bold uppercase tracking-wider text-muted-foreground">
                {{ t("nav.membership") }}
              </span>
              <UiBadge :variant="statusInfo.variant" class="uppercase tracking-wider">
                {{ statusInfo.label }}
              </UiBadge>
            </div>
            <p class="text-sm font-semibold text-foreground">{{ statusInfo.detail }}</p>
            <UiButton
              v-if="billingStore.hasCustomerPortal"
              type="button"
              variant="secondary"
              size="sm"
              class="mt-2 self-start"
              :disabled="billingStore.isOpeningPortal"
              @click="handleOpenPortal"
            >
              {{ portalButtonLabel }}
            </UiButton>
          </template>
        </div>

        <div
          v-show="canRedeemInvite"
          data-testid="membership-invite-section"
          class="rounded-xl bg-white/5 border border-white/5 p-4 flex flex-col gap-3"
        >
          <p class="text-xs font-semibold text-muted-foreground">
            {{ t("billing.inviteToggleLabel") }}
          </p>
          <InviteCodeForm @redeemed="open = false" />
        </div>
      </div>
    </div>
  </UiBottomSheet>
</template>
