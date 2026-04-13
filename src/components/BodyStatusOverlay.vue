<script setup lang="ts">
import { 
  Activity, 
  Info, 
  ShieldCheck,
} from "lucide-vue-next";
import { computed } from "vue";
import {
  computeTrainingPhase,
} from "@/composables/useRankDetailsData";
import type { TrainingInsights } from "@/services/trainingScience";
import BottomSheet from "./ui/BottomSheet.vue";
import UiCard from "./ui/UiCard.vue";
import BodyHeatMap2D from "./ui/BodyHeatMap2D.vue";

const props = defineProps<{
  insights: TrainingInsights;
}>();

const modelValue = defineModel<boolean>("open");

// --- Adaptive Phase Detection (Terminology Override) ---
const rawPhase = computed(() => computeTrainingPhase(props.insights));
const trainingPhase = computed(() => {
  const label = rawPhase.value.label;
  // Accessible terminology mapping
  if (label === 'Deload Phase') return { ...rawPhase.value, label: 'Deload Week' };
  if (label === 'Accumulation') return { ...rawPhase.value, label: 'Building Phase' };
  if (label === 'Stabilization') return { ...rawPhase.value, label: 'Maintenance Phase' };
  return rawPhase.value;
});

const statusMessage = computed(() => {
  if (props.insights.fatigue.shouldDeload) {
    return "You've been pushing hard. A deload week is recommended to let your body recover fully.";
  }
  return "Your recovery is looking good. You're ready to keep pushing forward.";
});
</script>

<template>
  <BottomSheet v-model:open="modelValue">
    <div class="flex flex-col pt-4 pb-12 overflow-x-hidden bg-background">
      
      <!-- HERO: Minimalist Header like the Rank Details -->
      <header class="flex flex-col items-center px-6 py-8 text-center bg-card/20" data-section="status-hero">
        <div class="relative w-20 h-20 flex items-center justify-center rounded-full bg-card border-[3px] border-primary/10 shadow-sm mb-5">
           <Activity class="w-8 h-8 text-primary" stroke-width="2.5" />
        </div>
        
        <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
          Current Training Phase
        </span>

        <h2 class="text-2xl font-bold tracking-tight mb-2">
          {{ trainingPhase.label }}
        </h2>

        <p class="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed italic">
          "{{ statusMessage }}"
        </p>
      </header>

      <div class="px-5 space-y-6 mt-4">
        
        <!-- SECTION 1: RECOVERY -->
        <section class="space-y-3">
          <h3 class="text-sm font-semibold text-foreground px-1">Recovery & Volume</h3>

          <UiCard class="p-5 border-border/40 bg-card shadow-sm space-y-5">
            <!-- Recovery Recommendation -->
            <div :class="['flex gap-3 p-4 rounded-xl border', 
              insights.fatigue.shouldDeload ? 'bg-orange-500/10 border-orange-500/20' : 'bg-emerald-500/10 border-emerald-500/20']">
              <component :is="insights.fatigue.shouldDeload ? Info : ShieldCheck" 
                :class="['w-5 h-5 shrink-0', insights.fatigue.shouldDeload ? 'text-orange-500' : 'text-emerald-500']" />
              <div class="space-y-1 mt-0.5">
                <span :class="['text-xs font-semibold uppercase tracking-wider', insights.fatigue.shouldDeload ? 'text-orange-500' : 'text-emerald-500']">
                  Recommendation
                </span>
                <p class="text-sm text-muted-foreground leading-relaxed mt-0.5">
                  {{ insights.fatigue.reason || "Your body is recovering well. It's safe to continue progressing." }}
                </p>
              </div>
            </div>

            <!-- Volume Chart -->
            <div class="pt-4 border-t border-border/40">
               <div class="flex items-end justify-between gap-6 mb-2">
                  <div class="flex-1 space-y-1">
                     <span class="text-xs font-medium uppercase tracking-widest text-foreground">Weekly Training Volume</span>
                     <p class="text-[11px] text-muted-foreground leading-relaxed mr-2">Total sets across all workouts over the past 4 weeks.</p>
                  </div>

                  <div class="flex gap-1.5 items-end h-14 shrink-0">
                    <div
                      v-for="(sets, i) in insights.fatigue.weeklyTotalSets"
                      :key="i"
                      class="w-6 rounded-sm transition-all duration-700"
                      :class="i === 3 ? 'bg-primary' : 'bg-muted'"
                      :style="{ height: `${Math.max(15, Math.min(100, (sets / 40) * 100))}%` }"
                    ></div>
                  </div>
               </div>
            </div>
          </UiCard>
        </section>

        <!-- SECTION 2: ANATOMICAL BLUEPRINT -->
        <section class="space-y-3">
          <h3 class="text-sm font-semibold text-foreground px-1">Muscle Map</h3>

          <UiCard class="p-2 border-border/40 bg-card shadow-sm overflow-hidden">
             <div class="bg-muted/50 rounded-lg p-5">
                 <BodyHeatMap2D :muscle-groups="insights.muscleGroups" />
             </div>

             <!-- Legend / Key -->
             <div class="px-5 py-5 grid grid-cols-2 gap-y-5 gap-x-3 mt-1">
                <div class="flex items-start gap-2.5">
                   <div class="w-3 h-3 rounded-full bg-cyan-400 mt-0.5 shadow-sm"></div>
                   <div class="flex flex-col">
                      <span class="text-xs font-semibold">Optimal Growth</span>
                      <span class="text-[10px] text-muted-foreground mt-0.5">Target volume reached</span>
                   </div>
                </div>
                <div class="flex items-start gap-2.5">
                   <div class="w-3 h-3 rounded-full bg-emerald-500/60 mt-0.5"></div>
                   <div class="flex flex-col">
                      <span class="text-xs font-semibold">Stimulated</span>
                      <span class="text-[10px] text-muted-foreground mt-0.5">Enough to grow</span>
                   </div>
                </div>
                <div class="flex items-start gap-2.5">
                   <div class="w-3 h-3 rounded-full bg-yellow-500/60 mt-0.5"></div>
                   <div class="flex flex-col">
                      <span class="text-xs font-semibold">Maintaining</span>
                      <span class="text-[10px] text-muted-foreground mt-0.5">Focus on recovery</span>
                   </div>
                </div>
                <div class="flex items-start gap-2.5">
                   <div class="w-3 h-3 rounded-full bg-red-500/60 mt-0.5"></div>
                   <div class="flex flex-col">
                      <span class="text-xs font-semibold">Overreaching</span>
                      <span class="text-[10px] text-muted-foreground mt-0.5">Reduce volume here</span>
                   </div>
                </div>
             </div>
          </UiCard>
        </section>

      </div>
    </div>
  </BottomSheet>
</template>
