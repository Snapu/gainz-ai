<script setup lang="ts">
import { computed } from "vue";
import { 
  ShieldCheck,
  AlertTriangle,
  Activity
} from "lucide-vue-next";
import UiCard from "@/components/ui/UiCard.vue";
import { 
  computeTrainingPhase 
} from "@/composables/useRankDetailsData";
import type { TrainingInsights } from "@/services/trainingScience";

const props = defineProps<{
  insights: TrainingInsights;
}>();

defineEmits<(e: "click") => void>();

const trainingPhase = computed(() => {
  const phase = computeTrainingPhase(props.insights);
  if (phase.label === 'Accumulation') return { ...phase, label: 'Building Phase' };
  if (phase.label === 'Stabilization') return { ...phase, label: 'Maintenance Phase' };
  return phase;
});

const fatigueStatus = computed(() => {
  if (props.insights.fatigue.shouldDeload) {
    return {
      label: "Deload Recommended",
      color: "text-orange-500",
      icon: AlertTriangle
    };
  }
  return {
    label: "Optimal Recovery",
    color: "text-emerald-500",
    icon: ShieldCheck
  };
});
</script>

<template>
  <UiCard 
    as="button"
    @click="$emit('click')"
    class="w-[calc(100%-2rem)] text-left px-5 py-4 mb-4 mx-4 active:scale-[0.98] outline-none group relative overflow-hidden transition-all duration-300 border-border/40 shadow-sm"
  >
    <div class="relative z-10 flex items-center gap-5 w-full">
      <div class="flex-1 min-w-0 flex flex-col justify-center">
        
        <span class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1">
          Body Status
        </span>

        <h2 class="text-xl font-bold tracking-tight text-foreground transition-colors group-hover:text-primary leading-none mb-2.5">
          {{ trainingPhase.label }}
        </h2>
          
        <div class="flex items-center gap-1.5 mb-4">
          <component :is="fatigueStatus.icon" :class="['w-3 h-3', fatigueStatus.color]" />
          <span class="text-[11px] font-bold uppercase tracking-wider" :class="fatigueStatus.color">
            {{ fatigueStatus.label }}
          </span>
        </div>

        <!-- Integrated Fatigue Visualization -->
        <div class="space-y-2 pt-4 border-t border-border/40 w-full pr-1">
          <div class="flex items-center justify-between text-muted-foreground">
            <span class="text-[10px] font-medium uppercase tracking-widest">
              Last 4 Weeks Volume
            </span>
            <span class="text-xs font-mono font-medium">
              {{ insights.fatigue.weeklyTotalSets[3] }} Sets
            </span>
          </div>

          <div class="flex gap-1.5 items-end h-8 w-full">
            <div
              v-for="(sets, i) in insights.fatigue.weeklyTotalSets"
              :key="i"
              class="flex-1 rounded-sm transition-all duration-500"
              :class="i === 3 ? 'bg-primary' : 'bg-border/60'"
              :style="{ height: `${Math.max(15, Math.min(100, (sets / 40) * 100))}%` }"
            ></div>
          </div>
        </div>
      </div>

      <!-- Subtle Pointer -->
      <div class="shrink-0 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </div>
    </div>
  </UiCard>
</template>
