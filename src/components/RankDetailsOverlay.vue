<script setup lang="ts">
import {
  Activity,
  ArrowUpRight,
  Brain,
  Flame,
  Info,
  ShieldCheck,
  TrendingUp,
  Zap,
} from "lucide-vue-next";
import { computed } from "vue";
import { getLearnedMuscleMap } from "@/services/exerciseMuscleMap";
import type { UserProgress } from "@/services/leveling";
import type { MuscleGroup, VolumeLandmark } from "@/services/trainingScience";
import { calculateTrainingInsights } from "@/services/trainingScience";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";
import { useUserProfileStore } from "@/stores/userProfile";
import BottomSheet from "./ui/BottomSheet.vue";
import UiCard from "./ui/UiCard.vue";

const props = defineProps<{
  progress: UserProgress;
}>();

const modelValue = defineModel<boolean>("open");

const logsStore = useExerciseLogsStore();
const userStore = useUserProfileStore();

// --- Training Science Integration ---
const insights = computed(() => {
  const learnedMap = getLearnedMuscleMap();
  return calculateTrainingInsights(logsStore.exerciseLogs, new Date(), learnedMap);
});

// --- Adaptive Phase Detection ---
const trainingPhase = computed(() => {
  const { fatigue } = insights.value;
  if (fatigue.shouldDeload)
    return { label: "DELOAD PHASE", color: "text-orange-400", bg: "bg-orange-400/10" };

  const trend = fatigue.weeklyTotalSets;
  if (trend.length >= 2 && trend[trend.length - 1]! > trend[trend.length - 2]!) {
    return { label: "ACCUMULATION", color: "text-primary", bg: "bg-primary/10" };
  }
  return { label: "STABILIZATION", color: "text-blue-400", bg: "bg-blue-400/10" };
});

// --- Muscle Groups for Saturation Grid ---
const ALL_PRIMARY_GROUPS: MuscleGroup[] = [
  "Chest",
  "Back",
  "Quads",
  "Hamstrings",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Glutes",
];

const muscleStats = computed(() => {
  return ALL_PRIMARY_GROUPS.map((group) => {
    const data = insights.value.muscleGroups[group];
    return {
      group,
      sets: data?.sets ?? 0,
      landmark: data?.landmark ?? "below_MEV",
      hours: data?.hoursSinceLastTrained,
    };
  });
});

// --- Neural Efficiency (Top Milestones) ---
const topMilestones = computed(() => {
  return Object.entries(insights.value.e1rm)
    .sort(([, a], [, b]) => b.e1rm - a.e1rm)
    .slice(0, 3)
    .map(([name, data]) => ({ name, ...data }));
});

// --- Existing Meta Metrics (Repositioned) ---
const gritScore = computed(() => {
  const targetWorkouts = userStore.userProfile.workoutDaysPerWeek || 3;
  const weeklyXP = targetWorkouts * 100 * props.progress.momentum;
  const xpNeeded = props.progress.xpForNextLevel - props.progress.xpIntoLevel;
  return Math.ceil(xpNeeded / (weeklyXP || 1));
});

function landmarkColor(landmark: VolumeLandmark): string {
  switch (landmark) {
    case "below_MEV":
      return "bg-red-400/20";
    case "at_MEV":
      return "bg-yellow-400/40";
    case "at_MAV":
      return "bg-primary";
    case "above_MRV":
      return "bg-orange-500";
    default:
      return "bg-white/5";
  }
}

function landmarkLabel(landmark: VolumeLandmark): string {
  return landmark.replace("_", " ").toUpperCase();
}
</script>

