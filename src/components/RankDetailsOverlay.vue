<script setup lang="ts">
import { computed } from "vue";
import Progress from "@/components/ui/Progress.vue";
import { 
  computeReadinessTheme, 
  computeXpPillars, 
  formatJourneyDuration,
  consistencyLabel,
  formatVolume
} from "@/composables/useUserProgression";
import { 
  getNextTitleMilestone,
  type UserProgress 
} from "@/services/leveling";
import UiDonutChart from "@/components/ui/UiDonutChart.vue";
import type { DonutChartItem } from "@/components/ui/UiDonutChart.vue";
import { useUserProfileStore } from "@/stores/userProfile";
import BottomSheet from "./ui/BottomSheet.vue";
import UiCard from "./ui/UiCard.vue";

const props = defineProps<{
  progress: UserProgress;
}>();

const modelValue = defineModel<boolean>("open");

const userStore = useUserProfileStore();

// --- Progression Metrics ---
const gritScore = computed(() => {
  const targetWorkouts = userStore.userProfile.workoutDaysPerWeek || 3;
  const weeklyXP = targetWorkouts * 100 * props.progress.readiness;
  const xpNeeded = props.progress.xpForNextLevel - props.progress.xpIntoLevel;
  return Math.max(1, Math.ceil(xpNeeded / (weeklyXP || 1)));
});

const xpPillars = computed<DonutChartItem[]>(() => {
  const rawPillars = computeXpPillars(props.progress.xpBreakdown);
  return rawPillars.map(p => ({
    ...p,
    colorClass: p.color.replace('bg-', 'text-')
  }));
});

const dominantPillar = computed(() => {
  return [...xpPillars.value].sort((a, b) => b.value - a.value)[0];
});

const nextRank = computed(() => getNextTitleMilestone(props.progress.level));

const formattedStartDate = computed(() => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric",
  }).format(props.progress.firstSessionDate);
});

const formattedTotalVolume = computed(() => formatVolume(props.progress.totalVolumeKg));

const readinessTheme = computed(() => computeReadinessTheme(props.progress.readiness));
</script>

