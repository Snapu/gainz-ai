<script setup lang="ts">
import { computed, watch } from "vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiBottomSheet from "@/shared/presentation/components/ui/UiBottomSheet.vue";
import UiTelemetryLoader from "@/shared/presentation/components/ui/UiTelemetryLoader.vue";
import { t } from "@/shared/presentation/i18n";
import { formatMediumDate } from "@/shared/presentation/i18n/formatters";
import { useBillingStore } from "../stores/billingStore";
import InviteCodeForm from "./InviteCodeForm.vue";

const open = defineModel<boolean>("open", { required: true });

const billingStore = useBillingStore();

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

const statusInfo = computed(() => {
  const entitlement = billingStore.entitlement;
  if (!entitlement) {
    return {
      variant: "secondary" as const,
      label: t("billing.statusUnavailableTitle"),
      detail: t("billing.statusUnavailableDetail"),
    };
  }
  if (entitlement.source === "subscription") {
    return {
      variant: "default" as const,
      label: t("billing.statusPro"),
      detail: t("billing.priceLabel"),
    };
  }
  if (billingStore.isInviteGrant) {
    const expiry = billingStore.inviteExpiresAt ? new Date(billingStore.inviteExpiresAt) : null;
    const detail =
      expiry && Number.isFinite(expiry.getTime())
        ? t("billing.inviteExpiresOn", { date: formatMediumDate(expiry) })
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

const canRedeemInvite = computed(
  () => !billingStore.isInviteGrant && billingStore.entitlement?.source !== "subscription",
);
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
