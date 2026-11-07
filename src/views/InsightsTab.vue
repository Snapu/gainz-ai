<script setup lang="ts">
import { ArrowRight, TrendingDown, TrendingUp, X } from "@lucide/vue";
import { DialogClose, DialogTitle } from "reka-ui";
import { ref } from "vue";
import { useInsightsTabViewModel } from "@/modules/trainingInsights/presentation";
import MuscleActivationMap from "@/shared/presentation/components/MuscleActivationMap.vue";
import UserProgressCard from "@/shared/presentation/components/UserProgressCard.vue";
import { uiIconButtonClass } from "@/shared/presentation/components/ui/styles";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiBottomSheet from "@/shared/presentation/components/ui/UiBottomSheet.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiSparkline from "@/shared/presentation/components/ui/UiSparkline.vue";

const {
  userProgress,
  deloadStore,
  insights,
  acwrValueLabel,
  acwrZone,
  fatigueRiskToneClass,
  fatigueRiskLabel,
  fatigueRiskPercent,
  fatigueWeekRows,
  setsDeltaPct,
  tonnageDeltaPct,
  allExerciseMetrics,
  exerciseStatusNote,
  topImprovingExercises,
  attentionRequiredExercises,
} = useInsightsTabViewModel();

const isAllExercisesOpen = ref(false);
</script>