<template>
  <BottomSheet v-model:open="modelValue">
    <div class="flex flex-col pt-4 pb-12 overflow-x-hidden bg-background">
      
      <!-- HERO: Clean Fullscreen Background -->
      <section class="relative -mt-4 mb-2 w-full h-[48vh] min-h-[360px]" data-section="rank-hero">
        <!-- Full Width Hero Image -->
        <img :src="progress.avatar" :alt="progress.title" class="absolute inset-0 w-full h-full object-cover" />
        
        <!-- Gradient Overlays for Readability -->
        <div class="absolute inset-0 bg-linear-to-t from-background via-background/60 to-transparent"></div>
        <div class="absolute inset-0 bg-linear-to-b from-background/20 to-transparent"></div>
        
        <!-- Overlay Content -->
        <div class="absolute inset-0 flex flex-col justify-end p-5 pb-6">
          <div class="flex items-center gap-2.5 mb-3">
             <div class="bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg flex items-center gap-2">
               <div :class="['w-1.5 h-1.5 rounded-full animate-pulse bg-current']"></div>
               Level {{ progress.level }}
             </div>
          </div>

          <h2 class="text-4xl font-bold tracking-tight text-white mb-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
            {{ progress.title }}
          </h2>

          <p class="text-sm text-white/80 max-w-sm leading-relaxed drop-shadow-md">
            {{ progress.description }}
          </p>
        </div>
      </section>

      <div class="px-5 space-y-6 mt-4">
        <!-- XP PROGRESSION -->
        <section class="space-y-3">
          <div class="flex items-center justify-between px-1">
             <h3 class="text-sm font-semibold text-foreground">Progression</h3>
             <span v-if="nextRank" class="text-xs text-muted-foreground font-medium">
               Next: {{ nextRank.title }} (~{{ gritScore }} wks)
             </span>
          </div>

          <UiCard class="p-5 border-border/40 bg-card shadow-sm space-y-5">
            <div class="space-y-2">
              <div class="flex justify-between items-end">
                <span class="text-xs text-muted-foreground font-medium uppercase tracking-wider">Level Progress</span>
                <span class="text-sm font-mono font-bold text-primary">{{ progress.progressPercent }}%</span>
              </div>
              <Progress 
                :model-value="progress.progressPercent" 
                class="h-2 rounded-full bg-muted overflow-hidden"
                indicator-class="bg-primary transition-all duration-1000"
              />
              <div class="flex justify-between text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                <span>{{ progress.xpIntoLevel.toLocaleString() }} XP</span>
                <span>{{ progress.xpForNextLevel.toLocaleString() }} XP</span>
              </div>
            </div>

            <div class="pt-4 border-t border-border/40">
              <div class="flex justify-between items-center mb-2">
                 <span class="text-xs text-muted-foreground font-medium uppercase tracking-wider">Readiness</span>
                 <span :class="['text-sm font-bold', readinessTheme.color]">
                    {{ (progress.readiness * 100).toFixed(0) }}%
                 </span>
              </div>
              <div class="flex gap-1 h-1.5">
                <div 
                  v-for="i in 10" :key="i"
                  class="flex-1 rounded-full transition-all duration-300"
                  :class="[
                    (progress.readiness * 10) >= i 
                      ? (readinessTheme.color.replace('text-', 'bg-')) 
                      : 'bg-muted'
                  ]"
                ></div>
              </div>
            </div>
          </UiCard>
        </section>

        <!-- SPECIALIZATION -->
        <section class="space-y-3">
          <h3 class="text-sm font-semibold text-foreground px-1">Training Focus</h3>
          <UiCard class="p-5 border-border/40 bg-card shadow-sm flex items-center justify-between gap-6">
            <UiDonutChart :data="xpPillars" :size="96" :stroke-width="8">
               <div v-if="dominantPillar" class="flex flex-col items-center justify-center">
                 <span class="text-[9px] text-muted-foreground uppercase tracking-widest mb-1">Dominant</span>
                 <span :class="['text-[11px] font-bold leading-none uppercase tracking-wider', dominantPillar.colorClass]">
                    {{ dominantPillar.label }}
                 </span>
               </div>
            </UiDonutChart>

            <div v-if="dominantPillar" class="flex-1 space-y-3">
               <div v-for="pillar in xpPillars" :key="pillar.label" class="flex items-center justify-between">
                 <div class="flex items-center gap-2">
                   <div :class="['w-2 h-2 rounded-full', pillar.color]"></div>
                   <span class="text-xs font-medium">{{ pillar.label }}</span>
                 </div>
                 <span class="text-xs font-mono font-medium text-muted-foreground">{{ pillar.percent.toFixed(0) }}%</span>
               </div>
            </div>
          </UiCard>
        </section>

        <!-- CAREER ARCHIVE -->
        <section class="space-y-3">
          <h3 class="text-sm font-semibold text-foreground px-1">Career Stats</h3>
          <div class="grid grid-cols-2 gap-3">
            <UiCard class="p-4 border-border/40 bg-card shadow-sm flex flex-col gap-1">
              <span class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Started</span>
              <div class="text-sm font-semibold">{{ formattedStartDate }}</div>
            </UiCard>
            <UiCard class="p-4 border-border/40 bg-card shadow-sm flex flex-col gap-1 text-right">
              <span class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Volume</span>
              <div class="text-sm font-bold text-primary">{{ formattedTotalVolume }}</div>
            </UiCard>
            <UiCard class="p-4 border-border/40 bg-card shadow-sm flex flex-col gap-1">
              <span class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Sessions</span>
              <div class="text-sm font-semibold">{{ progress.totalWorkoutDays }}</div>
            </UiCard>
            <UiCard class="p-4 border-border/40 bg-card shadow-sm flex flex-col gap-1 text-right">
              <span class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Repetitions</span>
              <div class="text-sm font-semibold tabular-nums">{{ progress.totalSets.toLocaleString() }}</div>
            </UiCard>
          </div>
        </section>
      </div>

    </div>
  </BottomSheet>
</template>

<style scoped>
/* Local XP Pillar Colors - Targeted to Children */
:deep(.text-discipline) { color: oklch(60% 0.15 250); }
:deep(.bg-discipline) { background-color: oklch(60% 0.15 250); }

:deep(.text-intensity) { color: oklch(60% 0.2 25); }
:deep(.bg-intensity) { background-color: oklch(60% 0.2 25); }

:deep(.text-mastery) { color: oklch(65% 0.2 310); }
:deep(.bg-mastery) { background-color: oklch(65% 0.2 310); }
</style>
