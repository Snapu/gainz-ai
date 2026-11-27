<script setup lang="ts">
import {
  Bed,
  Check,
  ChevronRight,
  CloudOff,
  ExternalLink,
  FolderOpen,
  History,
  LogOut,
  Menu,
  Trash2,
} from "@lucide/vue";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { MembershipSheet, useBillingStore } from "@/modules/billing/presentation";
import { useSpreadsheetStore } from "@/modules/platform/presentation";
import { WIZARD_STEPS } from "@/modules/profile/presentation";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import DeleteAccountSheet from "@/shared/presentation/components/DeleteAccountSheet.vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiDropdownMenu from "@/shared/presentation/components/ui/UiDropdownMenu.vue";
import UiDropdownMenuItem from "@/shared/presentation/components/ui/UiDropdownMenuItem.vue";
import { useAccountActions } from "@/shared/presentation/composables/useAccountActions";
import { useToast } from "@/shared/presentation/composables/useToast";
import { t } from "@/shared/presentation/i18n";
import { formatMediumDate } from "@/shared/presentation/i18n/formatters";
import { useLocale } from "@/shared/presentation/i18n/useLocale";

const router = useRouter();
const billingStore = useBillingStore();
const spreadsheetStore = useSpreadsheetStore();
const logsStore = useExerciseLogsStore();
const { toast } = useToast();
const { locale, setLocale } = useLocale();
const { signOut } = useAccountActions();
const isDeleteDialogOpen = ref(false);
const isMembershipSheetOpen = ref(false);

const membershipStatusBadge = computed(() => {
  if (billingStore.isInPastDueGrace) {
    return { variant: "warning" as const, label: t("billing.statusPastDue") };
  }
  if (billingStore.isSubscription) {
    return { variant: "default" as const, label: t("billing.statusPro") };
  }
  if (billingStore.isInviteGrant) {
    return { variant: "default" as const, label: t("billing.statusTester") };
  }
  if (billingStore.isFreeAllowance) {
    return { variant: "secondary" as const, label: t("billing.statusStarter") };
  }
  return null;
});

function formatMetaDate(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  return Number.isFinite(parsed.getTime()) ? formatMediumDate(parsed) : null;
}

const membershipMenuMeta = computed(() => {
  if (billingStore.isInPastDueGrace) {
    const formattedGrace = formatMetaDate(billingStore.subscriptionGraceEndsAt);
    return formattedGrace ? t("billing.pastDueBadge", { date: formattedGrace }) : null;
  }
  if (billingStore.isSubscription) {
    const formattedEnd = formatMetaDate(billingStore.subscriptionPeriodEnd);
    if (!formattedEnd) return null;
    return billingStore.isSubscriptionCancelling
      ? t("billing.cancelsOn", { date: formattedEnd })
      : t("billing.renewsOn", { date: formattedEnd });
  }
  if (billingStore.isInviteGrant) {
    const formattedInvite = formatMetaDate(billingStore.inviteExpiresAt);
    return formattedInvite ? t("billing.inviteExpiresOn", { date: formattedInvite }) : null;
  }
  return null;
});

function handleSwitchSpreadsheet(): void {
  void spreadsheetStore.switchSpreadsheet().orTee((error) => {
    if (error === "picker-cancelled") return;
    toast({
      variant: "destructive",
      title: t("loading.errors.switchSheetFailedTitle"),
      description: t("loading.errors.switchSheetFailedDesc"),
    });
  });
}
</script>

