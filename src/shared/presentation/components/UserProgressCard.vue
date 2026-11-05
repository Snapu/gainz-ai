<script setup lang="ts">
import { computed } from "vue";
import type { UserProgress } from "@/modules/sharedKernel/presentation";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiRadialProgress from "@/shared/presentation/components/ui/UiRadialProgress.vue";

const props = defineProps<{
  progress: UserProgress;
}>();

const formattedTonnage = computed(() => {
  const kg = props.progress?.totalVolumeKg ?? 0;
  if (kg >= 1000) {
    const tons = kg / 1000;
    return tons >= 100 ? `${Math.round(tons)} t` : `${tons.toFixed(1)} t`;
  }
  return `${kg.toLocaleString()} kg`;
});

const formattedJourney = computed(() => {
  const weeks = props.progress?.journeyDurationWeeks ?? 0;
  if (weeks <= 0) return "0 wks";
  if (weeks >= 52) {
    const yrs = (weeks / 52).toFixed(1);
    return `${yrs.endsWith(".0") ? yrs.slice(0, -2) : yrs} yr${Number(yrs) === 1 ? "" : "s"}`;
  }
  if (weeks >= 8) {
    const mos = Math.round(weeks / 4.33);
    return `${mos} mo${mos === 1 ? "" : "s"}`;
  }
  return `${weeks} wk${weeks === 1 ? "" : "s"}`;
});

const formattedXP = computed(() => {
  const xp = props.progress?.totalXP ?? 0;
  return `${xp.toLocaleString()} XP`;
});
</script>

<template>
  <UiCard 
    class="w-full shrink-0 overflow-hidden p-0"
  >
    <div class="flex flex-row w-full items-stretch">
      
      <!-- Rank: Avatar & Level Info (38% Width) -->
      <div class="w-[38%] min-h-[9rem] relative shrink-0 border-r border-white/5 overflow-hidden bg-muted/10">
        <img 
          v-if="progress?.avatar"
          :src="progress.avatar" 
          :alt="progress?.title ?? 'Rank'" 
          class="absolute inset-0 w-full h-full object-cover" 
        />
        
        <div class="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent" />
        
        <!-- Level Progress -->
        <div class="absolute bottom-3 left-3 flex items-center gap-2">
           <UiRadialProgress 
            :progress="progress?.progressPercent ?? 0" 
            :size="38" 
            :stroke-width="3.5"
            track-class="text-white/20"
            progress-class="text-primary"
          >
            <div class="flex flex-col items-center justify-center">
              <span class="text-[9px] font-bold text-white/70 uppercase leading-none mb-0.5">Lvl</span>
              <span class="text-xs font-black text-white leading-none">{{ progress?.level ?? 1 }}</span>
            </div>
          </UiRadialProgress>
        </div>
      </div>

      <!-- Rank: Text & Lifetime Telemetry (Flexible Width) -->
      <div class="flex-1 flex flex-col justify-between p-3.5 sm:p-4">
        
        <div class="flex flex-col gap-0.5 text-left min-w-0">
          <span class="text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase">Rank</span>
          <h2 class="text-base sm:text-lg font-black tracking-tight text-foreground leading-snug break-words">
            {{ progress?.title ?? 'Novice' }}
          </h2>
        </div>

        <!-- Lifetime Telemetry (2x2 Grid) -->
        <div class="grid grid-cols-2 gap-x-3 gap-y-1.5 text-left pt-2 border-t border-white/5">
          <div class="flex flex-col min-w-0">
            <span class="text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase truncate">Tonnage</span>
            <span class="text-xs font-bold text-foreground tabular-nums truncate">{{ formattedTonnage }}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase truncate">Active</span>
            <span class="text-xs font-bold text-foreground tabular-nums truncate">{{ formattedJourney }}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase truncate">Workouts</span>
            <span class="text-xs font-bold text-foreground tabular-nums truncate">{{ progress?.totalWorkoutDays ?? 0 }}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase truncate">Total XP</span>
            <span class="text-xs font-bold text-foreground tabular-nums truncate">{{ formattedXP }}</span>
          </div>
        </div>

      </div>
      
    </div>
  </UiCard>
</template>
