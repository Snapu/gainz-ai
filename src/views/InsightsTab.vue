<script setup lang="ts">
import { Activity, ArrowRight, TrendingDown, TrendingUp, X } from "@lucide/vue";
import { DialogClose, DialogTitle } from "reka-ui";
import { ref } from "vue";
import { useInsightsTabViewModel } from "@/modules/trainingInsights/presentation";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import GlobalHeaderActions from "@/shared/presentation/components/GlobalHeaderActions.vue";
import MuscleActivationMap from "@/shared/presentation/components/MuscleActivationMap.vue";
import { uiIconButtonClass } from "@/shared/presentation/components/ui/styles";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiBottomSheet from "@/shared/presentation/components/ui/UiBottomSheet.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiSparkline from "@/shared/presentation/components/ui/UiSparkline.vue";

const {
  deloadStore,
  insights,
  acwrValueLabel,
  acwrZone,
  fatigueRiskToneClass,
  fatigueRiskLabel,
  fatigueRiskPercent,
  deloadStatusLabel,
  deloadStatusToneClass,
  fatigueWeekRows,
  weeklyDeltaLabel,
  setsDeltaPct,
  tonnageDeltaPct,
  allExerciseMetrics,
  totalExerciseCount,
  exerciseStatusNote,
  coachAssessmentText,
  topImprovingExercises,
  attentionRequiredExercises,
} = useInsightsTabViewModel();

const isAllExercisesOpen = ref(false);
</script>

