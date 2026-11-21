<script setup lang="ts">
import { Bed, ChevronRight, CloudOff, ExternalLink, FolderOpen, History, Menu } from "@lucide/vue";
import { useRouter } from "vue-router";
import { useSpreadsheetStore } from "@/modules/platform/presentation";
import { WIZARD_STEPS } from "@/modules/profile/presentation";
import { useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiDropdownMenu from "@/shared/presentation/components/ui/UiDropdownMenu.vue";
import UiDropdownMenuItem from "@/shared/presentation/components/ui/UiDropdownMenuItem.vue";
import { useToast } from "@/shared/presentation/composables/useToast";

const router = useRouter();
const spreadsheetStore = useSpreadsheetStore();
const logsStore = useExerciseLogsStore();
const { toast } = useToast();

function handleSwitchSpreadsheet(): void {
  void spreadsheetStore.switchSpreadsheet().orTee((error) => {
    if (error === "picker-cancelled") return;
    toast({
      variant: "destructive",
      title: "Could Not Switch Sheet",
      description: "Google Picker could not be opened. Please try again.",
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
      aria-label="Sync pending offline logs"
      class="rounded-full bg-orange-500/10 border-orange-500/20 text-orange-400 hover:bg-white/10"
      @click="void logsStore.refresh()"
    >
      <CloudOff class="w-3.5 h-3.5 shrink-0" />
      <span>
        {{
          logsStore.isSyncingPending || logsStore.isRefreshing
            ? "Syncing..."
            : `${logsStore.pendingSyncCount} Pending`
        }}
      </span>
    </UiButton>
    <UiButton variant="ghost" size="icon" aria-label="Past Sessions" @click="router.push('/past-sessions')">
      <History class="w-5 h-5 text-muted-foreground" />
    </UiButton>
    <UiButton variant="ghost" size="icon" aria-label="Rest & Recovery" @click="router.push('/rest-recovery')">
      <Bed class="w-5 h-5 text-muted-foreground" />
    </UiButton>
    <UiDropdownMenu>
      <template #trigger>
        <UiButton variant="ghost" size="icon" aria-label="Menu">
          <Menu class="w-5 h-5 text-muted-foreground" />
        </UiButton>
      </template>
      
      <div class="px-3 py-2 text-micro tracking-widest text-muted-foreground/60">
        Quick Edit
      </div>
      
      <UiDropdownMenuItem 
        v-for="step in WIZARD_STEPS" 
        :key="step.id"
        @select="router.push(`/wizard/${step.id}?mode=edit`)"
        class="group"
      >
        <span>{{ step.title }}</span>
        <ChevronRight class="w-4 h-4 ml-auto opacity-0 group-focus:opacity-20 transition-opacity" />
      </UiDropdownMenuItem>

      <div class="h-px bg-white/5 my-1 mx-3"></div>
      
      <div class="px-3 py-2 text-micro tracking-widest text-muted-foreground/60">
        Data
      </div>

      <UiDropdownMenuItem 
        @select="spreadsheetStore.openInBrowser()"
        class="group"
      >
        <span>Open Spreadsheet</span>
        <ExternalLink class="w-4 h-4 ml-auto opacity-40 group-hover:text-primary transition-colors" />
      </UiDropdownMenuItem>

      <UiDropdownMenuItem 
        @select="handleSwitchSpreadsheet"
        class="group"
      >
        <span>Switch Spreadsheet</span>
        <FolderOpen class="w-4 h-4 ml-auto opacity-40 group-hover:text-primary transition-colors" />
      </UiDropdownMenuItem>

      <div class="h-px bg-white/5 my-1 mx-3"></div>
      
      <div class="px-3 py-2 text-micro tracking-widest text-muted-foreground/60">
        Legal
      </div>

      <UiDropdownMenuItem 
        @select="router.push('/privacy')"
        class="group"
      >
        <span>Privacy Policy</span>
        <ChevronRight class="w-4 h-4 ml-auto opacity-40 group-hover:text-primary transition-colors" />
      </UiDropdownMenuItem>

      <UiDropdownMenuItem 
        @select="router.push('/impressum')"
        class="group"
      >
        <span>Impressum</span>
        <ChevronRight class="w-4 h-4 ml-auto opacity-40 group-hover:text-primary transition-colors" />
      </UiDropdownMenuItem>
    </UiDropdownMenu>
  </div>
</template>
