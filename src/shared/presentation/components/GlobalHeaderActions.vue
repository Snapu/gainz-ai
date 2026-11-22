<script setup lang="ts">
import {
  Bed,
  Check,
  ChevronRight,
  CloudOff,
  ExternalLink,
  FolderOpen,
  History,
  Menu,
} from "@lucide/vue";
import { useRouter } from "vue-router";
import { useSpreadsheetStore } from "@/modules/platform/presentation";
import { WIZARD_STEPS } from "@/modules/profile/presentation";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiDropdownMenu from "@/shared/presentation/components/ui/UiDropdownMenu.vue";
import UiDropdownMenuItem from "@/shared/presentation/components/ui/UiDropdownMenuItem.vue";
import { useToast } from "@/shared/presentation/composables/useToast";
import { t } from "@/shared/presentation/i18n";
import { useLocale } from "@/shared/presentation/i18n/useLocale";

const router = useRouter();
const spreadsheetStore = useSpreadsheetStore();
const logsStore = useExerciseLogsStore();
const { toast } = useToast();
const { locale, setLocale } = useLocale();

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
    </UiDropdownMenu>
  </div>
</template>
