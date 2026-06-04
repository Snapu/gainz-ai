<script setup lang="ts">
import { ArrowLeft, TrendingDown, TrendingUp } from "@lucide/vue";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import MuscleActivationMap from "@/shared/presentation/components/MuscleActivationMap.vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiSegmentedControl from "@/shared/presentation/components/ui/UiSegmentedControl.vue";
import UiSparkline from "@/shared/presentation/components/ui/UiSparkline.vue";
import { useTrainingInsightsPageViewModel } from "../composables/useTrainingInsightsPageViewModel";

const {
  router,
  deloadStore,
  insights,
  activeTab,
  tabOptions,
  acwrValueLabel,
  acwrZone,
  acwrGaugePercent,
  formatTriggerLabel,
  fatigueRiskToneClass,
  fatigueRiskLabel,
  fatigueRiskPercent,
  deloadStatusLabel,
  deloadStatusToneClass,
  fatigueWeekRows,
  maxSets,
  maxTonnage,
  weeklyDeltaLabel,
  setsDeltaPct,
  tonnageDeltaPct,
  allExerciseMetrics,
  totalExerciseCount,
  plateauExerciseCount,
  improvingExerciseCount,
  droppingExerciseCount,
  averageBestRPE,
  exerciseStatusNote,
} = useTrainingInsightsPageViewModel();
</script>


