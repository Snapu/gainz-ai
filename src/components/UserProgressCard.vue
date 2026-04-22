<script setup lang="ts">
import { ChevronRight } from "lucide-vue-next";
import { computed } from "vue";
import Badge from "@/components/ui/Badge.vue";
import RadialProgress from "@/components/ui/RadialProgress.vue";
import UiCard from "@/components/ui/UiCard.vue";
import type { UserProgress } from "@/services/leveling";
import type { SystemicPhase, TrainingInsights } from "@/services/trainingScience";

const props = defineProps<{
  progress: UserProgress;
  insights: TrainingInsights;
}>();

defineEmits<(e: "click") => void>();

const PHASE_THEME: Record<SystemicPhase, string> = {
  Deload: "text-orange-400 border border-orange-500/30 bg-orange-500/10",
  Build: "bg-primary/20 text-primary hover:bg-primary/30",
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
    <div class="flex flex-row min-h-[12rem]">
      
      <!-- Rank: Avatar & Level Info (50% Width) -->
      <div class="w-1/2 relative shrink-0 border-r border-border/50 overflow-hidden group-hover:border-primary/30 transition-colors">
        <img 
          :src="progress.avatar" 
          :alt="progress.title" 
          class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" 
        />
        
        <div class="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent"></div>
        
        <!-- Level Progress -->
        <div class="absolute bottom-5 left-5 flex items-center gap-2">
           <RadialProgress 
            :progress="progress.progressPercent" 
            :size="40" 
            :stroke-width="4"
            track-class="text-white/20"
            progress-class="text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.5)]"
          >
            <div class="flex flex-col items-center justify-center">
              <span class="text-[8px] font-black text-white/70 uppercase leading-none mb-0.5">Lvl</span>
              <span class="text-xs font-bold text-white leading-none">{{ progress.level }}</span>
            </div>
          </RadialProgress>
        </div>
      </div>

      <!-- Rank: Text & Training Info (Right Side) -->
      <div class="w-1/2 flex flex-col justify-between p-5 bg-card/40">
        
        <div class="flex flex-col gap-1 text-left">
          <span class="text-[9px] font-black tracking-widest text-muted-foreground uppercase">Rank</span>
          <h2 class="text-xl font-black tracking-tight text-foreground leading-none">
            {{ progress.title }}
          </h2>
          <span class="text-[10px] font-medium text-muted-foreground leading-tight line-clamp-2 mt-1" v-if="progress.description">
            {{ progress.description.split('.')[0] }}
          </span>
        </div>
        
        <!-- Divider -->
        <div class="h-px w-full bg-border/50 my-3"></div>

        <!-- Training Info & Action -->
        <div class="flex items-end justify-between w-full">
          <div class="flex flex-col gap-3 text-left">
            <div class="flex flex-col gap-1">
               <span class="text-[9px] font-black tracking-widest text-muted-foreground uppercase">Phase</span>
               <div class="flex items-center">
                 <Badge :class="phaseTheme" class="text-[10px] uppercase tracking-wider px-1.5 py-0">
                   {{ insights.phase }}
                 </Badge>
               </div>
            </div>
            
            <div class="flex flex-col gap-0.5">
              <span class="text-[9px] font-black tracking-widest text-muted-foreground uppercase">Weekly Sets</span>
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
