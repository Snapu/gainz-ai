<script setup lang="ts">
import { ChevronRight } from "@lucide/vue";
import { computed } from "vue";
import { useDeloadStore } from "@/modules/deload/presentation";
import type { UserProgress } from "@/modules/sharedKernel/presentation";
import type { SystemicPhase, TrainingInsights } from "@/modules/trainingInsights/presentation";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiRadialProgress from "@/shared/presentation/components/ui/UiRadialProgress.vue";

const props = defineProps<{
  progress: UserProgress;
  insights: TrainingInsights;
}>();

defineEmits<(e: "click") => void>();

const deloadStore = useDeloadStore();

const PHASE_THEME: Record<SystemicPhase, string> = {
  Deload: "text-orange-400 border border-orange-500/30 bg-orange-500/10",
  Build: "bg-primary/20 text-primary-foreground hover:bg-primary/30 hover:text-primary-foreground",
  Maintain: "text-cyan-400 border border-cyan-500/30 bg-cyan-500/10",
  Inactive: "bg-muted/50 text-muted-foreground",
};

const phaseTheme = computed(() => PHASE_THEME[props.insights.phase]);
</script>

<template>
  <UiCard 
    as="button"
    @click="$emit('click')"
    class="w-[calc(100%-2rem)] outline-none group hover:border-primary/50 block mx-4 mt-4 mb-0 relative transition-all duration-300 ring-1 ring-white/5 bg-card overflow-hidden p-0"
  >
    <div class="flex flex-row min-h-[11.25rem]">
      
      <!-- Rank: Avatar & Level Info (50% Width) -->
      <div class="w-1/2 relative shrink-0 border-r border-border/50 overflow-hidden group-hover:border-primary/30 transition-colors">
        <img 
          :src="progress.avatar" 
          :alt="progress.title" 
          class="absolute inset-0 w-full h-full object-cover" 
        />
        
        <div class="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent"></div>
        
        <!-- Level Progress -->
        <div class="absolute bottom-4 left-4 flex items-center gap-2">
           <UiRadialProgress 
            :progress="progress.progressPercent" 
            :size="40" 
            :stroke-width="4"
            track-class="text-white/20"
            progress-class="text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.5)]"
          >
            <div class="flex flex-col items-center justify-center">
              <span class="text-xs font-bold text-white/70 uppercase leading-none mb-0.5">Lvl</span>
              <span class="text-xs font-bold text-white leading-none">{{ progress.level }}</span>
            </div>
          </UiRadialProgress>
        </div>
      </div>

      <!-- Rank: Text & Training Info (Right Side) -->
      <div class="w-1/2 flex flex-col justify-between p-4 bg-card/40">
        
        <div class="flex flex-col gap-1 text-left">
          <span class="text-xs font-bold tracking-widest text-muted-foreground uppercase">Rank</span>
          <h2 class="text-xl font-bold tracking-tight text-foreground leading-none">
            {{ progress.title }}
          </h2>
          <span class="text-xs font-medium text-muted-foreground leading-snug line-clamp-3 break-words mt-0.5" v-if="progress.description">
            {{ progress.description.split('.')[0] }}
          </span>
        </div>
        
        <!-- Divider -->
        <div class="h-px w-full bg-border/50 my-2"></div>

        <!-- Training Info & Action -->
        <div class="flex items-end justify-between w-full">
          <div class="flex flex-col gap-2 text-left">
            <div class="flex flex-col gap-1">
               <span class="text-xs font-bold tracking-widest text-muted-foreground uppercase">Phase</span>
               <div class="flex items-center">
                 <!-- Recovery week pill when deload is active -->
                 <UiBadge
                   v-if="deloadStore.active"
                   class="text-xs uppercase tracking-wider px-1.5 py-0 text-orange-400 border border-orange-500/30 bg-orange-500/10"
                 >
                   Recovery · {{ deloadStore.daysRemaining }}d
                 </UiBadge>
                 <UiBadge v-else :class="phaseTheme" class="text-xs uppercase tracking-wider px-1.5 py-0">
                   {{ insights.phase }}
                 </UiBadge>
               </div>
            </div>
            
            <div class="flex flex-col gap-0.5">
              <span class="text-xs font-bold tracking-widest text-muted-foreground uppercase">Weekly Sets</span>
              <span class="text-lg font-bold text-foreground leading-none">
                {{ insights.fatigue.weeklyTotalSets[3] || 0 }}
              </span>
            </div>
          </div>
          
          <!-- Chevron (Bottom right) -->
          <div class="flex items-center justify-center shrink-0">
            <div class="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <ChevronRight class="w-4 h-4 text-muted-foreground group-hover:text-primary transition-all duration-300 transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>

      </div>
      
    </div>
  </UiCard>
</template>
