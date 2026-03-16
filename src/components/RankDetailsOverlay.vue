<script setup lang="ts">
import { Activity, Flame, ShieldCheck, Sparkles, Zap } from "lucide-vue-next";
import { computed } from "vue";
import type { UserProgress } from "@/services/leveling";
import { useTrainingSummaryStore } from "@/stores/trainingSummary";
import { useUserProfileStore } from "@/stores/userProfile";
import BottomSheet from "./ui/BottomSheet.vue";

const props = defineProps<{
  progress: UserProgress;
}>();

const modelValue = defineModel<boolean>("open");

const trainingStore = useTrainingSummaryStore();
const userStore = useUserProfileStore();

// Algorithmic Difficulty: Estimated weeks to breach the next level
const gritScore = computed(() => {
  const targetWorkouts = userStore.userProfile.workoutDaysPerWeek || 3;
  const weeklyXP = targetWorkouts * 100 * props.progress.momentum;
  const xpNeeded = props.progress.xpForNextLevel - props.progress.xpIntoLevel;
  const weeks = xpNeeded / (weeklyXP || 1);
  return Math.ceil(weeks);
});

// Real Training Insights
const trainingInsights = computed(() => {
  if (trainingStore.summaries.length === 0) return null;

  const sorted = [...trainingStore.summaries].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  const latest = sorted[0];
  if (!latest) return null;

  const totalMonthlyVolume = trainingStore.summaries
    .filter((s) => s.year === latest.year && s.month === latest.month)
    .reduce((sum, s) => sum + (s.totalVolume || 0), 0);

  return {
    month: new Date(latest.year, latest.month - 1).toLocaleString("default", { month: "long" }),
    volume: totalMonthlyVolume,
    days: latest.workoutDays,
  };
});

// Personalized Performance Analysis
const performanceStatus = computed(() => {
  const m = props.progress.momentum;
  if (m > 1.1)
    return {
      status: "PEAK PERFORMANCE",
      text: trainingInsights.value
        ? `With ${trainingInsights.value.days} sessions this month, your volume is exceeding elite standards. You are operating at maximum efficiency.`
        : "Your current output is exceeding elite standards. You are operating at maximum efficiency with perfect consistency.",
      color: "text-fuchsia-400",
    };
  if (m > 0.95)
    return {
      status: "PRIME ALIGNMENT",
      text: trainingInsights.value
        ? `Maintained ${trainingInsights.value.days} sessions as planned. You are in perfect sync with your training goals.`
        : "You are in perfect sync with your training goals. Sustaining this level of discipline will yield optimal results.",
      color: "text-primary",
    };
  if (m > 0.75)
    return {
      status: "STABILIZED GROWTH",
      text: trainingInsights.value
        ? `Gained solid volume in ${trainingInsights.value.month}. Your routine is consistent, but increasing frequency would unlock more growth.`
        : "Your routine is solid and consistent. Increasing session density slightly would accelerate your progression.",
      color: "text-blue-400",
    };
  return {
    status: "REBUILDING",
    text: trainingInsights.value
      ? `With only ${trainingInsights.value.days} sessions logged in ${trainingInsights.value.month}, your consistency has dipped. Focus on re-establishing your baseline.`
      : "Your training frequency has dipped. Focus on rebuilding your baseline habit to restore your momentum.",
    color: "text-muted-foreground",
  };
});
</script>

<template>
  <BottomSheet v-model:open="modelValue" :title="progress.title">
    <div class="flex flex-col items-center gap-6 py-4">
      <!-- Large Avatar Container -->
      <div class="relative group">
        <div class="relative w-64 h-64 rounded-2xl overflow-hidden border border-white/5 bg-linear-to-b from-card to-background shadow-2xl">
          <img :src="progress.avatar" :alt="progress.title" class="w-full h-full object-cover" />
        </div>
        
        <!-- Typographic Level Overlay -->
        <div class="absolute -bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-xl bg-background/80 backdrop-blur-md border border-white/5 shadow-xl flex items-baseline gap-1">
          <span class="text-[10px] font-black uppercase tracking-tighter text-muted-foreground opacity-70">lvl</span>
          <span class="text-lg font-black italic text-primary leading-none">{{ progress.level }}</span>
        </div>
      </div>

      <!-- Performance Report -->
      <div class="w-full space-y-4 px-2">
        
        <!-- Performance Analysis Section -->
        <div class="p-5 rounded-2xl bg-linear-to-r from-card/60 to-card/20 border border-white/5 space-y-3 relative overflow-hidden">
          <div class="flex items-center justify-between">
            <h3 :class="['text-[10px] font-black uppercase tracking-[0.3em]', performanceStatus.color]">
              Status: {{ performanceStatus.status }}
            </h3>
            <Activity class="w-3 h-3 opacity-20" />
          </div>
          <p class="text-base font-medium leading-relaxed italic text-foreground/90">
            "{{ performanceStatus.text }}"
          </p>
        </div>

        <!-- Level Stats Grid -->
        <div class="grid grid-cols-2 gap-3 w-full">
          <div class="p-4 rounded-2xl bg-linear-to-r from-card/60 to-card/20 border border-white/5 flex flex-col items-center gap-1">
            <span class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Grit Score</span>
            <div class="flex items-baseline gap-1">
              <span class="text-xl font-black italic tabular-nums text-foreground">~{{ gritScore }}</span>
              <span class="text-[10px] text-muted-foreground font-bold uppercase">Weeks</span>
            </div>
            <span class="text-[8px] text-muted-foreground/40 text-center leading-tight px-1">Estimated Rank Horizon at current pace</span>
          </div>
          <div class="p-4 rounded-2xl bg-linear-to-r from-card/60 to-card/20 border border-white/5 flex flex-col items-center gap-1">
            <span class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Momentum</span>
            <div class="flex items-center gap-1">
              <Flame class="w-4 h-4 text-primary" />
              <span class="text-xl font-black italic tabular-nums text-foreground">{{ (progress.momentum * 100).toFixed(0) }}%</span>
            </div>
            <span class="text-[8px] text-muted-foreground/40 text-center leading-tight">Current training efficiency</span>
          </div>
        </div>

        <!-- Volume Valor (Real Data Integration) -->
        <div v-if="trainingInsights" class="p-5 rounded-2xl bg-linear-to-br from-primary/5 to-card/20 border border-white/5 relative overflow-hidden text-left">
          <div class="absolute top-0 right-0 p-3 opacity-10">
            <ShieldCheck class="w-12 h-12 text-primary" />
          </div>
          <div class="relative z-10">
            <p class="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-2">Performance Insight: {{ trainingInsights.month }}</p>
            <div class="flex items-center gap-4">
              <div class="flex flex-col">
                <span class="text-[9px] font-bold text-muted-foreground/60 uppercase">Monthly Volume</span>
                <span class="text-lg font-black italic text-foreground">{{ trainingInsights.volume.toLocaleString() }}<span class="text-[10px] ml-0.5 opacity-50">kg</span></span>
              </div>
              <div class="w-px h-8 bg-white/5"></div>
              <div class="flex flex-col">
                <span class="text-[9px] font-bold text-muted-foreground/60 uppercase">Active Sessions</span>
                <span class="text-lg font-black italic text-foreground">{{ trainingInsights.days }}<span class="text-[10px] ml-0.5 opacity-50">days</span></span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </BottomSheet>
</template>
