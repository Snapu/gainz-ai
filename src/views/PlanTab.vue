<script setup lang="ts">
import { Calendar as CalendarIcon, CheckCircle2, Copy, RotateCw } from "@lucide/vue";
import { usePlanTabViewModel } from "@/modules/aiCoach/presentation";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import EmptyState from "@/shared/presentation/components/EmptyState.vue";
import ExerciseSummaryRow from "@/shared/presentation/components/ExerciseSummaryRow.vue";
import GlobalHeaderActions from "@/shared/presentation/components/GlobalHeaderActions.vue";
import SectionHeader from "@/shared/presentation/components/SectionHeader.vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";

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
  <div class="h-full bg-background flex flex-col pt-safe relative">
    
    <!-- Top Nav -->
    <AppHeader>
      <h1 class="text-lg font-black tracking-tight">Plan</h1>
      <template #actions>
        <GlobalHeaderActions />
      </template>
    </AppHeader>

    <main class="flex-1 w-full max-w-2xl mx-auto px-4 pt-4 pb-28 overflow-y-auto no-scrollbar flex flex-col gap-5">
      <template v-if="(isLoading && !activePlan) || isRegenerating">
        <!-- Skeleton for Plan Tab -->
        <div class="flex items-center justify-between gap-4 mb-1">
          <div class="h-4 w-40 bg-muted/20 animate-pulse rounded"></div>
          <div class="h-8 w-24 bg-muted/20 animate-pulse rounded"></div>
        </div>
        <div class="flex flex-col gap-4 w-full">
          <UiCard v-for="i in 3" :key="i" class="p-4 flex flex-col gap-3 animate-pulse">
            <div class="h-4 w-32 bg-muted/20 rounded"></div>
            <div class="h-3 w-48 bg-muted/20 rounded"></div>
            <div class="h-14 bg-muted/10 rounded-xl w-full"></div>
          </UiCard>
        </div>
      </template>

      <template v-else-if="activePlan">
        <div class="flex flex-col gap-4">
          <SectionHeader title="Current Training Cycle">
            <template #action>
              <UiBadge variant="surface" class="text-micro">{{ activePlan.cycleWeeks }} Week(s)</UiBadge>
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
            </template>
          </SectionHeader>
          
          <div class="flex flex-col gap-4 w-full">
            <UiCard
              v-for="(session, sIdx) in activePlan.sessions"
              :key="sIdx"
              class="p-4 flex flex-col gap-3 transition-all duration-200"
              :class="{
                'border-primary/30 ring-1 ring-primary/20': sIdx === activeSessionIndex,
                'opacity-60': isPlanSessionCompleted(session.weekNumber, session.dayOfWeek)
              }"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <h4 class="font-bold text-sm text-foreground">{{ session.sessionLabel }}</h4>
                  <span class="text-micro text-muted-foreground">Week {{ session.weekNumber }}</span>
                </div>
                
                <UiBadge
                  v-if="isPlanSessionCompleted(session.weekNumber, session.dayOfWeek)"
                  variant="success"
                  class="text-micro font-bold"
                >
                  <CheckCircle2 class="w-3 h-3 mr-1" /> Done
                </UiBadge>
                <UiBadge
                  v-else-if="sIdx === activeSessionIndex"
                  variant="info"
                  class="text-micro font-bold"
                >
                  Up Next
                </UiBadge>
              </div>

              <p v-if="session.focusDescription" class="text-xs text-muted-foreground -mt-1">
                {{ session.focusDescription }}
              </p>

              <!-- Exercise Summary Rows -->
              <div class="flex flex-col gap-2 mt-1">
                <ExerciseSummaryRow
                  v-for="(ex, exIdx) in session.exercises"
                  :key="exIdx"
                  :exercise-name="ex.exerciseName"
                  :target-sets="ex.targetSets"
                  :target-reps="ex.targetReps"
                  :rest-seconds="ex.restSeconds"
                  :superset-id="ex.supersetId"
                  :is-completed="isPlanSessionCompleted(session.weekNumber, session.dayOfWeek)"
                />
              </div>
            </UiCard>
          </div>

          <!-- Debug Buttons -->
          <div class="flex gap-2 mt-2">
            <UiButton
              variant="ghost"
              size="xs"
              class="text-muted-foreground flex-1 border border-white/10 hover:bg-white/5"
              @click="copyPlanJson"
            >
              <Copy class="w-3.5 h-3.5 mr-2 opacity-70" />
              Copy Plan JSON
            </UiButton>
          </div>
        </div>
      </template>
      
      <template v-else>
        <!-- Empty State -->
        <EmptyState
          :icon="CalendarIcon"
          title="No Active Plan"
          description="Generate a new training plan tailored to your goals and schedule."
          class="my-auto py-12"
        >
          <UiButton 
            @click="regeneratePlan"
            class="w-full font-semibold shadow-sm"
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
