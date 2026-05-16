<script setup lang="ts">
import { ChevronRight, ExternalLink, Menu, Moon, Plus, Sparkles } from "@lucide/vue";
import AICoachingPanel from "@/shared/presentation/components/AICoachingPanel.vue";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import EmptyState from "@/shared/presentation/components/EmptyState.vue";
import ExerciseSelector from "@/shared/presentation/components/ExerciseSelector.vue";
import RestTimerToast from "@/shared/presentation/components/RestTimerToast.vue";
import SessionLogGroup from "@/shared/presentation/components/SessionLogGroup.vue";
import UserProgressCard from "@/shared/presentation/components/UserProgressCard.vue";
import UiBottomSheet from "@/shared/presentation/components/ui/UiBottomSheet.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiDropdownMenu from "@/shared/presentation/components/ui/UiDropdownMenu.vue";
import UiDropdownMenuItem from "@/shared/presentation/components/ui/UiDropdownMenuItem.vue";
import UiNumberField from "@/shared/presentation/components/ui/UiNumberField.vue";
import UiSparkline from "@/shared/presentation/components/ui/UiSparkline.vue";
import { useExerciseLogsPageViewModel } from "../composables/useExerciseLogsPageViewModel";

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
  isAIPanelOpen,
  handleFabClick,
  isLogFormOpen,
  exerciseOptions,
  exerciseOptionDetails,
  exerciseStats,
  isDumbbellExercise,
  formExerciseName,
  formReps,
  formWeight,
  formDistance,
  formDuration,
  formRpe,
  rpeLabel,
  saveLog,
  prefillFromAi,
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
        <UiButton variant="ghost" size="icon" @click="isAIPanelOpen = true">
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

    <!-- Bottom Sheet Form -->
    <UiBottomSheet v-model:open="isLogFormOpen" title="Log Exercise">
      <div class="flex flex-col gap-6 w-full">
        <!-- Optimized Exercise Selection -->
        <ExerciseSelector
          v-model="formExerciseName"
          :options="exerciseOptions"
          :option-details="exerciseOptionDetails"
          placeholder="Select or Search Exercise..."
          class="bg-card"
        />

        <!-- Exercise Stats -->
        <div
          v-if="exerciseStats && (exerciseStats.weightHistory.length >= 2 || exerciseStats.repsHistory.length >= 2)"
          class="flex gap-3 p-3 rounded-xl bg-card/40 border border-white/5 backdrop-blur-sm"
        >
          <UiSparkline
            v-if="exerciseStats.weightHistory.length >= 2"
            :values="exerciseStats.weightHistory"
            :max-value="exerciseStats.max.weight"
            label="Weight (kg)"
            :width="140"
            :height="48"
            class="flex-1"
          />
          <UiSparkline
            v-if="exerciseStats.repsHistory.length >= 2"
            :values="exerciseStats.repsHistory"
            :max-value="exerciseStats.max.reps"
            label="Reps"
            :width="140"
            :height="48"
            color="oklch(0.7 0.15 250)"
            fill-color="oklch(0.7 0.15 250 / 0.1)"
            class="flex-1"
          />
        </div>
        
        <!-- Metrics -->
        <div class="grid grid-cols-2 gap-4">
          <UiNumberField v-model="formReps" label="Reps" :min="0" :step="1" />
          <UiNumberField v-model="formWeight" label="Weight (kg)" :min="0" :step="0.5" :description="isDumbbellExercise ? 'Total (both hands)' : undefined" />
          <UiNumberField v-model="formDistance" label="Distance (m)" :min="0" :step="10" />
          <UiNumberField v-model="formDuration" label="Duration (min)" :min="0" :step="0.5" />
        </div>

        <!-- Stopwatch -->
        <!-- RPE Slider -->
        <div class="space-y-3 px-1 mt-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Effort (RPE)</span>
            <span class="text-xs font-bold text-primary">{{ rpeLabel }}</span>
          </div>
          <input 
            type="range" 
            min="6" 
            max="10" 
            step="0.5" 
            v-model.number="formRpe"
            @pointerdown.stop
            @touchstart.stop
            @touchmove.stop
            class="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-primary"
          />
        </div>

        <UiButton class="w-full h-16 rounded-xl text-lg mt-4" @click="saveLog">
          Save Set
        </UiButton>
      </div>
    </UiBottomSheet>

    <AICoachingPanel v-model:open="isAIPanelOpen" @log-exercise="prefillFromAi" />
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
