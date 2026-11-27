<script setup lang="ts">
import { computed, ref } from "vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiInput from "@/shared/presentation/components/ui/UiInput.vue";
import { useToast } from "@/shared/presentation/composables/useToast";
import { t } from "@/shared/presentation/i18n";
import { normalizeInviteCode } from "../../domain";
import { resolveInviteErrorMessage } from "../inviteErrorMessage";
import { useBillingStore } from "../stores/billingStore";

const emit = defineEmits<{
  redeemed: [];
}>();

const billingStore = useBillingStore();
const { toast } = useToast();

const rawCode = ref("");
const errorMessage = ref("");
const normalizedCode = computed(() => normalizeInviteCode(rawCode.value));

async function handleSubmit(): Promise<void> {
  if (!normalizedCode.value || billingStore.isRedeemingInvite) return;
  errorMessage.value = "";
  const result = await billingStore.redeemInvite(normalizedCode.value);
  if (result.isOk()) {
    rawCode.value = "";
    toast({
      variant: "default",
      title: t("billing.inviteRedeemSuccessTitle"),
      description: t("billing.inviteRedeemSuccessDesc"),
    });
    emit("redeemed");
    return;
  }
  errorMessage.value = resolveInviteErrorMessage(result.error);
}
</script>

<template>
  <form class="flex flex-col sm:flex-row items-stretch sm:items-start gap-2" @submit.prevent="void handleSubmit()">
    <UiInput
      v-model="rawCode"
      type="text"
      maxlength="64"
      autocomplete="off"
      autocapitalize="characters"
      spellcheck="false"
      :disabled="billingStore.isRedeemingInvite"
      :placeholder="t('billing.invitePlaceholder')"
      :aria-label="t('billing.invitePlaceholder')"
      :aria-invalid="Boolean(errorMessage)"
      :error="errorMessage || undefined"
      class="h-10 uppercase tracking-wide text-sm"
      @input="errorMessage = ''"
    />
    <UiButton
      type="submit"
      variant="secondary"
      size="sm"
      :disabled="billingStore.isRedeemingInvite || !normalizedCode"
      class="h-10 shrink-0 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed"
    >
      {{ billingStore.isRedeemingInvite ? t("billing.inviteRedeemingButton") : t("billing.inviteRedeemButton") }}
    </UiButton>
  </form>
</template>