<template>
  <div class="h-full bg-background flex flex-col relative overflow-hidden">
    <main class="flex-1 w-full max-w-2xl mx-auto px-4 pt-4 pb-28 overflow-y-auto overscroll-y-contain no-scrollbar flex flex-col gap-5">

      <!-- ── Section: Level & Rank Hero ── -->
      <section class="w-full">
        <UserProgressCard 
          v-if="userProgress"
          :progress="userProgress" 
          class="w-full"
        />
      </section>

      <!-- ── Section: Readiness & Workload Telemetry (Unified) ── -->
      <section class="w-full">
        <UiCard class="p-4 overflow-visible flex flex-col gap-4">
          <!-- Header -->
          <div class="flex items-start justify-between gap-2">
            <div>
              <h3 class="text-sm font-bold text-foreground">Readiness & Workload</h3>
              <p class="text-xs text-muted-foreground mt-0.5">Fatigue, volume & recovery telemetry</p>
            </div>
            <UiBadge
              class="uppercase tracking-wider"
              :variant="insights.phase === 'Deload' ? 'warning' : insights.phase === 'Build' ? 'info' : insights.phase === 'Maintain' ? 'success' : 'neutral'"
            >
              {{ insights.phase }}
            </UiBadge>
          </div>

          <!-- Active Deload Banner -->
          <div v-if="insights.deloadStatus === 'active'" class="rounded-xl border border-orange-500/20 bg-orange-500/10 p-3">
            <div class="flex justify-between items-center mb-2">
              <div>
                <p class="text-micro text-orange-400 font-bold uppercase tracking-wider">Active Deload</p>
                <p class="text-xs text-foreground/80 mt-0.5">{{ deloadStore.daysRemaining ?? 0 }}d remaining (Ends {{ insights.deloadEndsAt ? new Date(insights.deloadEndsAt).toLocaleDateString() : 'N/A' }})</p>
              </div>
              <UiButton
                variant="ghost"
                size="sm"
                class="text-xs text-orange-400/80 border border-orange-500/20 hover:text-red-400 hover:border-red-400/30 h-7 px-2.5 active:scale-95"
                @click="deloadStore.cancelDeload()"
              >
                Stop
              </UiButton>
            </div>
            <div class="h-1.5 rounded-full bg-orange-900/30 overflow-hidden">
              <div class="h-full rounded-full bg-orange-400/80 transition-all duration-300" :style="{ width: `${deloadStore.progressPercent ?? 0}%` }"></div>
            </div>
          </div>

          <!-- Deload Advised Alert (when shouldDeload and not yet active) -->
          <div v-else-if="insights.fatigue.shouldDeload" class="rounded-xl border border-orange-500/20 bg-orange-500/10 p-3 flex items-center justify-between gap-3">
            <div class="flex flex-col">
              <span class="text-micro text-orange-400 font-bold uppercase tracking-wider">Deload Advised</span>
              <span class="text-xs text-foreground/80 mt-0.5">High systemic fatigue detected across multiple muscle groups.</span>
            </div>
            <UiBadge variant="warning" class="uppercase tracking-wider shrink-0">
              High Load
            </UiBadge>
          </div>

          <!-- 3-Tile Telemetry Dashboard (matching Target Today pattern) -->
          <div class="grid grid-cols-3 gap-2 sm:gap-3 w-full">
            <!-- Tile 1: Fatigue & ACWR -->
            <div class="flex flex-col justify-between p-2.5 sm:p-3 rounded-xl bg-white/5 border border-white/5 min-w-0">
              <span class="text-micro font-bold text-muted-foreground/70 uppercase tracking-wider truncate">
                Fatigue Risk
              </span>
              <div class="flex flex-col mt-1.5 min-w-0">
                <span class="text-lg font-black tabular-nums tracking-tight truncate leading-tight" :class="fatigueRiskToneClass">
                  {{ fatigueRiskLabel }} <span class="text-xs font-bold text-muted-foreground/50">({{ fatigueRiskPercent }}%)</span>
                </span>
                <span class="text-[10px] font-bold text-muted-foreground/60 mt-0.5 truncate">
                  {{ insights.acwr !== null ? `ACWR ${acwrValueLabel} · ${acwrZone.label}` : 'No baseline' }}
                </span>
              </div>
            </div>

            <!-- Tile 2: Weekly Sets -->
            <div class="flex flex-col justify-between p-2.5 sm:p-3 rounded-xl bg-white/5 border border-white/5 min-w-0">
              <span class="text-micro font-bold text-muted-foreground/70 uppercase tracking-wider truncate">
                Sets / Wk
              </span>
              <div class="flex flex-col mt-1.5 min-w-0">
                <span class="text-lg font-black tabular-nums tracking-tight text-foreground truncate leading-tight">
                  {{ Math.round(insights.fatigue.loadWindow.sets.current) }}
                </span>
                <span class="text-[10px] font-bold mt-0.5 flex items-center gap-0.5 truncate" :class="setsDeltaPct === null ? 'text-muted-foreground/60' : setsDeltaPct >= 30 ? 'text-orange-400' : setsDeltaPct <= -20 ? 'text-muted-foreground/50' : 'text-emerald-400'">
                  <TrendingUp v-if="setsDeltaPct !== null && setsDeltaPct > 0" class="w-3 h-3 shrink-0" />
                  <TrendingDown v-else-if="setsDeltaPct !== null && setsDeltaPct < 0" class="w-3 h-3 shrink-0" />
                  {{ setsDeltaPct === null ? "-" : `${Math.abs(setsDeltaPct)}%` }}
                </span>
              </div>
            </div>

            <!-- Tile 3: Weekly Tonnage -->
            <div class="flex flex-col justify-between p-2.5 sm:p-3 rounded-xl bg-white/5 border border-white/5 min-w-0">
              <span class="text-micro font-bold text-muted-foreground/70 uppercase tracking-wider truncate">
                Tonnage
              </span>
              <div class="flex flex-col mt-1.5 min-w-0">
                <div class="flex items-baseline truncate leading-tight">
                  <span class="text-lg font-black tabular-nums tracking-tight text-foreground truncate">
                    {{ Math.round(insights.fatigue.loadWindow.tonnage.current) }}
                  </span>
                  <span class="text-[10px] font-bold text-muted-foreground/60 ml-0.5 shrink-0">kg</span>
                </div>
                <span class="text-[10px] font-bold mt-0.5 flex items-center gap-0.5 truncate" :class="tonnageDeltaPct === null ? 'text-muted-foreground/60' : tonnageDeltaPct >= 30 ? 'text-orange-400' : tonnageDeltaPct <= -20 ? 'text-muted-foreground/50' : 'text-emerald-400'">
                  <TrendingUp v-if="tonnageDeltaPct !== null && tonnageDeltaPct > 0" class="w-3 h-3 shrink-0" />
                  <TrendingDown v-else-if="tonnageDeltaPct !== null && tonnageDeltaPct < 0" class="w-3 h-3 shrink-0" />
                  {{ tonnageDeltaPct === null ? "-" : `${Math.abs(tonnageDeltaPct)}%` }}
                </span>
              </div>
            </div>
          </div>

          <!-- 4-Week Load Sparkline Trend -->
          <div class="flex flex-col w-full pt-1">
            <div class="flex items-center justify-between text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider mb-2">
              <div class="flex items-center gap-3">
                <div class="flex items-center gap-1.5">
                  <div class="w-1.5 h-1.5 rounded-full bg-primary"></div>
                  <span>Sets Trend</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class="w-1.5 h-1.5 rounded-full bg-white/40"></div>
                  <span>Tonnage Trend</span>
                </div>
              </div>
              <span class="text-muted-foreground/40">Last 4 Weeks</span>
            </div>

            <div class="relative w-full h-[56px] group">
              <!-- Sets Line (Primary Athletic Lime) -->
              <div class="absolute inset-0 w-full h-full">
                <UiSparkline
                  :values="fatigueWeekRows.map(r => r.sets)"
                  :width="300"
                  :height="56"
                  color="var(--color-primary, #84cc16)"
                  fillColor="rgba(132, 204, 22, 0.1)"
                />
              </div>
              <!-- Tonnage Line (Clean Muted White) -->
              <div class="absolute inset-0 w-full h-full">
                <UiSparkline
                  :values="fatigueWeekRows.map(r => r.tonnage)"
                  :width="300"
                  :height="56"
                  color="rgba(255, 255, 255, 0.4)"
                  fillColor="transparent"
                />
              </div>
            </div>

            <div class="flex items-center justify-between w-full mt-2 px-1">
              <span v-for="(row, i) in fatigueWeekRows" :key="row.key" 
                    class="text-[10px] font-bold text-muted-foreground/50 truncate flex-1"
                    :class="i === 0 ? 'text-left' : i === fatigueWeekRows.length - 1 ? 'text-right' : 'text-center'">
                {{ row.label.replace('Week ', 'W') }}
              </span>
            </div>
          </div>
        </UiCard>
      </section>

      <!-- ── Section: Local Activation ── -->
      <section>
        <UiCard class="p-4 overflow-visible">
          <div>
            <div class="flex items-center justify-between gap-2 mb-3">
              <div>
                <h3 class="text-sm font-bold text-foreground">Local Activation</h3>
                <p class="text-xs text-muted-foreground mt-0.5 line-clamp-1">Muscle group fatigue distribution</p>
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
        <UiCard class="p-4 overflow-visible">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-sm font-bold text-foreground">Moving the Needle</h3>
              <p class="text-xs text-muted-foreground mt-0.5 line-clamp-1">Top progress & plateaus</p>
            </div>
            <UiButton variant="secondary" size="xs" @click="isAllExercisesOpen = true">
              View All ({{ allExerciseMetrics.length }})
            </UiButton>
          </div>

          <!-- Highlight Lists -->
          <div class="flex flex-col gap-5">
            <div v-if="topImprovingExercises.length > 0">
              <h4 class="text-micro font-bold text-muted-foreground/70 uppercase tracking-wider mb-1 px-1">Top Progress</h4>
              <div class="flex flex-col divide-y divide-white/5">
                <div v-for="metric in topImprovingExercises" :key="metric.name" class="flex items-center justify-between py-2 px-1 hover:bg-white/5 transition-colors">
                  <div class="flex flex-col min-w-0 mr-3">
                    <p class="text-sm font-semibold text-foreground/90 truncate">{{ metric.name }}</p>
                    <div class="flex items-center gap-1.5 mt-0.5">
                      <span class="text-micro text-muted-foreground/60 uppercase">Est. {{ metric.unit === 'reps' ? 'Max' : '1RM' }}:</span>
                      <span class="text-xs font-bold text-foreground tabular-nums">{{ metric.unit === 'reps' ? Math.round(metric.e1rm) : metric.e1rm.toFixed(1) }}</span>
                    </div>
                  </div>
                  <UiBadge variant="success" class="flex items-center gap-1 tabular-nums font-bold">
                    <TrendingUp class="w-3 h-3" />
                    +{{ metric.deltaPct }}%
                  </UiBadge>
                </div>
              </div>
            </div>

            <div v-if="attentionRequiredExercises.length > 0">
              <h4 class="text-micro font-bold text-muted-foreground/70 uppercase tracking-wider mb-1 px-1">Needs Attention</h4>
              <div class="flex flex-col divide-y divide-white/5">
                <div v-for="metric in attentionRequiredExercises" :key="metric.name" class="flex items-center justify-between py-2 px-1 hover:bg-white/5 transition-colors">
                  <div class="flex flex-col min-w-0 mr-3">
                    <p class="text-sm font-semibold text-foreground/90 truncate">{{ metric.name }}</p>
                    <div class="flex items-center gap-1.5 mt-0.5">
                      <span class="text-micro text-muted-foreground/60 uppercase">Est. {{ metric.unit === 'reps' ? 'Max' : '1RM' }}:</span>
                      <span class="text-xs font-bold text-foreground tabular-nums">{{ metric.unit === 'reps' ? Math.round(metric.e1rm) : metric.e1rm.toFixed(1) }}</span>
                    </div>
                  </div>
                  <UiBadge :variant="metric.status === 'plateau' ? 'warning' : 'danger'" class="flex items-center gap-1 tabular-nums font-bold">
                    <ArrowRight v-if="metric.status === 'plateau'" class="w-3 h-3" />
                    <TrendingDown v-else class="w-3 h-3" />
                    {{ metric.status === 'plateau' ? 'Plateau' : metric.deltaPct + '%' }}
                  </UiBadge>
                </div>
              </div>
            </div>

            <div v-if="topImprovingExercises.length === 0 && attentionRequiredExercises.length === 0" class="text-xs text-muted-foreground py-6 text-center bg-white/5 rounded-xl border border-white/5">
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
