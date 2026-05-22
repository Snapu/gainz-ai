<script setup lang="ts">
import { ChevronRight, ExternalLink, Menu, Moon, Plus, Sparkles } from "@lucide/vue";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import EmptyState from "@/shared/presentation/components/EmptyState.vue";
import RestTimerToast from "@/shared/presentation/components/RestTimerToast.vue";
import SessionLogGroup from "@/shared/presentation/components/SessionLogGroup.vue";
import UserProgressCard from "@/shared/presentation/components/UserProgressCard.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiDropdownMenu from "@/shared/presentation/components/ui/UiDropdownMenu.vue";
import UiDropdownMenuItem from "@/shared/presentation/components/ui/UiDropdownMenuItem.vue";
import { useExerciseLogsPageViewModel } from "../composables/useExerciseLogsPageViewModel";
import LogExerciseSheet from "./LogExerciseSheet.vue";

const {
  router,
  logsStore,
  spreadsheetStore,
  restTimerStore,
  WIZARD_STEPS,
  isSummaryReady,
  userProgress,
  trainingInsights,
  groupedLogs,
  collapsedSessions,
  toggleSession,
  isResting,
  formattedRestTime,
  handleFabClick,
  isLogFormOpen,
} = useExerciseLogsPageViewModel();
</script>


<template>
  <div class="min-h-screen bg-background flex flex-col pt-safe relative">
    
    <!-- Top Nav -->
    <AppHeader class="justify-between">
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-black italic tracking-tighter">Gainz<span class="text-primary">AI</span></h1>
      </div>
      <div class="flex gap-2">
        <UiButton variant="ghost" size="icon" @click="router.push('/ai-coach')">
          <Sparkles class="w-5 h-5 text-primary" />
        </UiButton>
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
    </AppHeader>

    <!-- Unified Journey HUD -->
    <UserProgressCard 
      v-if="isSummaryReady"
      :progress="userProgress" 
      :insights="trainingInsights" 
      @click="router.push('/training-insights')" 
    />
    <!-- Skeleton placeholder while summaries load -->
    <div
      v-else
      class="w-[calc(100%-2rem)] mx-4 mt-4 mb-0 h-48 rounded-xl bg-card ring-1 ring-white/5 animate-pulse"
    />

    <!-- Logs List -->
    <main class="flex-1 px-4 pb-32 overflow-y-auto no-scrollbar">
      <SessionLogGroup
        v-for="session in groupedLogs"
        :key="session.date"
        :date="session.date"
        :logs="session.logs"
        :stats="session.stats"
        :is-collapsed="!!collapsedSessions[session.date]"
        @toggle="toggleSession(session.date)"
        @delete-log="logsStore.removeExerciseLog"
      />
      
      <EmptyState 
        v-if="groupedLogs.length === 0"
        title="No exercises yet."
        description="Tap the + button to log your first set."
        class="mt-20"
      />
    </main>

    <!-- Rest Timer Toast (Independent Fixed Layer) -->
    <Transition name="fade-slide">
      <div v-if="isResting" class="fixed bottom-10 right-28 z-40 mb-safe pointer-events-auto">
        <RestTimerToast
          :formatted-time="formattedRestTime"
          :is-overtime="restTimerStore.isOvertime"
          :target-rest-seconds="restTimerStore.targetRestSeconds"
          :rest-elapsed="restTimerStore.restElapsed"
          @dismiss="restTimerStore.reset()"
        />
      </div>
    </Transition>

    <!-- Primary FAB -->
    <div class="fixed bottom-10 right-10 z-30 pb-safe pointer-events-auto">
      <UiButton 
        class="relative w-16 h-16 rounded-full shadow-2xl active:scale-95 transition-all z-10" 
        size="icon" 
        @click="handleFabClick"
      >
        <Plus class="w-8 h-8" />
      </UiButton>
    </div>

    <!-- Reusable Bottom Sheet Form -->
    <LogExerciseSheet v-model:open="isLogFormOpen" />
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  transform: translateX(10px);
  opacity: 0;
}
</style>