<template>
  <div class="h-full bg-background flex flex-col pt-safe relative">
    
    <!-- Top Nav -->
    <AppHeader>
      <h1 class="text-lg font-black tracking-tight">Insights</h1>
      <template #actions>
        <GlobalHeaderActions />
      </template>
    </AppHeader>

    <main class="flex-1 px-4 pt-6 pb-32 overflow-y-auto no-scrollbar flex flex-col gap-6">

      <!-- Status Summary Hero -->
      <div v-if="coachAssessmentText" class="shrink-0 rounded-xl bg-white/[0.03] border border-white/10 p-4">
        <div class="flex gap-3 items-start">
          <div class="mt-0.5 shrink-0 text-foreground/50">
            <Activity class="w-4 h-4" />
          </div>
          <p class="flex-1 min-w-0 text-sm font-medium text-foreground/90 leading-relaxed">
            {{ coachAssessmentText }}
          </p>
        </div>
      </div>

      <!-- ── Section: Readiness ── -->
      <section>
        <UiCard class="p-3 sm:p-4 overflow-visible">
          <!-- 1. Top Section: Core Status Banners -->
          <div class="flex items-start justify-between gap-2 mb-4">
            <div>
              <h3 class="text-sm font-bold text-foreground whitespace-nowrap">Readiness</h3>
              <p class="text-[10px] sm:text-xs text-foreground/60 mt-0.5">Overall recovery and fatigue</p>
            </div>
            <div class="flex flex-col items-end gap-1.5">
              <UiBadge
                class="uppercase tracking-wider"
                :variant="insights.phase === 'Deload' ? 'warning' : insights.phase === 'Build' ? 'info' : insights.phase === 'Maintain' ? 'success' : 'neutral'"
              >
                {{ insights.phase }}
              </UiBadge>
              <UiBadge
                v-if="insights.phase !== 'Inactive' && deloadStatusLabel !== 'None'"
                class="uppercase tracking-wider"
                :variant="deloadStatusToneClass as any"
              >
                Deload: {{ deloadStatusLabel }}
              </UiBadge>
            </div>
          </div>

          <!-- Active Deload Banner -->
          <div v-if="insights.deloadStatus === 'active'" class="mb-4 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
            <div class="flex justify-between items-center mb-2">
              <div>
                <p class="text-[10px] uppercase tracking-wide text-orange-400/80 font-bold">Active Deload</p>
                <p class="text-xs text-foreground/80 mt-0.5">{{ deloadStore.daysRemaining ?? 0 }}d remaining (Ends {{ insights.deloadEndsAt ? new Date(insights.deloadEndsAt).toLocaleDateString() : 'N/A' }})</p>
              </div>
              <UiButton
                variant="ghost"
                size="sm"
                class="text-xs text-orange-400/70 border border-orange-500/20 hover:text-red-400 hover:border-red-400/30 h-7 px-2"
                @click="deloadStore.cancelDeload()"
              >
                Stop
              </UiButton>
            </div>
            <div class="h-1.5 rounded-full bg-orange-900/30 overflow-hidden">
              <div class="h-full rounded-full bg-orange-400/70 transition-all duration-300" :style="{ width: `${deloadStore.progressPercent ?? 0}%` }"></div>
            </div>
          </div>

          <!-- Risk Score & ACWR -->
          <div class="flex flex-col mb-1">
            <div class="flex items-center justify-between mb-1">
              <span class="text-[10px] uppercase tracking-wide text-foreground/50 font-bold">Fatigue Risk</span>
              <UiBadge v-if="insights.fatigue.shouldDeload" variant="warning" class="uppercase tracking-wider">
                DELOAD ADVISED
              </UiBadge>
            </div>
            <p class="text-3xl font-black tracking-tight mt-1" :class="fatigueRiskToneClass">
              {{ fatigueRiskLabel }} <span class="text-base font-bold text-foreground/40">({{ fatigueRiskPercent }}%)</span>
            </p>
            <p class="text-[11px] text-foreground/60 mt-1 font-medium flex items-center gap-1.5">
              <span>ACWR: {{ acwrValueLabel }}</span>
              <span class="opacity-50">·</span> 
              <span :class="insights.acwr !== null && insights.acwr <= 1.3 ? 'text-emerald-400' : 'text-orange-400'">{{ acwrZone.label }}</span>
            </p>
          </div>
        </UiCard>
      </section>

      <!-- ── Section: Volume Analysis (Unified) ── -->
      <section>
        <UiCard class="p-3 sm:p-4 overflow-visible flex flex-col gap-5">
          <!-- Workload Header & KPIs -->
          <div>
            <div class="flex items-center justify-between gap-2 mb-4">
              <div>
                <h3 class="text-sm font-bold text-foreground">Volume Analysis</h3>
              </div>
              <UiBadge v-if="!insights.fatigue.hasSufficientHistory" variant="surface">
                Not enough data
              </UiBadge>
            </div>
            
            <div class="flex gap-6 sm:gap-8">
              <!-- KPI: Sets -->
              <div class="flex flex-col">
                <div class="flex items-center gap-1.5">
                  <div class="w-1.5 h-1.5 rounded-full" style="background-color: oklch(0.8 0.1 230)"></div>
                  <span class="text-[10px] uppercase tracking-wide text-foreground/50 font-bold">Sets</span>
                </div>
                <div class="flex items-end gap-1.5 mt-1">
                  <span class="text-xl sm:text-2xl font-black tracking-tight leading-none text-foreground">{{ Math.round(insights.fatigue.loadWindow.sets.current) }}</span>
                  <span class="text-[10px] font-bold mb-[2px] flex items-center gap-0.5" :class="setsDeltaPct === null ? 'text-foreground/70' : setsDeltaPct >= 30 ? 'text-orange-400' : setsDeltaPct <= -20 ? 'text-foreground/50' : 'text-emerald-400'">
                    <TrendingUp v-if="setsDeltaPct !== null && setsDeltaPct > 0" class="w-3 h-3" />
                    <TrendingDown v-else-if="setsDeltaPct !== null && setsDeltaPct < 0" class="w-3 h-3" />
                    {{ weeklyDeltaLabel.replace('+', '').replace('-', '') }}
                  </span>
                </div>
              </div>

              <!-- KPI: Tonnage -->
              <div class="flex flex-col">
                <div class="flex items-center gap-1.5">
                  <div class="w-1.5 h-1.5 rounded-full" style="background-color: oklch(0.8 0.15 60)"></div>
                  <span class="text-[10px] uppercase tracking-wide text-foreground/50 font-bold">Tonnage</span>
                </div>
                <div class="flex items-end gap-1.5 mt-1">
                  <span class="text-xl sm:text-2xl font-black tracking-tight leading-none text-foreground">{{ Math.round(insights.fatigue.loadWindow.tonnage.current) }}<span class="text-xs sm:text-sm font-normal text-foreground/50 ml-0.5">kg</span></span>
                  <span class="text-[10px] font-bold mb-[2px] flex items-center gap-0.5" :class="tonnageDeltaPct === null ? 'text-foreground/70' : tonnageDeltaPct >= 30 ? 'text-orange-400' : tonnageDeltaPct <= -20 ? 'text-foreground/50' : 'text-emerald-400'">
                    <TrendingUp v-if="tonnageDeltaPct !== null && tonnageDeltaPct > 0" class="w-3 h-3" />
                    <TrendingDown v-else-if="tonnageDeltaPct !== null && tonnageDeltaPct < 0" class="w-3 h-3" />
                    {{ tonnageDeltaPct === null ? "-" : `${Math.abs(tonnageDeltaPct)}%` }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Chart -->
            <div class="relative w-full h-[64px] mt-4 mb-2 group">
              <!-- Sets Line -->
              <div class="absolute inset-0 w-full h-full">
                <UiSparkline
                  :values="fatigueWeekRows.map(r => r.sets)"
                  :width="300"
                  :height="64"
                  color="oklch(0.8 0.1 230)"
                  fillColor="oklch(0.8 0.1 230 / 0.1)"
                />
              </div>
              <!-- Tonnage Line (No fill) -->
              <div class="absolute inset-0 w-full h-full">
                <UiSparkline
                  :values="fatigueWeekRows.map(r => r.tonnage)"
                  :width="300"
                  :height="64"
                  color="oklch(0.8 0.15 60)"
                  fillColor="transparent"
                />
              </div>
            </div>
            <div class="flex items-center justify-between w-full mt-4 px-1">
              <span v-for="(row, i) in fatigueWeekRows" :key="row.key" 
                    class="text-[9px] font-semibold text-foreground/50 truncate flex-1"
                    :class="i === 0 ? 'text-left' : i === fatigueWeekRows.length - 1 ? 'text-right' : 'text-center'">
                {{ row.label.replace('Week ', 'W') }}
              </span>
            </div>
          </div>

          <!-- Divider -->
          <div class="w-full h-px bg-white/5 my-5"></div>

          <!-- Local Muscle Map -->
          <div>
            <div class="flex items-center justify-between gap-2 mb-3">
              <div>
                <h3 class="text-sm font-bold text-foreground">Local Activation</h3>
                <p class="text-[10px] sm:text-xs text-foreground/60 mt-0.5 line-clamp-1">Muscle group fatigue distribution</p>
              </div>
            </div>
            <div class="overflow-hidden rounded-xl">
              <MuscleActivationMap :muscle-groups="insights.muscleGroups" />
            </div>
          </div>

        </UiCard>
      </section>

      <!-- ── Section: Exercise Highlights ── -->
      <section>
        <UiCard class="p-3 sm:p-4 overflow-visible mb-4">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-sm font-bold text-foreground">Moving the Needle</h3>
              <p class="text-[10px] sm:text-xs text-foreground/60 mt-0.5 line-clamp-1">Top progress & plateaus</p>
            </div>
            <UiButton variant="secondary" size="sm" class="h-7 text-xs px-2.5 font-medium" @click="isAllExercisesOpen = true">
              View All ({{ totalExerciseCount }})
            </UiButton>
          </div>

          <!-- Highlight Lists -->
          <div class="flex flex-col gap-6">
            <div v-if="topImprovingExercises.length > 0">
              <h4 class="text-[10px] font-bold uppercase tracking-wider text-foreground/50 mb-1.5 px-1">Top Progress</h4>
              <div class="flex flex-col">
                <div v-for="metric in topImprovingExercises" :key="metric.name" class="flex items-center justify-between py-3 px-2 -mx-1 rounded-lg border-b border-transparent hover:bg-white/5 transition-colors">
                  <div class="flex flex-col min-w-0 mr-3">
                    <p class="text-sm font-semibold text-foreground/90 truncate">{{ metric.name }}</p>
                    <div class="flex items-center gap-1.5 mt-0.5">
                      <span class="text-[10px] text-foreground/50">Est. {{ metric.unit === 'reps' ? 'Max' : '1RM' }}:</span>
                      <span class="text-[10px] font-bold text-foreground/80">{{ metric.unit === 'reps' ? Math.round(metric.e1rm) : metric.e1rm.toFixed(1) }}</span>
                    </div>
                  </div>
                  <UiBadge variant="success" class="flex items-center gap-1 h-6 text-[11px] font-bold px-2 shrink-0">
                    <TrendingUp class="w-3 h-3" />
                    +{{ metric.deltaPct }}%
                  </UiBadge>
                </div>
              </div>
            </div>

            <div v-if="attentionRequiredExercises.length > 0">
              <h4 class="text-[10px] font-bold uppercase tracking-wider text-foreground/50 mb-1.5 px-1">Needs Attention</h4>
              <div class="flex flex-col">
                <div v-for="metric in attentionRequiredExercises" :key="metric.name" class="flex items-center justify-between py-3 px-2 -mx-1 rounded-lg border-b border-transparent hover:bg-white/5 transition-colors">
                  <div class="flex flex-col min-w-0 mr-3">
                    <p class="text-sm font-semibold text-foreground/90 truncate">{{ metric.name }}</p>
                    <div class="flex items-center gap-1.5 mt-0.5">
                      <span class="text-[10px] text-foreground/50">Est. {{ metric.unit === 'reps' ? 'Max' : '1RM' }}:</span>
                      <span class="text-[10px] font-bold text-foreground/80">{{ metric.unit === 'reps' ? Math.round(metric.e1rm) : metric.e1rm.toFixed(1) }}</span>
                    </div>
                  </div>
                  <UiBadge :variant="metric.status === 'plateau' ? 'warning' : 'danger'" class="flex items-center gap-1 h-6 text-[11px] font-bold px-2 shrink-0">
                    <ArrowRight v-if="metric.status === 'plateau'" class="w-3 h-3" />
                    <TrendingDown v-else class="w-3 h-3" />
                    {{ metric.status === 'plateau' ? 'Plateau' : metric.deltaPct + '%' }}
                  </UiBadge>
                </div>
              </div>
            </div>

            <div v-if="topImprovingExercises.length === 0 && attentionRequiredExercises.length === 0" class="text-xs text-foreground/50 py-4 text-center bg-white/5 rounded-lg border border-white/5">
              No significant trends detected yet. Keep logging!
            </div>
          </div>
        </UiCard>
      </section>

    </main>

    <UiBottomSheet v-model:open="isAllExercisesOpen" content-class="p-0 gap-0 h-[85vh]">
      <template #header>
        <div class="flex items-center justify-between p-6 pb-4 border-b border-white/5 shrink-0 bg-background/95 backdrop-blur-xl z-10 sticky top-0">
          <div>
            <DialogTitle class="text-2xl font-bold tracking-tight">All Exercises</DialogTitle>
            <p class="text-[10px] text-muted-foreground mt-0.5">{{ exerciseStatusNote }}</p>
          </div>
          <DialogClose :class="uiIconButtonClass">
            <X class="w-5 h-5 text-muted-foreground" />
            <span class="sr-only">Close</span>
          </DialogClose>
        </div>
      </template>
      
      <div class="flex-1 overflow-y-auto no-scrollbar pb-safe">
        <template v-if="allExerciseMetrics.length > 0">
          <template v-for="(metric, index) in allExerciseMetrics" :key="metric.name">
            <div 
              v-if="metric.isStale && (index === 0 || !allExerciseMetrics[index - 1].isStale)"
              class="px-6 py-2 bg-white/5 border-y border-white/5 text-[10px] font-semibold text-foreground/40 tracking-widest uppercase sticky top-0 z-10 backdrop-blur-md"
            >
              Inactive (> 4 Weeks)
            </div>
            <div
              class="px-6 py-3 border-b border-white/5 last:border-0 transition-colors hover:bg-white/5"
              :class="{ 'opacity-50': metric.isStale }"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-semibold text-foreground/90 truncate">{{ metric.name }}</p>
                    <div 
                      class="w-1.5 h-1.5 rounded-full shrink-0"
                      :class="{
                        'bg-orange-400': metric.status === 'plateau',
                        'bg-emerald-400': metric.status === 'improving',
                        'bg-red-400': metric.status === 'dropping',
                        'bg-white/20': metric.status === 'stable',
                      }"
                    ></div>
                  </div>
                  <div class="mt-1 flex items-center gap-1.5 text-[10px] text-foreground/50 truncate">
                    <span class="truncate max-w-[140px] sm:max-w-[200px]">
                      {{ metric.learnedMuscleGroups.length > 0 ? metric.learnedMuscleGroups.join(', ') : 'No muscle tags' }}
                    </span>
                    <span class="w-1 h-1 rounded-full bg-white/20 shrink-0"></span>
                    <span class="shrink-0 text-foreground/70">{{ metric.lastTrainedLabel }}</span>
                  </div>
                </div>

                <div class="shrink-0 flex items-center gap-3">
                  <div class="text-right flex flex-col items-end">
                    <p class="text-[10px] uppercase tracking-wide text-foreground/45 mb-0.5">
                      {{ metric.unit === 'reps' ? 'eMax' : 'e1RM' }}
                    </p>
                    <p class="text-sm font-bold text-foreground/90 leading-none">
                      {{ metric.unit === 'reps' ? Math.round(metric.e1rm) : metric.e1rm.toFixed(1) }}
                    </p>
                  </div>
                  <!-- Delta Pill -->
                  <UiBadge 
                    class="w-[46px] justify-center shrink-0 h-6"
                    :variant="metric.deltaPct !== null && metric.deltaPct > 0 ? 'success' : metric.deltaPct !== null && metric.deltaPct < 0 ? 'danger' : 'surface'"
                  >
                    {{ metric.deltaPct === null ? "-" : `${metric.deltaPct > 0 ? "+" : ""}${metric.deltaPct}%` }}
                  </UiBadge>
                </div>
              </div>
            </div>
          </template>
        </template>
        <div
          v-else
          class="px-6 py-8 text-center text-xs text-foreground/55"
        >
          No exercise stats yet. Add more logs.
        </div>
      </div>
    </UiBottomSheet>
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
</style>
