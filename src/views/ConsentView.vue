<script setup lang="ts">
import { ShieldCheck } from "@lucide/vue";
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/modules/auth/presentation";
import LegalConsentCheckbox from "@/shared/presentation/components/LegalConsentCheckbox.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import { useLegalConsent } from "@/shared/presentation/composables/useLegalConsent";
import { t } from "@/shared/presentation/i18n";

const router = useRouter();
const authStore = useAuthStore();
const { acceptLegalConsent, revokeLegalConsent } = useLegalConsent();

const hasAccepted = ref(false);

function handleAccept(): void {
  if (!hasAccepted.value) return;
  acceptLegalConsent();
  void router.push("/loading");
}

function handleSignOut(): void {
  revokeLegalConsent();
  authStore.logout();
  void router.push("/");
}
</script>

<template>
  <main class="h-full w-full overflow-y-auto overscroll-y-contain bg-background pt-safe pb-safe px-6 flex">
    <div class="w-full max-w-md m-auto py-6">
      <UiCard class="w-full p-5 space-y-5">
        <div class="flex flex-col items-center text-center gap-3">
          <div
            class="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary"
          >
            <ShieldCheck class="w-6 h-6" />
          </div>
          <div class="space-y-1">
            <h1 class="text-xl font-black tracking-tight text-foreground">
              {{ t("legal.consent.gateTitle") }}
            </h1>
            <p class="text-xs font-medium text-muted-foreground leading-relaxed">
              {{ t("legal.consent.gateSubtitle") }}
            </p>
          </div>
        </div>

        <LegalConsentCheckbox id="gate-legal-consent" v-model="hasAccepted" />

        <div class="flex flex-col gap-2">
          <UiButton
            class="w-full h-12 rounded-xl"
            :disabled="!hasAccepted"
            @click="handleAccept"
          >
            {{ t("legal.consent.acceptAndContinue") }}
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            class="w-full text-muted-foreground"
            @click="handleSignOut"
          >
            {{ t("legal.consent.signOut") }}
          </UiButton>
        </div>
      </UiCard>
    </div>
  </main>
</template>