<template>
  <div class="flex items-center gap-1">
    <UiButton
      v-if="logsStore.showPendingSync"
      variant="chip"
      size="micro"
      :disabled="!logsStore.isOnline || logsStore.isSyncingPending || logsStore.isRefreshing"
      :aria-label="t('nav.syncAriaLabel')"
      class="rounded-full bg-orange-500/10 border-orange-500/20 text-orange-400 hover:bg-white/10"
      @click="void logsStore.refresh()"
    >
      <CloudOff class="w-3.5 h-3.5 shrink-0" />
      <span>
        {{
          logsStore.isSyncingPending || logsStore.isRefreshing
            ? t("nav.syncing")
            : t("nav.pendingSync", { count: logsStore.pendingSyncCount })
        }}
      </span>
    </UiButton>
    <UiButton variant="ghost" size="icon" :aria-label="t('nav.pastSessions')" @click="router.push('/past-sessions')">
      <History class="w-5 h-5 text-muted-foreground" />
    </UiButton>
    <UiButton variant="ghost" size="icon" :aria-label="t('nav.restRecovery')" @click="router.push('/rest-recovery')">
      <Bed class="w-5 h-5 text-muted-foreground" />
    </UiButton>
    <UiDropdownMenu>
      <template #trigger>
        <UiButton variant="ghost" size="icon" :aria-label="t('nav.menu')">
          <Menu class="w-5 h-5 text-muted-foreground" />
        </UiButton>
      </template>
      
      <div class="px-3 py-2 text-micro tracking-widest text-muted-foreground/60">
        {{ t("nav.quickEdit") }}
      </div>
      
      <UiDropdownMenuItem 
        v-for="step in WIZARD_STEPS" 
        :key="step.id"
        @select="router.push(`/wizard/${step.id}?mode=edit`)"
        class="group"
      >
        <span>{{ t(`wizard.steps.${step.id}.title`) }}</span>
        <ChevronRight class="w-4 h-4 ml-auto opacity-0 group-focus:opacity-20 transition-opacity" />
      </UiDropdownMenuItem>

      <div class="h-px bg-white/5 my-1 mx-3"></div>
      
      <div class="px-3 py-2 text-micro tracking-widest text-muted-foreground/60">
        {{ t("nav.data") }}
      </div>

      <UiDropdownMenuItem 
        @select="spreadsheetStore.openInBrowser()"
        class="group"
      >
        <span>{{ t("nav.openSpreadsheet") }}</span>
        <ExternalLink class="w-4 h-4 ml-auto opacity-40 group-hover:text-primary transition-colors" />
      </UiDropdownMenuItem>

      <UiDropdownMenuItem 
        @select="handleSwitchSpreadsheet"
        class="group"
      >
        <span>{{ t("nav.switchSpreadsheet") }}</span>
        <FolderOpen class="w-4 h-4 ml-auto opacity-40 group-hover:text-primary transition-colors" />
      </UiDropdownMenuItem>

      <div class="h-px bg-white/5 my-1 mx-3"></div>

      <div class="px-3 py-2 text-micro tracking-widest text-muted-foreground/60">
        {{ t("nav.language") }}
      </div>

      <UiDropdownMenuItem @select="setLocale('en')" class="group">
        <span>English</span>
        <Check v-if="locale === 'en'" class="w-4 h-4 ml-auto text-primary" />
      </UiDropdownMenuItem>

      <UiDropdownMenuItem @select="setLocale('de')" class="group">
        <span>Deutsch</span>
        <Check v-if="locale === 'de'" class="w-4 h-4 ml-auto text-primary" />
      </UiDropdownMenuItem>

      <div class="h-px bg-white/5 my-1 mx-3"></div>
      
      <div class="px-3 py-2 text-micro tracking-widest text-muted-foreground/60">
        {{ t("nav.legal") }}
      </div>

      <UiDropdownMenuItem 
        @select="router.push('/privacy')"
        class="group"
      >
        <span>{{ t("nav.privacyPolicy") }}</span>
        <ChevronRight class="w-4 h-4 ml-auto opacity-40 group-hover:text-primary transition-colors" />
      </UiDropdownMenuItem>

      <UiDropdownMenuItem 
        @select="router.push('/terms')"
        class="group"
      >
        <span>{{ t("nav.termsOfUse") }}</span>
        <ChevronRight class="w-4 h-4 ml-auto opacity-40 group-hover:text-primary transition-colors" />
      </UiDropdownMenuItem>

      <UiDropdownMenuItem 
        @select="router.push('/impressum')"
        class="group"
      >
        <span>{{ t("nav.impressum") }}</span>
        <ChevronRight class="w-4 h-4 ml-auto opacity-40 group-hover:text-primary transition-colors" />
      </UiDropdownMenuItem>

      <div class="h-px bg-white/5 my-1 mx-3"></div>

      <div class="px-3 py-2 text-micro tracking-widest text-muted-foreground/60">
        {{ t("nav.membership") }}
      </div>

      <UiDropdownMenuItem @select="isMembershipSheetOpen = true" class="group">
        <div class="flex flex-col min-w-0">
          <span>{{ t("nav.membership") }}</span>
          <span v-if="membershipMenuMeta" class="text-xs font-medium text-muted-foreground">
            {{ membershipMenuMeta }}
          </span>
        </div>
        <div class="ml-auto flex items-center gap-2 shrink-0">
          <UiBadge
            v-if="membershipStatusBadge"
            :variant="membershipStatusBadge.variant"
            class="uppercase tracking-wider"
          >
            {{ membershipStatusBadge.label }}
          </UiBadge>
          <ChevronRight
            class="w-4 h-4 opacity-40 group-hover:text-primary transition-colors"
          />
        </div>
      </UiDropdownMenuItem>

      <div class="h-px bg-white/5 my-1 mx-3"></div>

      <div class="px-3 py-2 text-micro tracking-widest text-muted-foreground/60">
        {{ t("nav.account") }}
      </div>

      <UiDropdownMenuItem @select="void signOut()" class="group">
        <span>{{ t("nav.signOut") }}</span>
        <LogOut class="w-4 h-4 ml-auto opacity-40 group-hover:text-primary transition-colors" />
      </UiDropdownMenuItem>

      <UiDropdownMenuItem
        @select="isDeleteDialogOpen = true"
        class="group text-red-400 focus:text-red-300"
      >
        <span>{{ t("nav.deleteAccount") }}</span>
        <Trash2 class="w-4 h-4 ml-auto opacity-70 group-hover:text-red-300 transition-colors" />
      </UiDropdownMenuItem>
    </UiDropdownMenu>

    <MembershipSheet v-model:open="isMembershipSheetOpen" />
    <DeleteAccountSheet v-model:open="isDeleteDialogOpen" />
  </div>
</template>
