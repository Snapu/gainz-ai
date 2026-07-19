<script setup lang="ts">
import { ChevronRight, ExternalLink, Menu, Moon } from "@lucide/vue";
import { useRouter } from "vue-router";
import { useSpreadsheetStore } from "@/modules/platform/presentation";
import { WIZARD_STEPS } from "@/modules/profile/presentation";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiDropdownMenu from "@/shared/presentation/components/ui/UiDropdownMenu.vue";
import UiDropdownMenuItem from "@/shared/presentation/components/ui/UiDropdownMenuItem.vue";

const router = useRouter();
const spreadsheetStore = useSpreadsheetStore();
</script>

<template>
  <div class="flex items-center gap-2">
    <UiButton variant="ghost" size="icon" @click="router.push('/rest-recovery')">
      <Moon class="w-5 h-5 text-muted-foreground" />
    </UiButton>
    <UiDropdownMenu>
      <template #trigger>
        <UiButton variant="ghost" size="icon">
          <Menu class="w-5 h-5" />
        </UiButton>
      </template>
      
      <div class="px-3 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground/50">
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
      
      <div class="px-3 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground/50">
        Data
      </div>

      <UiDropdownMenuItem 
        @select="router.push('/exercise-migration')"
        class="group"
      >
        <span>Weight Migration</span>
        <ChevronRight class="w-4 h-4 ml-auto opacity-40 group-hover:text-primary transition-colors" />
      </UiDropdownMenuItem>

      <UiDropdownMenuItem 
        @select="spreadsheetStore.openInBrowser()"
        class="group"
      >
        <span>Open Spreadsheet</span>
        <ExternalLink class="w-4 h-4 ml-auto opacity-40 group-hover:text-primary transition-colors" />
      </UiDropdownMenuItem>
    </UiDropdownMenu>
  </div>
</template>