<template>
  <div class="min-h-screen bg-background flex flex-col pt-safe">
    <AppHeader>
      <UiButton variant="ghost" size="icon" @click="router.back()">
        <ArrowLeft class="w-5 h-5" />
      </UiButton>
      <div class="flex-1 max-w-[300px] ml-2">
        <UiSegmentedControl
          :options="tabOptions"
          v-model="activeTab"
        />
      </div>
      <div class="w-10"></div> <!-- Spacer to center the segmented control relative to the back button -->
    </AppHeader>

    <main class="flex-1 flex flex-col pt-4 px-4 overflow-y-auto no-scrollbar gap-4">

      <!-- ── TAB: Muscle Activation Map ── -->
      <template v-if="activeTab === 'map'">
        <div class="overflow-hidden rounded-xl">
          <MuscleActivationMap :muscle-groups="insights.muscleGroups" />
        </div>
      </template>

      <!-- ── TAB: Training Phase ── -->
      <template v-else-if="activeTab === 'phase'">
        <UiCard class="p-3 sm:p-4 overflow-visible">
          <!-- 1. Top Section: Core Status Banners -->
          <div class="flex items-start justify-between gap-2 mb-4">
            <div>
              <h3 class="text-sm font-bold text-foreground whitespace-nowrap">Training Phase</h3>
              <p class="text-[10px] sm:text-xs text-foreground/60 mt-0.5">Overall recovery and readiness</p>
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

          <!-- 2. Middle Section: The Workload Grid -->
          <div class="grid grid-cols-2 gap-2 sm:gap-3 mb-4">
            <!-- ACWR Gauge -->
            <div class="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 flex flex-col justify-between">
              <div>
                <div class="flex flex-col items-start gap-1.5">
                  <p class="text-[10px] xl:text-xs uppercase tracking-wide text-foreground/50 leading-tight">Workload (ACWR)</p>
                  <UiBadge class="uppercase tracking-wider" :variant="acwrZone.toneClass as any">
                    {{ acwrZone.label }}
                  </UiBadge>
                </div>
                <p class="text-sm font-bold text-foreground/90 mt-1.5">
                  {{ acwrValueLabel }}
                </p>
              </div>
              <div class="mt-3 relative h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div class="absolute top-0 bottom-0 left-[33.3%] right-[27.7%] bg-emerald-500/20"></div>
                <div class="absolute top-0 bottom-0 left-[33.3%] w-[1px] bg-white/20"></div>
                <div class="absolute top-0 bottom-0 right-[27.7%] w-[1px] bg-white/20"></div>
                <div class="h-full rounded-full transition-all duration-300 relative z-10" :class="[insights.acwr !== null && insights.acwr < 0.6 ? 'bg-slate-400/90' : insights.acwr !== null && insights.acwr <= 1.3 ? 'bg-emerald-400/90' : 'bg-orange-400/90']" :style="{ width: `${acwrGaugePercent}%` }"></div>
              </div>
            </div>

            <!-- Risk Score Gauge -->
            <div class="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 flex flex-col justify-between">
              <div>
                <div class="flex flex-col items-start gap-1.5">
                  <p class="text-[10px] xl:text-xs uppercase tracking-wide text-foreground/50 leading-tight">Risk Score</p>
                  <UiBadge class="uppercase tracking-wider" :variant="insights.fatigue.shouldDeload ? 'warning' : 'surface'">
                    {{ insights.fatigue.shouldDeload ? 'DELOAD ADVISED' : 'NO DELOAD' }}
                  </UiBadge>
                </div>
                <p class="text-sm font-bold mt-1.5" :class="fatigueRiskToneClass">
                  {{ fatigueRiskLabel }} <span class="text-foreground/50 font-normal">({{ fatigueRiskPercent }}%)</span>
                </p>
              </div>
              <div class="mt-3 relative h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div class="h-full rounded-full transition-all duration-300 relative z-10" :class="[fatigueRiskPercent <= 28 ? 'bg-emerald-400/90' : fatigueRiskPercent <= 57 ? 'bg-amber-400/90' : fatigueRiskPercent <= 85 ? 'bg-orange-400/90' : 'bg-red-500/90']" :style="{ width: `${fatigueRiskPercent}%` }"></div>
              </div>
            </div>
          </div>

          <!-- 3. Lower Section: Load Trends -->
          <div class="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 mb-4">
            <div class="flex items-center justify-between mb-3">
              <p class="text-[10px] uppercase tracking-wide text-foreground/50">Weekly Load Window</p>
              <UiBadge v-if="!insights.fatigue.hasSufficientHistory" variant="surface" class="uppercase tracking-wider">
                Not enough data
              </UiBadge>
            </div>
            
            <div class="relative w-full h-[64px] mt-2 mb-2 group">
              <!-- Sets Line -->
              <div class="absolute inset-0 w-full h-full">
                <UiSparkline
                  :values="fatigueWeekRows.map(r => r.sets)"
                  :reference-value="insights.fatigue.loadWindow.sets.prior3WeekAvg"
                  reference-label="AVG"
                  reference-label-align="left"
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
                  :reference-value="insights.fatigue.loadWindow.tonnage.prior3WeekAvg"
                  reference-label="AVG"
                  :width="300"
                  :height="64"
                  color="oklch(0.8 0.15 60)"
                  fillColor="transparent"
                />
              </div>
            </div>
            
            <div class="flex justify-between px-2">
              <span v-for="row in fatigueWeekRows" :key="row.key" class="text-[9px] font-semibold text-foreground/50 truncate w-1/4 text-center">
                {{ row.label.replace('Week ', 'W') }}
              </span>
            </div>

            <!-- Load Deltas -->
            <div class="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-white/5">
              <div class="flex flex-col">
                <p class="text-[9px] uppercase font-bold" style="color: oklch(0.8 0.1 230); opacity: 0.8;">Current Volume</p>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span class="text-sm font-bold text-foreground">{{ Math.round(insights.fatigue.loadWindow.sets.current) }} <span class="text-[10px] font-normal text-foreground/50">sets</span></span>
                  <span class="text-[10px] font-semibold flex items-center gap-0.5" :class="setsDeltaPct === null ? 'text-foreground/70' : setsDeltaPct >= 30 ? 'text-orange-400' : setsDeltaPct <= -20 ? 'text-foreground/50' : 'text-emerald-400'">
                    <TrendingUp v-if="setsDeltaPct !== null && setsDeltaPct > 0" class="w-3 h-3" />
                    <TrendingDown v-else-if="setsDeltaPct !== null && setsDeltaPct < 0" class="w-3 h-3" />
                    {{ weeklyDeltaLabel.replace('+', '').replace('-', '') }}
                  </span>
                </div>
              </div>
              <div class="flex flex-col">
                <p class="text-[9px] uppercase font-bold" style="color: oklch(0.8 0.15 60); opacity: 0.8;">Current Tonnage</p>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span class="text-sm font-bold text-foreground">{{ Math.round(insights.fatigue.loadWindow.tonnage.current) }} <span class="text-[10px] font-normal text-foreground/50">kg</span></span>
                  <span class="text-[10px] font-semibold flex items-center gap-0.5" :class="tonnageDeltaPct === null ? 'text-foreground/70' : tonnageDeltaPct >= 30 ? 'text-orange-400' : tonnageDeltaPct <= -20 ? 'text-foreground/50' : 'text-emerald-400'">
                    <TrendingUp v-if="tonnageDeltaPct !== null && tonnageDeltaPct > 0" class="w-3 h-3" />
                    <TrendingDown v-else-if="tonnageDeltaPct !== null && tonnageDeltaPct < 0" class="w-3 h-3" />
                    {{ tonnageDeltaPct === null ? "-" : `${Math.abs(tonnageDeltaPct)}%` }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 4. Footer Section: Reasons & Triggers -->
          <div class="grid grid-cols-2 gap-2 sm:gap-3 mb-2">
            <div class="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <p class="text-[10px] uppercase tracking-wide text-foreground/50">Sustained Declines</p>
              <p class="text-xs font-bold text-foreground/85 mt-0.5">{{ insights.fatigue.decliningExercises }} <span class="text-[10px] font-normal text-foreground/50">detected</span></p>
            </div>
            <div class="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <p class="text-[10px] uppercase tracking-wide text-foreground/50">Primary Reason</p>
              <p class="text-[10px] sm:text-xs font-semibold text-foreground/80 mt-0.5 line-clamp-2">
                {{ insights.fatigue.reason ?? "None" }}
              </p>
            </div>
          </div>

          <div class="rounded-lg border border-white/10 bg-white/[0.03] p-2.5" v-if="insights.fatigue.triggeredBy.length > 0 || (insights.deloadStatus === 'active' && insights.deloadTriggerSnapshot)">
            <p class="text-[10px] uppercase tracking-wide text-foreground/50 mb-1.5">Active Triggers</p>
            <div class="flex flex-wrap gap-1">
              <UiBadge v-for="trigger in insights.fatigue.triggeredBy" :key="`fatigue-${trigger}`" variant="warning" class="uppercase tracking-wider">
                {{ formatTriggerLabel(trigger) }}
              </UiBadge>
              <UiBadge v-for="trigger in (insights.deloadStatus === 'active' ? insights.deloadTriggerSnapshot?.triggeredBy : []) || []" :key="`deload-${trigger}`" variant="warning" class="uppercase tracking-wider opacity-80">
                {{ formatTriggerLabel(trigger) }} (Snapshot)
              </UiBadge>
            </div>
          </div>

        </UiCard>
      </template>

      <!-- ── TAB: Exercises ── -->
      <template v-else-if="activeTab === 'exercises'">
        <UiCard class="p-3 sm:p-4 overflow-visible">
          <div class="flex items-start justify-between gap-2 mb-3">
            <div>
              <h3 class="text-sm font-bold text-foreground">Exercise Metrics</h3>
              <p class="text-[10px] sm:text-xs text-foreground/60 mt-0.5 line-clamp-1">{{ exerciseStatusNote }}</p>
            </div>
            <UiBadge variant="surface" class="uppercase tracking-wider whitespace-nowrap">
              {{ totalExerciseCount }} Tracked
            </UiBadge>
          </div>

          <!-- Summary Grid -->
          <div class="grid grid-cols-4 gap-1.5 sm:gap-2">
            <div class="rounded-lg border border-white/10 bg-white/[0.03] p-2 flex flex-col items-center justify-center">
              <p class="text-[9px] uppercase tracking-wide text-foreground/50 text-center">Plateaus</p>
              <p class="text-xs sm:text-sm font-bold text-orange-300 mt-0.5">{{ plateauExerciseCount }}</p>
            </div>
            <div class="rounded-lg border border-white/10 bg-white/[0.03] p-2 flex flex-col items-center justify-center">
              <p class="text-[9px] uppercase tracking-wide text-foreground/50 text-center">Improving</p>
              <p class="text-xs sm:text-sm font-bold text-emerald-300 mt-0.5">{{ improvingExerciseCount }}</p>
            </div>
            <div class="rounded-lg border border-white/10 bg-white/[0.03] p-2 flex flex-col items-center justify-center">
              <p class="text-[9px] uppercase tracking-wide text-foreground/50 text-center">Dropping</p>
              <p class="text-xs sm:text-sm font-bold text-red-300 mt-0.5">{{ droppingExerciseCount }}</p>
            </div>
            <div class="rounded-lg border border-white/10 bg-white/[0.03] p-2 flex flex-col items-center justify-center">
              <p class="text-[9px] uppercase tracking-wide text-foreground/50 text-center line-clamp-1">Avg RPE</p>
              <p class="text-xs sm:text-sm font-bold text-foreground/85 mt-0.5">
                {{ averageBestRPE === null ? "-" : averageBestRPE.toFixed(1) }}
              </p>
            </div>
          </div>
        </UiCard>

        <UiCard variant="list">
          <template v-if="allExerciseMetrics.length > 0">
            <template v-for="(metric, index) in allExerciseMetrics" :key="metric.name">
              <div 
                v-if="metric.isStale && (index === 0 || !allExerciseMetrics[index - 1].isStale)"
                class="px-3 sm:px-4 py-1.5 bg-white/5 border-y border-white/5 text-xs font-semibold text-foreground/40 tracking-widest uppercase"
              >
                Inactive (> 4 Weeks)
              </div>
              <div
                class="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/5 last:border-0 transition-all duration-200 hover:bg-white/5 active:bg-white/10 select-none"
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
                  <div class="mt-0.5 flex items-center gap-1.5 text-xs text-foreground/50 truncate">
                    <span class="truncate max-w-[140px] sm:max-w-[200px]">
                      {{ metric.learnedMuscleGroups.length > 0 ? metric.learnedMuscleGroups.join(', ') : 'No muscle tags' }}
                    </span>
                    <span class="w-1 h-1 rounded-full bg-white/20 shrink-0"></span>
                    <span class="shrink-0 text-foreground/70">{{ metric.lastTrainedLabel }}</span>
                  </div>
                </div>

                <div class="shrink-0 flex items-center gap-2 sm:gap-3">
                  <div class="text-right hidden sm:block">
                    <p class="text-xs uppercase tracking-wide text-foreground/45">
                      {{ metric.unit === 'reps' ? 'eMax' : 'e1RM' }}
                    </p>
                  </div>
                  <p 
                    class="text-sm font-bold text-foreground/90 w-[40px] sm:w-[48px] text-right"
                    :title="metric.unit === 'reps' ? 'Estimated Max Reps' : 'Estimated 1RM (kg)'"
                  >
                    {{ metric.unit === 'reps' ? Math.round(metric.e1rm) : metric.e1rm.toFixed(1) }}
                  </p>
                  <!-- Delta Pill -->
                  <UiBadge 
                    class="w-[46px] sm:w-[50px] justify-center shrink-0"
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
            class="px-4 py-8 text-center text-xs text-foreground/55"
          >
            No exercise stats yet. Add more logs.
          </div>
        </UiCard>
      </template>

    </main>
  </div>
</template>
