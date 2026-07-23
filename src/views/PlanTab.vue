<script setup lang="ts">
import { CheckCircle2, Copy, RotateCw } from "@lucide/vue";
import { usePlanTabViewModel } from "@/modules/aiCoach/presentation";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import GlobalHeaderActions from "@/shared/presentation/components/GlobalHeaderActions.vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";

const {
  isLoading,
  isRegenerating,
  activePlan,
  activeSessionIndex,
  currentDayOfWeek,
  isPlanSessionCompleted,
  regeneratePlan,
  copyPlanJson,
} = usePlanTabViewModel();
</script>

<template>
  <div class="h-full bg-background flex flex-col pt-safe relative">
    
    <!-- Top Nav -->
    <AppHeader>
      <h1 class="text-lg font-black tracking-tight">Training Plan</h1>
      <template #actions>
        <GlobalHeaderActions />
      </template>
    </AppHeader>

    <main class="flex-1 px-4 pt-6 pb-32 overflow-y-auto no-scrollbar flex flex-col gap-6">
      <template v-if="(isLoading && !activePlan) || isRegenerating">
        <!-- Skeleton for Plan Tab -->
        <div class="flex items-center justify-between gap-4 mb-4">
          <div class="h-4 w-40 bg-muted/20 animate-pulse rounded"></div>
          <div class="h-8 w-24 bg-muted/20 animate-pulse rounded"></div>
        </div>
        <div class="flex flex-col gap-4 w-full">
          <div v-for="i in 3" :key="i" class="rounded-xl border border-white/5 bg-card shadow-sm p-3 animate-pulse">
            <div class="h-4 w-32 bg-muted/20 rounded mb-2"></div>
            <div class="h-3 w-48 bg-muted/20 rounded mb-4"></div>
            <div class="h-20 bg-muted/20 rounded w-full"></div>
          </div>
        </div>
      </template>
      <template v-else-if="activePlan">
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-bold text-foreground">Current Training Cycle</h3>
              <UiBadge variant="surface" class="uppercase tracking-wider whitespace-nowrap">{{ activePlan.cycleWeeks }} Week(s)</UiBadge>
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
            <div v-for="(session, sIdx) in activePlan.sessions" :key="sIdx" 
                class="rounded-xl overflow-hidden border transition-all" 
                :class="{ 
                  'bg-primary/[0.02] border-primary/20 shadow-sm': sIdx === activeSessionIndex, 
                  'bg-card border-white/5': sIdx !== activeSessionIndex,
                  'opacity-60 grayscale-[0.3]': isPlanSessionCompleted(session.weekNumber, session.dayOfWeek)
                }">
            <div class="p-4">
              <h4 class="font-bold text-sm text-foreground mb-1 flex items-center gap-2">
                {{ session.sessionLabel }} 
                <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Week {{ session.weekNumber }}</span>
                
                <UiBadge v-if="isPlanSessionCompleted(session.weekNumber, session.dayOfWeek)" variant="outline" class="uppercase tracking-wider ml-auto text-emerald-500 border-emerald-500/20 bg-emerald-500/10">
                  <CheckCircle2 class="w-3 h-3 mr-1" /> Done
                </UiBadge>
                <UiBadge v-else-if="sIdx === activeSessionIndex" variant="outline" class="uppercase tracking-wider ml-auto bg-primary/20 text-primary border-transparent">
                  {{ session.dayOfWeek === currentDayOfWeek ? 'Today' : 'Next' }}
                </UiBadge>
              </h4>
              <p class="text-xs text-muted-foreground mb-4 pb-3 border-b border-white/5">{{ session.focusDescription }}</p>
              
              <div class="w-full overflow-x-auto no-scrollbar">
                <table class="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest border-b border-white/5">
                      <th class="py-2 pr-2 pl-3 w-1/2">Exercise</th>
                      <th class="py-2 px-2 text-center">Sets</th>
                      <th class="py-2 px-2 text-center">Reps</th>
                      <th class="py-2 pl-2 pr-1 text-right">Rest</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-white/5">
                    <tr v-for="(ex, exIdx) in session.exercises" :key="exIdx" class="text-foreground/90 relative group">
                      <td class="py-3 pr-2 pl-3 font-medium leading-tight relative">
                        <!-- Superset connecting line -->
                        <div v-if="ex.supersetId" class="absolute left-0 w-[3px] bg-primary/30" :class="{
                           'top-3 bottom-0 rounded-t-full': ex.supersetId && session.exercises[exIdx - 1]?.supersetId !== ex.supersetId,
                           'top-0 bottom-3 rounded-b-full': ex.supersetId && session.exercises[exIdx + 1]?.supersetId !== ex.supersetId,
                           'top-0 bottom-0': ex.supersetId && session.exercises[exIdx - 1]?.supersetId === ex.supersetId && session.exercises[exIdx + 1]?.supersetId === ex.supersetId,
                           'top-3 bottom-3 rounded-full': ex.supersetId && session.exercises[exIdx - 1]?.supersetId !== ex.supersetId && session.exercises[exIdx + 1]?.supersetId !== ex.supersetId
                        }"></div>
                        
                        <div class="flex flex-col items-start gap-1">
                          <span class="pl-1">{{ ex.exerciseName }}</span>
                          <UiBadge v-if="ex.supersetId && session.exercises[exIdx - 1]?.supersetId !== ex.supersetId" variant="surface" class="ml-1 uppercase tracking-widest text-[9px] bg-primary/10 text-primary border-primary/20">Superset {{ ex.supersetId }}</UiBadge>
                        </div>
                      </td>
                      <td class="py-3 px-2 whitespace-nowrap text-center">{{ ex.targetSets }}</td>
                      <td class="py-3 px-2 whitespace-nowrap text-center">{{ ex.targetReps }}</td>
                      <td class="py-3 pl-2 pr-1 text-right whitespace-nowrap text-muted-foreground">{{ ex.restSeconds }}s</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            </div>
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
        <!-- Empty State -->
        <div class="px-5 py-12 flex flex-col items-center justify-center text-center max-w-sm mx-auto h-[60vh]">
          <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-6 border border-white/5 shadow-sm">
            <CalendarIcon class="w-8 h-8 text-muted-foreground/50" />
          </div>
          <h2 class="text-xl font-bold tracking-tight text-foreground mb-2">No Active Plan</h2>
          <p class="text-base text-muted-foreground mb-8">
            Generate a new training plan tailored to your goals and schedule.
          </p>
          <UiButton 
            @click="regeneratePlan"
            class="w-full h-12 rounded-xl font-semibold shadow-sm"
            :disabled="isLoading"
          >
            <RotateCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': isLoading }" />
            <span>Generate Plan</span>
          </UiButton>
        </div>
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
