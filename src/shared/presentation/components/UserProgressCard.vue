<script setup lang="ts">
import { TrendingDown, TrendingUp } from "@lucide/vue";
import { computed } from "vue";
import { useDeloadStore } from "@/modules/deload/presentation";
import type { UserProgress } from "@/modules/sharedKernel/presentation";
import type { TrainingInsights } from "@/modules/trainingInsights/presentation";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiRadialProgress from "@/shared/presentation/components/ui/UiRadialProgress.vue";

const props = defineProps<{
  progress: UserProgress;
  insights?: TrainingInsights;
}>();

const deloadStore = useDeloadStore();

const phaseVariant = computed(() => {
  if (props.insights?.phase === "Deload") return "warning";
  if (props.insights?.phase === "Build") return "info";
  if (props.insights?.phase === "Maintain") return "success";
  return "neutral";
});

const weeklyVolumeDeltaPct = computed(() => {
  const sets = props.insights?.fatigue?.loadWindow?.sets;
  if (!sets?.prior3WeekAvg) return null;
  return Math.round(((sets.current - sets.prior3WeekAvg) / sets.prior3WeekAvg) * 100);
});
</script>

<template>
  <UiCard 
    class="w-full overflow-hidden p-0"
  >
    <div class="flex flex-row min-h-[9rem]">
      
      <!-- Rank: Avatar & Level Info (50% Width) -->
      <div class="w-1/2 relative shrink-0 border-r border-border/50 overflow-hidden bg-muted/10">
        <img 
          v-if="progress?.avatar"
          :src="progress.avatar" 
          :alt="progress?.title ?? 'Rank'" 
          class="absolute inset-0 w-full h-full object-cover" 
        />
        
        <div class="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent"></div>
        
        <!-- Level Progress -->
        <div class="absolute bottom-4 left-4 flex items-center gap-2">
           <UiRadialProgress 
            :progress="progress?.progressPercent ?? 0" 
            :size="40" 
            :stroke-width="4"
            track-class="text-white/20"
            progress-class="text-primary"
          >
            <div class="flex flex-col items-center justify-center">
              <span class="text-xs font-bold text-white/70 uppercase leading-none mb-0.5">Lvl</span>
              <span class="text-xs font-bold text-white leading-none">{{ progress?.level ?? 1 }}</span>
            </div>
          </UiRadialProgress>
        </div>
      </div>

      <!-- Rank: Text & Training Info (Right Side) -->
      <div class="w-1/2 flex flex-col justify-between p-4 bg-white/5">
        
        <div class="flex flex-col gap-1.5 text-left">
          <span class="text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase">Rank</span>
          <h2 class="text-xl font-black tracking-tight text-foreground leading-none mt-1">
            {{ progress?.title ?? 'Novice' }}
          </h2>
        </div>

        <!-- Training Info -->
        <div class="flex flex-col mt-3 text-left">
          <span class="text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase mb-1.5">Current Phase</span>
          <div class="flex items-center gap-3">
            <!-- Phase Badge -->
             <UiBadge
               v-if="deloadStore.active"
               variant="warning"
               class="capitalize font-semibold text-[11px] px-1.5 py-0 h-5"
             >
               Deload
             </UiBadge>
             <UiBadge v-else :variant="phaseVariant" class="capitalize font-semibold text-[11px] px-1.5 py-0 h-5">
               {{ insights?.phase ? insights.phase.toLowerCase() : 'maintain' }}
             </UiBadge>
             
            <!-- Volume -->
            <div class="flex items-center gap-1.5" v-if="insights?.fatigue?.loadWindow?.sets">
              <span class="text-sm font-bold text-foreground">
                {{ Math.round(insights.fatigue.loadWindow.sets.current) }} <span class="text-[10px] font-semibold text-muted-foreground">Sets</span>
              </span>
              <TrendingUp v-if="weeklyVolumeDeltaPct !== null && (insights.fatigue.loadWindow.sets.current - insights.fatigue.loadWindow.sets.prior3WeekAvg) >= 0.5" class="w-3.5 h-3.5" :class="weeklyVolumeDeltaPct >= 30 ? 'text-orange-400' : 'text-emerald-400'" />
              <TrendingDown v-else-if="weeklyVolumeDeltaPct !== null && (insights.fatigue.loadWindow.sets.prior3WeekAvg - insights.fatigue.loadWindow.sets.current) >= 0.5" class="w-3.5 h-3.5" :class="weeklyVolumeDeltaPct <= -20 ? 'text-foreground/50' : 'text-emerald-400'" />
            </div>
          </div>
        </div>

      </div>
      
    </div>
  </UiCard>
</template>
