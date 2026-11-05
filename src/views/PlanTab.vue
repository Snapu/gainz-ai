<script setup lang="ts">
import { Calendar as CalendarIcon, CheckCircle2, Copy, RotateCw } from "@lucide/vue";
import {
  getValidSupersetId,
  isSupersetStart,
  shouldShowWeekBadge,
  supersetConnectorClass,
  usePlanTabViewModel,
} from "@/modules/aiCoach/presentation";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import EmptyState from "@/shared/presentation/components/EmptyState.vue";
import GlobalHeaderActions from "@/shared/presentation/components/GlobalHeaderActions.vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiTelemetryLoader from "@/shared/presentation/components/ui/UiTelemetryLoader.vue";

const {
  isLoading,
  isRegenerating,
  activePlan,
  activeSessionIndex,

  isPlanSessionCompleted,
  regeneratePlan,
  copyPlanJson,
} = usePlanTabViewModel();
</script>

<template>
  <div class="h-full bg-background flex flex-col pt-safe relative overflow-hidden">
    
    <!-- Top Nav -->
    <AppHeader class="shrink-0">
      <h1 class="text-2xl font-black italic tracking-tighter">Gainz<span class="text-primary">AI</span></h1>
      <template #actions>
        <GlobalHeaderActions />
      </template>
    </AppHeader>

    <main class="flex-1 w-full max-w-2xl mx-auto px-4 pt-4 pb-28 overflow-y-auto overscroll-y-contain no-scrollbar flex flex-col gap-5">
      <template v-if="(isLoading && !activePlan) || isRegenerating">
        <UiTelemetryLoader text="Structuring training plan..." />
      </template>
      <template v-else-if="activePlan">
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-bold text-foreground">Current Training Cycle</h3>
              <UiBadge variant="surface">{{ activePlan.cycleWeeks }} Week(s)</UiBadge>
            </div>
            <UiButton
              variant="secondary"
              size="xs"
              class="shrink-0"
              :disabled="isLoading || isRegenerating"
              @click="regeneratePlan"
            >
              <RotateCw class="w-3.5 h-3.5 mr-1.5" :class="{ 'animate-spin': isRegenerating }" />
              New Plan
            </UiButton>
          </div>
          
          <div class="flex flex-col gap-4 w-full">
            <UiCard
              v-for="(session, sIdx) in activePlan.sessions"
              :key="`${session.weekNumber}-${session.dayOfWeek}-${sIdx}`" 
              class="p-0 transition-all overflow-hidden" 
              :class="[ 
                sIdx === activeSessionIndex && 'border-primary/30 ring-1 ring-primary/20', 
                isPlanSessionCompleted(session.weekNumber, session.dayOfWeek) && 'opacity-60 grayscale-[0.3]'
              ]"
            >
              <div class="p-4">
                <div class="flex items-start justify-between gap-3 mb-1">
                  <div class="flex items-center gap-2 flex-wrap min-w-0">
                    <h4 class="font-bold text-sm text-foreground">{{ session.sessionLabel }}</h4>
                    <span
                      v-if="shouldShowWeekBadge(session.sessionLabel)"
                      class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0"
                    >
                      Week {{ session.weekNumber }}
                    </span>
                  </div>
                  
                  <UiBadge v-if="isPlanSessionCompleted(session.weekNumber, session.dayOfWeek)" variant="success">
                    <CheckCircle2 class="w-3 h-3 mr-1" /> Done
                  </UiBadge>
                  <UiBadge v-else-if="sIdx === activeSessionIndex" variant="info">
                    Up Next
                  </UiBadge>
                </div>
                <p v-if="session.focusDescription" class="text-xs text-muted-foreground mb-3 pb-3 border-b border-white/5">
                  {{ session.focusDescription }}
                </p>
                
                <!-- Exercise List matching CoachTab layout -->
                <div class="flex flex-col divide-y divide-white/5 pl-2 relative">
                  <div
                    v-for="(ex, exIdx) in session.exercises"
                    :key="`${ex.exerciseName}-${exIdx}`"
                    class="flex items-center justify-between text-xs py-2 relative min-w-0"
                  >
                    <!-- Superset Indicator Line -->
                    <div
                      v-if="getValidSupersetId(ex, session.exercises)"
                      class="absolute -left-2 w-[2px] bg-primary/40"
                      :class="supersetConnectorClass(exIdx, session.exercises)"
                    />

                    <!-- Exercise Name + Optional Superset Badge -->
                    <div class="flex items-center gap-1.5 min-w-0 flex-1 pr-3">
                      <span class="font-semibold text-foreground/90 truncate">
                        {{ ex.exerciseName }}
                      </span>
                      <UiBadge
                        v-if="isSupersetStart(exIdx, session.exercises)"
                        variant="info"
                        class="text-[9px] px-1 py-0 uppercase tracking-wider shrink-0"
                      >
                        Superset
                      </UiBadge>
                    </div>

                    <!-- Sets × Reps & Prescribed Rest -->
                    <div class="flex items-center gap-1.5 shrink-0 tabular-nums text-xs ml-2">
                      <span class="font-bold text-foreground/80">
                        {{
                          ex.targetReps
                            ? `${ex.targetSets} × ${ex.targetReps}`
                            : ex.targetDurationSeconds
                              ? `${ex.targetSets} × ${ex.targetDurationSeconds}s`
                              : ex.targetDistanceMeters
                                ? `${ex.targetSets} × ${ex.targetDistanceMeters}m`
                                : `${ex.targetSets} Sets`
                        }}
                      </span>
                      <span v-if="ex.targetWeight" class="font-bold text-primary">
                        {{ ex.targetWeight }}
                      </span>
                      <span v-if="ex.restSeconds" class="text-muted-foreground/60 text-[10px]">
                        · {{ ex.restSeconds }}s
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </UiCard>
          </div>

          <!-- Debug Buttons -->
          <div class="flex gap-2 mt-2">
            <UiButton
              variant="ghost"
              size="sm"
              class="text-muted-foreground flex-1 border border-border/40 border-dashed hover:bg-muted/30"
              @click="copyPlanJson"
            >
              <Copy class="w-3.5 h-3.5 mr-2 opacity-70" />
              Copy Plan
            </UiButton>
          </div>
        </div>
      </template>
      
      <template v-else>
        <EmptyState
          :icon="CalendarIcon"
          title="No Active Plan"
          description="Generate a new training plan tailored to your goals and schedule."
        >
          <UiButton 
            @click="regeneratePlan"
            class="w-full max-w-xs mt-4 rounded-xl font-semibold shadow-sm"
            :disabled="isLoading"
          >
            <RotateCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': isLoading }" />
            Generate New Plan
          </UiButton>
        </EmptyState>
      </template>
    </main>
  </div>
</template>

<style scoped>
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
