<script setup lang="ts">
import { ChevronRight } from "lucide-vue-next";
import { computed } from "vue";
import UiCard from "@/components/ui/UiCard.vue";
import type { SystemicPhase, TrainingInsights } from "@/services/trainingScience";

const props = defineProps<{
  insights: TrainingInsights;
}>();

defineEmits<(e: "click") => void>();

const PHASE_THEME: Record<SystemicPhase, { textClass: string }> = {
  Deload: { textClass: "text-orange-500" },
  Build: { textClass: "text-primary" },
  Maintain: { textClass: "text-cyan-400" },
  Inactive: { textClass: "text-muted-foreground" },
};

const phaseTheme = computed(() => PHASE_THEME[props.insights.phase]);
</script>

<template>
  <UiCard 
    as="button"
    @click="$emit('click')"
    class="w-[calc(100%-2rem)] flex items-center justify-between p-5 mb-4 mx-4 mt-4 active:scale-[0.98] outline-none group hover:border-primary/40 border-border/40 shadow-sm transition-all"
  >
    <div class="flex flex-col items-start relative z-10 w-full">
      <h3 class="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-2 group-hover:text-primary/80 transition-colors">
        Training Phase
      </h3>
      
      <div class="flex items-center gap-4 w-full">
        <!-- Main Phase Label -->
        <div class="flex items-baseline gap-1 min-w-[5rem]">
          <span class="text-2xl font-bold tracking-tight text-foreground uppercase group-hover:text-primary transition-colors">
            {{ insights.phase }}
          </span>
        </div>
        
        <div class="h-6 w-px bg-border/50 mx-1"></div>
        
        <!-- Quick Stats -->
        <div class="flex items-center gap-5 flex-1">
          <div class="flex flex-col items-start gap-0.5">
            <span class="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Sets/Wk</span>
            <span class="text-sm font-bold text-foreground">{{ insights.fatigue.weeklyTotalSets[3] || 0 }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Chevron -->
    <div class="flex items-center justify-center shrink-0 ml-2 relative z-10">
      <div class="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
        <ChevronRight class="w-4 h-4 text-muted-foreground group-hover:text-primary transition-all duration-300" />
      </div>
    </div>
  </UiCard>
</template>
