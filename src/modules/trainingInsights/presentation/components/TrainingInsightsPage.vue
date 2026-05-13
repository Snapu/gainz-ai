<script setup lang="ts">
import { ArrowLeft } from "@lucide/vue";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import MuscleActivationMap from "@/shared/presentation/components/MuscleActivationMap.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiSegmentedControl from "@/shared/presentation/components/ui/UiSegmentedControl.vue";
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
  deloadStatusLabel,
  deloadStatusToneClass,
  fatigueWeekRows,
  maxSets,
  maxTonnage,
  weeklyDeltaLabel,
  tonnageDeltaPct,
  exerciseMetrics,
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
              <p class="text-xs font-bold uppercase tracking-wide text-foreground/90 whitespace-nowrap">Training Phase</p>
              <p class="text-[10px] sm:text-xs text-foreground/60 mt-0.5">Systemic state overview</p>
            </div>
            <div class="flex flex-col items-end gap-1.5">
              <span
                class="text-xs px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wider"
                :class="{
                  'text-orange-400 border-orange-500/30 bg-orange-500/10': insights.phase === 'Deload',
                  'text-emerald-400 border-emerald-500/30 bg-emerald-500/10': insights.phase === 'Build',
                  'text-cyan-400 border-cyan-500/30 bg-cyan-500/10': insights.phase === 'Maintain',
                  'bg-muted/50 text-muted-foreground border-white/10': insights.phase === 'Inactive',
                }"
              >
                {{ insights.phase }}
              </span>
              <span
                v-if="insights.phase !== 'Inactive' && deloadStatusLabel !== 'None'"
                class="text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wider"
                :class="deloadStatusToneClass"
              >
                Deload: {{ deloadStatusLabel }}
              </span>
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
                <div class="flex justify-between items-start">
                  <p class="text-[10px] uppercase tracking-wide text-foreground/50">ACWR Zone</p>
                  <span class="text-[9px] px-1.5 py-0.5 rounded border uppercase font-bold" :class="acwrZone.toneClass">
                    {{ acwrZone.label }}
                  </span>
                </div>
                <p class="text-sm font-bold text-foreground/90 mt-1">
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
                <div class="flex justify-between items-start">
                  <p class="text-[10px] uppercase tracking-wide text-foreground/50">Risk Score</p>
                  <span class="text-[9px] px-1.5 py-0.5 rounded border uppercase font-bold text-foreground/60" :class="{ 'text-orange-300 border-orange-500/30 bg-orange-500/10': insights.fatigue.shouldDeload, 'border-white/10': !insights.fatigue.shouldDeload }">
                    {{ insights.fatigue.shouldDeload ? 'DELOAD REC' : 'NO DELOAD' }}
                  </span>
                </div>
                <p class="text-sm font-bold mt-1" :class="fatigueRiskToneClass">
                  {{ insights.fatigue.riskScore }}/7 <span class="text-xs font-normal text-foreground/60">({{ fatigueRiskLabel }})</span>
                </p>
              </div>
              <div class="flex gap-0.5 mt-3">
                <div v-for="i in 7" :key="i" class="h-1.5 flex-1 rounded-sm transition-colors duration-300" :class="[i <= insights.fatigue.riskScore ? (i <= 2 ? 'bg-emerald-400' : i <= 4 ? 'bg-amber-400' : i <= 6 ? 'bg-orange-400' : 'bg-red-500') : 'bg-white/10']"></div>
              </div>
            </div>
          </div>

          <!-- 3. Lower Section: Load Trends -->
          <div class="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 mb-4">
            <div class="flex items-center justify-between mb-3">
              <p class="text-[10px] uppercase tracking-wide text-foreground/50">Weekly Load Window</p>
              <span class="text-[9px] px-1.5 py-0.5 rounded-full border font-semibold uppercase tracking-wider text-foreground/60" :class="{ 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400/80': insights.fatigue.hasSufficientHistory, 'border-white/10': !insights.fatigue.hasSufficientHistory }">
                {{ insights.fatigue.hasSufficientHistory ? "4-Wk History Ready" : "Need Data" }}
              </span>
            </div>
            
            <div class="grid grid-cols-4 gap-1">
              <div v-for="row in fatigueWeekRows" :key="row.key" class="flex flex-col items-center">
                <div class="flex justify-center gap-0.5 sm:gap-1 w-full">
                  <!-- Sets Column -->
                  <div class="flex-1 max-w-[12px] flex flex-col items-center">
                    <div class="h-8 w-full flex items-end">
                      <div class="w-full bg-cyan-500/70 rounded-t-[2px] transition-all duration-500" :style="{ height: `${Math.max(4, (row.sets / maxSets) * 100)}%` }"></div>
                    </div>
                    <p class="text-[8px] sm:text-[9px] text-center text-foreground/60 mt-0.5">{{ row.sets }}</p>
                  </div>
                  <!-- Tonnage Column -->
                  <div class="flex-1 max-w-[12px] flex flex-col items-center">
                    <div class="h-8 w-full flex items-end">
                      <div class="w-full bg-amber-500/70 rounded-t-[2px] transition-all duration-500" :style="{ height: `${Math.max(4, (row.tonnage / maxTonnage) * 100)}%` }"></div>
                    </div>
                    <p class="text-[8px] sm:text-[9px] text-center text-foreground/60 mt-0.5">{{ (row.tonnage / 1000).toFixed(1) }}k</p>
                  </div>
                </div>
                <p class="text-[9px] sm:text-[10px] font-semibold text-foreground/70 text-center truncate border-t border-white/10 w-full pt-1 mt-1">
                  {{ row.label.replace('Week ', 'W') }}
                </p>
              </div>
            </div>

            <!-- Load Deltas -->
            <div class="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/5">
              <div class="flex flex-col">
                <p class="text-[9px] uppercase text-cyan-300/70">Sets vs Avg</p>
                <p class="text-xs font-semibold text-foreground/80 mt-0.5">{{ weeklyDeltaLabel }} <span class="text-[10px] text-foreground/50 font-normal">({{ insights.fatigue.loadWindow.sets.ratioVsPriorAvg ?? "-" }}x)</span></p>
              </div>
              <div class="flex flex-col">
                <p class="text-[9px] uppercase text-amber-300/70">Tonnage vs Avg</p>
                <p class="text-xs font-semibold text-foreground/80 mt-0.5">{{ tonnageDeltaPct === null ? "-" : `${tonnageDeltaPct > 0 ? "+" : ""}${tonnageDeltaPct}%` }} <span class="text-[10px] text-foreground/50 font-normal">({{ insights.fatigue.loadWindow.tonnage.ratioVsPriorAvg ?? "-" }}x)</span></p>
              </div>
            </div>
          </div>

          <!-- 4. Footer Section: Reasons & Triggers -->
          <div class="grid grid-cols-2 gap-2 sm:gap-3 mb-2">
            <div class="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <p class="text-[10px] uppercase tracking-wide text-foreground/50">Declining Lifts</p>
              <p class="text-xs font-bold text-foreground/85 mt-0.5">{{ insights.fatigue.decliningExercises }} <span class="text-[10px] font-normal text-foreground/50">detected</span></p>
            </div>
            <div class="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
              <p class="text-[10px] uppercase tracking-wide text-foreground/50">Primary Reason</p>
              <p class="text-[10px] sm:text-xs font-semibold text-foreground/80 mt-0.5 line-clamp-2">
                {{ insights.fatigue.reason ?? "None" }}
              </p>
            </div>
          </div>

          <div class="rounded-lg border border-white/10 bg-white/[0.03] p-2.5" v-if="insights.fatigue.triggeredBy.length > 0 || insights.deloadTriggerSnapshot">
            <p class="text-[10px] uppercase tracking-wide text-foreground/50 mb-1.5">Active Triggers</p>
            <div class="flex flex-wrap gap-1">
              <span v-for="trigger in insights.fatigue.triggeredBy" :key="`fatigue-${trigger}`" class="text-[9px] px-1.5 py-0.5 rounded border border-orange-500/20 bg-orange-500/10 text-orange-300 uppercase">
                {{ formatTriggerLabel(trigger) }}
              </span>
              <span v-for="trigger in insights.deloadTriggerSnapshot?.triggeredBy || []" :key="`deload-${trigger}`" class="text-[9px] px-1.5 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-amber-300 uppercase">
                {{ formatTriggerLabel(trigger) }} (Snapshot)
              </span>
            </div>
          </div>

        </UiCard>
      </template>

      <!-- ── TAB: Exercises ── -->
      <template v-else-if="activeTab === 'exercises'">
        <UiCard class="p-3 sm:p-4 overflow-visible">
          <div class="flex items-start justify-between gap-2 mb-3">
            <div>
              <p class="text-xs font-bold uppercase tracking-wide text-foreground/90">Exercise Metrics</p>
              <p class="text-[10px] sm:text-xs text-foreground/60 mt-0.5 line-clamp-1">{{ exerciseStatusNote }}</p>
            </div>
            <span class="text-[10px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 font-semibold uppercase tracking-wider text-foreground/60 whitespace-nowrap">
              {{ totalExerciseCount }} Tracked
            </span>
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
          <template v-if="exerciseMetrics.length > 0">
            <div
              v-for="metric in exerciseMetrics"
              :key="metric.name"
              class="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/5 last:border-0 transition-all duration-200 hover:bg-white/[0.05] active:bg-white/[0.08] select-none"
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
                    <span class="shrink-0">RPE: {{ metric.bestRPE === null ? "-" : metric.bestRPE.toFixed(1) }}</span>
                  </div>
                </div>

                <div class="shrink-0 flex items-center gap-2 sm:gap-3">
                  <div class="text-right hidden sm:block">
                    <p class="text-[9px] uppercase tracking-wide text-foreground/45">e1RM</p>
                  </div>
                  <p class="text-sm font-bold text-foreground/90 w-[40px] sm:w-[48px] text-right">
                    {{ metric.e1rm.toFixed(1) }}
                  </p>
                  <!-- Delta Pill -->
                  <div 
                    class="w-[42px] sm:w-[48px] py-1 rounded text-center text-[10px] sm:text-xs font-bold shrink-0"
                    :class="{
                      'bg-emerald-500/15 text-emerald-400': metric.deltaPct !== null && metric.deltaPct > 0,
                      'bg-red-500/15 text-red-400': metric.deltaPct !== null && metric.deltaPct < 0,
                      'bg-white/5 text-foreground/45': metric.deltaPct === null || metric.deltaPct === 0,
                    }"
                  >
                    {{ metric.deltaPct === null ? "-" : `${metric.deltaPct > 0 ? "+" : ""}${metric.deltaPct}%` }}
                  </div>
                </div>
              </div>
            </div>
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