<template>
  <BottomSheet v-model:open="modelValue" :title="progress.title">
    <div class="flex flex-col gap-6 py-4 px-2 max-h-[85vh] overflow-y-auto no-scrollbar">
      
      <!-- Identity Section -->
      <header class="flex flex-col items-center gap-4">
        <div class="relative">
          <div class="w-40 h-40 rounded-3xl overflow-hidden border border-white/5 shadow-2xl relative">
            <img :src="progress.avatar" :alt="progress.title" class="w-full h-full object-cover" />
            <div class="absolute inset-0 bg-linear-to-t from-background/60 to-transparent"></div>
          </div>
          <!-- Level Badge -->
          <div class="absolute -bottom-2 -right-2 bg-primary text-background px-3 py-1 rounded-lg font-black italic shadow-xl border border-white/10">
            L{{ progress.level }}
          </div>
        </div>
        
        <div class="text-center">
          <h2 class="text-2xl font-black italic tracking-tighter uppercase leading-none">{{ progress.title }}</h2>
          <div class="flex items-center justify-center gap-2 mt-2">
            <span :class="['text-[10px] font-black px-2 py-0.5 rounded-full tracking-widest', trainingPhase.bg, trainingPhase.color]">
              {{ trainingPhase.label }}
            </span>
          </div>
        </div>
      </header>

      <!-- Physiological Readiness & Fatigue -->
      <section class="space-y-3">
        <div class="flex items-center gap-2 px-1">
          <Activity class="w-3 h-3 text-muted-foreground" />
          <h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Physiological Readiness</h3>
        </div>
        <UiCard class="p-4 space-y-4 bg-linear-to-br from-card/80 to-card/40">
          <div class="flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-xs font-bold text-foreground">Fatigue Analysis</span>
              <span class="text-[10px] text-muted-foreground">Volume Trend vs. Fatigue</span>
            </div>
            <div class="flex gap-1 items-end h-8">
              <div 
                v-for="(sets, i) in insights.fatigue.weeklyTotalSets" 
                :key="i"
                class="w-3 bg-primary/20 rounded-t-sm transition-all duration-500"
                :style="{ height: `${Math.min(100, (sets / 40) * 100)}%`, backgroundColor: i === 3 ? 'var(--color-primary)' : '' }"
              ></div>
            </div>
          </div>
          
          <div v-if="insights.fatigue.reason" class="flex gap-3 p-3 rounded-xl bg-orange-400/5 border border-orange-400/10">
            <Info class="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
            <p class="text-[11px] leading-relaxed text-orange-400/90 italic">
              {{ insights.fatigue.reason }}
            </p>
          </div>
          <div v-else class="flex gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
            <ShieldCheck class="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p class="text-[11px] leading-relaxed text-primary/80 italic">
              Recovery status is optimal. High capacity for progressive accumulation.
            </p>
          </div>
        </UiCard>
      </section>

      <!-- Volume Distribution Grid -->
      <section class="space-y-3">
        <div class="flex items-center gap-2 px-1">
          <Brain class="w-3 h-3 text-muted-foreground" />
          <h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Volume Distribution</h3>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <UiCard v-for="stat in muscleStats" :key="stat.group" class="p-3 bg-card/40 border-white/5 flex flex-col gap-2">
            <div class="flex justify-between items-start">
              <span class="text-[11px] font-bold">{{ stat.group }}</span>
              <span class="text-[9px] font-black tabular-nums opacity-60">{{ stat.sets }}S</span>
            </div>
            <!-- Landmark Bar -->
            <div class="h-1.5 w-full bg-white/5 rounded-full overflow-hidden flex gap-0.5">
              <div class="h-full flex-1 rounded-full transition-all duration-700" :class="landmarkColor(stat.landmark)"></div>
            </div>
            <span class="text-[8px] font-black uppercase tracking-tighter opacity-40">
              {{ landmarkLabel(stat.landmark) }}
            </span>
          </UiCard>
        </div>
      </section>

      <!-- Performance Benchmarks -->
      <section class="space-y-3">
        <div class="flex items-center gap-2 px-1">
          <Zap class="w-3 h-3 text-muted-foreground" />
          <h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Force Production Trends</h3>
        </div>
        <UiCard class="divide-y divide-white/5 overflow-hidden">
          <div v-for="ex in topMilestones" :key="ex.name" class="p-4 flex items-center justify-between">
            <div class="flex flex-col">
              <span class="text-xs font-bold truncate max-w-[160px]">{{ ex.name }}</span>
              <div class="flex items-center gap-2 mt-1">
                <TrendingUp class="w-3 h-3 text-primary" />
                <span class="text-[10px] font-mono text-muted-foreground">{{ ex.trend.join(' · ') }}</span>
              </div>
            </div>
            <div class="flex flex-col items-end">
              <div class="flex items-baseline gap-1">
                <span class="text-sm font-black italic tabular-nums">{{ ex.e1rm }}</span>
                <span class="text-[9px] font-bold text-muted-foreground uppercase">e1rm</span>
              </div>
              <span v-if="ex.plateau" class="text-[8px] font-black text-orange-400 uppercase tracking-tighter">Plateau Detected</span>
            </div>
          </div>
        </UiCard>
      </section>

      <!-- Performance Analytics -->
      <footer class="grid grid-cols-2 gap-3 mt-2 border-t border-white/5 pt-6 pb-4">
        <div class="flex flex-col items-center">
          <div class="flex items-center gap-1.5 mb-1">
            <Flame class="w-3 h-3 text-orange-400" />
            <span class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Momentum</span>
          </div>
          <span class="text-xl font-black italic">{{ (progress.momentum * 100).toFixed(0) }}%</span>
          <p class="text-[8px] text-muted-foreground mt-1">Adherence Score</p>
        </div>
        <div class="flex flex-col items-center">
          <div class="flex items-center gap-1.5 mb-1">
            <ArrowUpRight class="w-3 h-3 text-blue-400" />
            <span class="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Grit Score</span>
          </div>
          <span class="text-xl font-black italic">~{{ gritScore }}</span>
          <p class="text-[8px] text-muted-foreground mt-1">Weeks to Next Rank</p>
        </div>
      </footer>

      <!-- Athlete Manifesto -->
      <p class="text-[10px] text-center text-muted-foreground/40 italic px-8 py-4 leading-relaxed line-clamp-2">
        "{{ progress.description }}"
      </p>

    </div>
  </BottomSheet>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>

