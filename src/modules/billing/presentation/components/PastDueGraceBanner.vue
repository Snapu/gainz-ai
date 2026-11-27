<script setup lang="ts">
import { AlertTriangle, ArrowRight } from "@lucide/vue";
import { computed } from "vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import { useToast } from "@/shared/presentation/composables/useToast";
import { t } from "@/shared/presentation/i18n";
import { formatMediumDate } from "@/shared/presentation/i18n/formatters";
import { useBillingStore } from "../stores/billingStore";

const billingStore = useBillingStore();
const { toast } = useToast();

const graceDeadlineText = computed(() => {
  const raw = billingStore.subscriptionGraceEndsAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? formatMediumDate(date) : null;
});

function handleUpdatePaymentMethod(): void {
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
  <div
    data-testid="past-due-grace-banner"
    class="rounded-xl p-4 bg-orange-500/10 border border-orange-500/20 text-orange-400 flex flex-col gap-3"
  >
    <div class="flex items-start gap-3">
      <AlertTriangle class="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      <div class="flex flex-col gap-1 min-w-0">
        <p class="text-sm font-bold leading-snug">{{ t("billing.pastDueTitle") }}</p>
        <p class="text-xs font-medium leading-relaxed text-orange-400/90">
          {{
            graceDeadlineText
              ? t("billing.pastDueDesc", { date: graceDeadlineText })
              : t("billing.pastDueFallbackDesc")
          }}
        </p>
      </div>
    </div>

    <UiButton
      type="button"
      variant="secondary"
      size="sm"
      class="self-start text-orange-400 border-orange-500/20 bg-orange-500/10 hover:bg-white/10"
      :disabled="billingStore.isOpeningPortal"
      @click="handleUpdatePaymentMethod"
    >
      <span>
        {{ billingStore.isOpeningPortal ? t("billing.openingPortal") : t("billing.pastDueAction") }}
      </span>
      <ArrowRight class="w-3.5 h-3.5 ml-1.5" aria-hidden="true" />
    </UiButton>
  </div>
</template>
