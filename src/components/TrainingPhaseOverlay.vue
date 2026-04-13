<script setup lang="ts">
import { 
  Activity, 
  Info, 
} from "lucide-vue-next";
import { computed } from "vue";
import {
  computeTrainingPhase,
} from "@/composables/useRankDetailsData";
import type { TrainingInsights } from "@/services/trainingScience";
import BottomSheet from "./ui/BottomSheet.vue";
import BodyHeatMap2D from "./ui/BodyHeatMap2D.vue";

const props = defineProps<{
  insights: TrainingInsights;
}>();

const modelValue = defineModel<boolean>("open");

// --- Adaptive Phase Detection (Domain Alignment) ---
const trainingPhase = computed(() => computeTrainingPhase(props.insights));

// Calculate metrics for SVG Radial Gauge
const gaugeMeta = computed(() => {
  const label = trainingPhase.value.label;
  if (label === 'Deload') return { 
    percent: 100, 
    strokeClass: 'stroke-orange-500', 
    textClass: 'text-orange-500',
  };
  if (label === 'Build') return { 
    percent: 66.6, 
    strokeClass: 'stroke-primary', 
    textClass: 'text-primary',
  };
  if (label === 'Maintain') return { 
    percent: 33.3, 
    strokeClass: 'stroke-cyan-400', 
    textClass: 'text-cyan-400',
  };
  // Inactive Baseline (Dormant State - 0%)
  return { 
    percent: 0, 
    strokeClass: 'stroke-muted-foreground/30', 
    textClass: 'text-muted-foreground/80',
  };
});

// Context-aware insight mapping
const dynamicInsight = computed(() => {
  if (props.insights.fatigue.reason) return props.insights.fatigue.reason;

  const currentVolume = props.insights.fatigue.weeklyTotalSets[3] || 0;
  
  // Phase below maintaining -> Inconsistent/Inactive
  if (trainingPhase.value.label === 'Inactive' || currentVolume < 5) {
    return "Volume is too low to maintain your current muscle. Focus on getting back to a consistent weekly routine.";
  }

  if (trainingPhase.value.label === 'Maintain') {
    return "You're hitting enough volume to maintain your gains. When you're ready to grow, start pushing more sets incrementally.";
  }

  // Accumulation fallback
  return "You're consistently driving progressive overload. Keep pushing the intensity and volume to build muscle.";
});
</script>

<template>
  <BottomSheet v-model:open="modelValue">
    <div class="flex flex-col pb-16 overflow-x-hidden bg-background">
      
      <!-- FLUID DASHBOARD HEADER -->
      <div class="px-6 pt-10 pb-6 flex flex-col relative w-full">
        <!-- Subtle Top Glow -->
        <div class="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-card to-transparent pointer-events-none z-0"></div>

        <!-- Hero State Block -->
        <div class="flex flex-col relative z-20 w-full mb-8">
           <span class="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/60 mb-2.5">
             Training Phase
           </span>
           <h1 :class="['text-5xl md:text-6xl font-black uppercase tracking-tight mb-4 drop-shadow-sm', gaugeMeta.textClass]">
             {{ trainingPhase.label }}
           </h1>
           <p class="text-[15px] font-medium leading-relaxed text-foreground/80 max-w-sm">
             {{ dynamicInsight }}
           </p>
        </div>

        <!-- Data Trend Block (4W Volume) -->
        <div class="flex flex-col p-5 bg-card border border-border/50 rounded-2xl shadow-sm relative z-20 transition-all hover:border-primary/30">
           <div class="flex items-center justify-between mb-6">
              <div class="flex flex-col gap-1">
                 <span class="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Volume Load</span>
                 <div class="flex items-baseline gap-1">
                    <span class="text-xl font-bold tracking-tight">{{ insights.fatigue.weeklyTotalSets[3] || 0 }}</span>
                    <span class="text-[9px] text-muted-foreground font-semibold uppercase tracking-widest">Sets/Wk</span>
                 </div>
              </div>
              
              <div class="w-8 h-8 rounded-full bg-foreground/5 flex items-center justify-center">
                 <Activity class="w-4 h-4 text-foreground/40" stroke-width="2" />
              </div>
           </div>

           <!-- 4W Sparkline Integration -->
           <div class="flex gap-2.5 items-end h-[60px] w-full">
              <div
                v-for="(sets, i) in insights.fatigue.weeklyTotalSets"
                :key="i"
                class="flex-1 rounded-sm transition-all duration-1000 relative group"
                :class="i === 3 ? 'bg-foreground shadow-[0_0_12px_rgba(255,255,255,0.1)]' : 'bg-foreground/10 hover:bg-foreground/20'"
                :style="{ height: `${Math.max(10, Math.min(100, (sets / 40) * 100))}%` }"
              >
                 <!-- Tooltip-like date abstract -->
                 <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] font-mono text-muted-foreground opacity-40 uppercase tracking-widest">
                   W{{i+1}}
                 </div>
              </div>
           </div>
           
           <!-- Spacer for absolute labels -->
           <div class="h-4 w-full"></div>
        </div>

      </div>

      <div class="px-6 space-y-12">

        <!-- SECTION 2: ANATOMICAL BLUEPRINT (Seamless Integration) -->
        <section class="pt-4">
          <div class="flex items-center gap-3 mb-8">
             <div class="h-[1px] flex-1 bg-border/20"></div>
             <span class="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.2em]">Muscle Activation Map</span>
             <div class="h-[1px] flex-1 bg-border/20"></div>
          </div>

          <div class="-mx-6">
             <BodyHeatMap2D :muscle-groups="insights.muscleGroups" />
          </div>
        </section>

      </div>
    </div>
  </BottomSheet>
</template>
