<script setup lang="ts">
import {
  Activity,
  ArrowUpRight,
  Brain,
  History,
  Info,
  ShieldCheck,
  TrendingUp,
  Zap,
} from "lucide-vue-next";
import { computed } from "vue";
import Progress from "@/components/ui/Progress.vue";
import { getLearnedMuscleMap } from "@/services/exerciseMuscleMap";
import type { UserProgress } from "@/services/leveling";
import type { MuscleGroup, VolumeLandmark } from "@/services/trainingScience";
import { calculateTrainingInsights } from "@/services/trainingScience";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";
import { useUserProfileStore } from "@/stores/userProfile";
import BottomSheet from "./ui/BottomSheet.vue";
import UiCard from "./ui/UiCard.vue";

/**
 * RANK DETAILS OVERLAY - SECTION STRUCTURE
 * =========================================
 *
 * This component displays comprehensive progress data organized in 5 intuitive sections.
 * Each section is designed for Wave 3 restructure with clear data source attribution.
 *
 * SECTION 1: RANK HERO (Rank HUD & XP Progress)
 * - Data Source: UserProgress (from leveling.ts)
 *   - avatar, level, title, progressPercent, momentum
 * - Visual: Header section (lines 200-247)
 *   - Large centered 224x224px avatar with level badge overlay
 *   - Rank title with training phase badge (DELOAD/ACCUMULATION/STABILIZATION)
 *   - XP progress bar with momentum effect glow
 *
 * SECTION 2: TRAINING MOMENTUM (Fatigue & Recovery Status)
 * - Data Source: TrainingInsights.fatigue (from trainingScience.ts)
 *   - shouldDeload, reason, weeklyTotalSets (4-week trend)
 * - Visual: Fatigue Status section (lines 250-292)
 *   - 4-week volume trend chart with color coding
 *   - Fatigue alert or optimal status badge
 *   - Momentum indicator computed from insights.fatigue
 *
 * SECTION 3: WEEKLY VOLUME (Muscle Group Volume Landmarks)
 * - Data Source: TrainingInsights.muscleGroups (from trainingScience.ts)
 *   - sets, landmark (below_MEV/at_MEV/at_MAV/above_MRV), hoursSinceLastTrained
 * - Visual: Muscle Volume grid (lines 294-325)
 *   - 2-column grid of 8 primary muscle groups
 *   - Per-group: set count, landmark bar, hours since trained
 *   - Landmark colors: red (below), yellow (maintenance), primary (optimal), orange (overreaching)
 *
 * SECTION 4: STRENGTH PROGRESS (e1RM Trends & Top Lifts)
 * - Data Source: TrainingInsights.e1rm (from trainingScience.ts)
 *   - e1rm, trend (last 4 sessions), plateau detection
 * - Visual: Force Production section (lines 327-359)
 *   - Top 3 exercises by current e1RM
 *   - Trend sparkline (mini inline chart) for each
 *   - Plateau indicator when e1RM plateaus
 *
 * SECTION 5: TRAINING JOURNEY (XP Breakdown & Career Stats)
 * - Data Source: UserProgress (from leveling.ts) + computed xpPillars
 *   - xpBreakdown: { discipline, intensity, progression, mastery }
 *   - Career stats: totalWorkoutDays, totalVolumeKg, totalSets, totalReps, journeyDurationWeeks, firstSessionDate
 * - Visual: Mastery Distribution (lines 361-387) + Career Statistics (lines 389-428)
 *   - Stacked bar showing XP pillar percentages (Discipline, Intensity, Progression, Mastery)
 *   - Career grid: Started date, Volume moved, Training Sessions, Total reps
 *   - Estimated Progress score: estimated weeks to next level
 *
 * TERMINOLOGY MAPPING (Completed)
 * ================================
 * ✓ "Combat Days" → "Training Sessions"
 * ✓ "Legacy Start" → "Started"
 * ✓ "Adaptive Readiness" → "Training Momentum"
 * ✓ "Muscle Saturation" → "Weekly Volume"
 * ✓ "Recovery Diagnostics" → "Fatigue Status"
 * ✓ "Athlete Manifesto" → Removed label
 *
 * DATA SOURCE VALIDATION
 * ======================
 * ✓ UserProgress: avatar, level, title, progressPercent, momentum, totalWorkoutDays,
 *   totalVolumeKg, totalSets, totalReps, journeyDurationWeeks, firstSessionDate, xpBreakdown
 * ✓ TrainingInsights: muscleGroups, e1rm, fatigue
 * ✓ Computed Fields: gritScore, xpPillars, trainingPhase, topMilestones, muscleStats
 *
 * TYPE SOURCES
 * ============
 * UserProgress: defined in src/services/leveling.ts (lines 71-96)
 * TrainingInsights: defined in src/services/trainingScience.ts (lines 40-44)
 * MuscleGroupInsight: defined in src/services/trainingScience.ts (lines 20-25)
 * ExerciseE1RM: defined in src/services/trainingScience.ts (lines 27-32)
 * FatigueInsight: defined in src/services/trainingScience.ts (lines 34-38)
 */

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
  const last = trend[trend.length - 1];
  const previous = trend[trend.length - 2];
  if (trend.length >= 2 && last !== undefined && previous !== undefined && last > previous) {
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
  switch (landmark) {
    case "below_MEV":
      return "Below Minimum";
    case "at_MEV":
      return "Maintenance";
    case "at_MAV":
      return "Optimal Growth";
    case "above_MRV":
      return "Overreaching";
    default:
      return "";
  }
}

const xpPillars = computed(() => {
  const { discipline, intensity, progression, mastery } = props.progress.xpBreakdown;
  const total = discipline + intensity + progression + mastery || 1;
  return [
    {
      label: "Discipline",
      value: discipline,
      percent: (discipline / total) * 100,
      color: "bg-blue-500",
    },
    {
      label: "Intensity",
      value: intensity,
      percent: (intensity / total) * 100,
      color: "bg-red-500",
    },
    {
      label: "Progression",
      value: progression,
      percent: (progression / total) * 100,
      color: "bg-primary",
    },
    { label: "Mastery", value: mastery, percent: (mastery / total) * 100, color: "bg-fuchsia-500" },
  ];
});

const formattedStartDate = computed(() => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(props.progress.firstSessionDate);
});

const formattedTotalVolume = computed(() => {
  const kg = props.progress.totalVolumeKg;
  return kg >= 1000 ? `${(kg / 1000).toFixed(1)} tons` : `${kg} kg`;
});

const momentumEffect = computed(() => {
  const r = props.progress.momentum;

  if (r < 0.7) {
    return {
      indicator: "from-blue-400 to-blue-600",
      container: "shadow-[0_0_12px_rgba(59,130,246,0.2)] animate-pulse-slow",
    };
  }

  if (r < 0.9) {
    return {
      indicator: "from-cyan-300 to-cyan-500",
      container: "shadow-[0_0_12px_rgba(34,211,238,0.2)] animate-pulse-standard",
    };
  }

  if (r <= 1.15) {
    return {
      indicator: "from-emerald-300 to-emerald-500",
      container: "shadow-[0_0_15px_rgba(52,211,153,0.3)] animate-pulse-fast",
    };
  }

  return {
    indicator: "from-fuchsia-400 to-purple-500",
    container: "shadow-[0_0_20px_rgba(192,38,211,0.4)] animate-pulse-hyper",
  };
});
</script>

<template>
  <BottomSheet v-model:open="modelValue">
    <div class="flex flex-col gap-6 pt-6 pb-12 px-2 overflow-x-hidden">
      
      <!-- Unified Status HUD -->
      <UiCard
        class="p-5 flex flex-col gap-6 border-white/10 shadow-2xl relative overflow-visible"
        data-section="rank-hero"
      >
        <!-- Background Ambient Glow -->
        <div class="absolute -top-20 -right-20 w-40 h-40 bg-primary/20 blur-[100px] rounded-full"></div>
        
        <header class="flex flex-col items-center gap-6 relative z-10 text-center py-2">
          <div class="relative group">
             <!-- Intense Backglow based on momentum -->
             <div :class="['absolute inset-0 blur-[40px] opacity-20 transition-all duration-1000', momentumEffect.indicator.includes('emerald') ? 'bg-emerald-400' : 'bg-primary']"></div>
            
            <div class="w-56 h-56 rounded-[2rem] overflow-hidden border-2 border-white/20 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)] relative z-10 transition-transform duration-500 group-hover:scale-[1.02]">
              <img :src="progress.avatar" :alt="progress.title" class="w-full h-full object-cover" />
              <div class="absolute inset-0 bg-linear-to-t from-background/60 via-transparent to-transparent"></div>
            </div>
            
            <!-- Level Badge Enhanced -->
            <div class="absolute -bottom-4 -right-4 bg-primary text-background px-5 py-2.5 rounded-2xl font-black italic shadow-[0_8px_24px_rgba(var(--color-primary-rgb),0.5)] border-2 border-white/30 text-xl leading-none z-20">
              L{{ progress.level }}
            </div>
          </div>
          
          <div class="flex flex-col items-center gap-2 relative z-10">
            <div class="flex items-center gap-3">
                <div :class="['w-2 h-2 rounded-full shadow-[0_0_8px_rgba(var(--color-primary-rgb),0.8)]', momentumEffect.indicator.includes('emerald') ? 'bg-emerald-400' : 'bg-primary']"></div>
               <span class="text-[11px] font-black uppercase tracking-[0.4em] text-muted-foreground/60 leading-none">Rank Status</span>
            </div>
            <h2 class="text-3xl font-black italic tracking-tighter uppercase leading-none drop-shadow-2xl">{{ progress.title }}</h2>
            <div class="flex items-center gap-2 mt-2">
              <span :class="['text-[11px] font-black px-4 py-1.5 rounded-xl tracking-[0.2em] border border-white/10 backdrop-blur-md', trainingPhase.bg, trainingPhase.color]">
                {{ trainingPhase.label }}
              </span>
            </div>
          </div>
        </header>

        <!-- Readiness Integrated -->
        <div class="space-y-3 relative z-10 pt-2 border-t border-white/5">
          <div class="flex justify-between items-end px-0.5">
            <div class="flex flex-col">
               <span class="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/50">Training Momentum</span>
              <span class="text-[11px] font-bold text-foreground">Peak Performance Potential</span>
            </div>
            <div class="text-right">
              <span class="text-xl font-black italic text-primary tabular-nums">{{ (progress.momentum * 100).toFixed(0) }}%</span>
            </div>
          </div>
          <Progress 
            :model-value="progress.progressPercent" 
            class="h-2 rounded-full transition-all duration-1000"
            :class="momentumEffect.container"
            :indicator-class="momentumEffect.indicator"
          />
        </div>
      </UiCard>

      <!-- Optimal Recovery Section -->
      <UiCard
        class="p-4 space-y-4 bg-linear-to-br from-card/80 to-card/40 border-white/5"
        data-section="training-momentum"
      >
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-2">
            <Activity class="w-3 h-3 text-primary/60" />
            <h3 class="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/70">Fatigue Status</h3>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <span class="text-xs font-bold text-foreground">Fatigue Load</span>
            <span class="text-[9px] text-muted-foreground uppercase tracking-tight">4-Week Volume Trend</span>
          </div>
          <div class="flex gap-1.5 items-end h-8">
            <div
              v-for="(sets, i) in insights.fatigue.weeklyTotalSets"
              :key="i"
              class="w-3 rounded-t-[2px] transition-all duration-700"
              :class="i === 3 ? 'bg-primary shadow-[0_0_8px_rgba(var(--color-primary-rgb),0.4)]' : 'bg-white/10'"
              :style="{ height: `${Math.max(15, Math.min(100, (sets / 40) * 100))}%` }"
            ></div>
          </div>
        </div>

        <div v-if="insights.fatigue.reason" class="flex gap-3 p-3 rounded-xl bg-orange-400/5 border border-orange-400/10">
          <Info class="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <p class="text-[11px] leading-relaxed text-orange-400/90 italic">
            {{ insights.fatigue.reason }}
          </p>
        </div>
        <div v-else class="flex gap-3 p-3 rounded-xl bg-emerald-400/5 border border-emerald-400/10">
          <ShieldCheck class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div class="flex flex-col gap-0.5">
            <span class="text-[10px] font-black uppercase text-emerald-400 tracking-wider">Status: Optimal</span>
            <p class="text-[11px] leading-relaxed text-emerald-400/80 italic">
              High internal capacity detect. Safe for progressive accumulation.
            </p>
          </div>
        </div>
      </UiCard>

      <!-- Muscle Symmetry Section -->
      <UiCard class="p-4 space-y-4" data-section="weekly-volume">
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-2">
            <Brain class="w-3 h-3 text-primary/60" />
            <h3 class="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/70">Weekly Volume</h3>
          </div>
          <span class="text-[8px] font-black uppercase text-muted-foreground/40 italic">Landmark-Based Analysis</span>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <UiCard v-for="stat in muscleStats" :key="stat.group" class="p-3 bg-card/40 border-white/5 flex flex-col gap-2.5 relative group overflow-hidden">
            <div class="flex justify-between items-center">
              <span class="text-[11px] font-black uppercase tracking-tight italic">{{ stat.group }}</span>
              <span class="text-[10px] font-black tabular-nums text-primary">{{ stat.sets }} sets</span>
            </div>

            <!-- Contextual Landmark Bar -->
            <div class="space-y-1.5">
              <div class="h-1 w-full bg-white/5 rounded-full overflow-hidden flex gap-0.5">
                <div class="h-full rounded-full transition-all duration-1000" :class="[landmarkColor(stat.landmark), stat.landmark === 'below_MEV' ? 'w-1/4' : stat.landmark === 'at_MEV' ? 'w-1/2' : stat.landmark === 'at_MAV' ? 'w-3/4' : 'w-full']"></div>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-[8px] font-black uppercase tracking-widest opacity-60">
                  {{ landmarkLabel(stat.landmark) }}
                </span>
                <span v-if="stat.hours !== null" class="text-[8px] font-bold opacity-30">{{ stat.hours }}h ago</span>
              </div>
            </div>
          </UiCard>
        </div>
      </UiCard>

      <!-- Force Production Section -->
      <UiCard class="overflow-hidden border-white/5" data-section="strength-progress">
        <div class="flex items-center justify-between px-5 pt-4 pb-3">
          <div class="flex items-center gap-2">
            <Zap class="w-3 h-3 text-primary/60" />
            <h3 class="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/70">Strength Milestones</h3>
          </div>
          <span class="text-[8px] font-black uppercase text-muted-foreground/40 italic">e1RM Dynamics</span>
        </div>

        <div class="divide-y divide-white/5">
          <div v-for="ex in topMilestones" :key="ex.name" class="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
            <div class="flex flex-col min-w-0">
              <span class="text-xs font-black uppercase italic tracking-tight truncate">{{ ex.name }}</span>
              <div class="flex items-center gap-2 mt-1.5">
                <TrendingUp class="w-3 h-3 text-primary/60" />
                <div class="flex items-center gap-1">
                  <span v-for="(v, idx) in ex.trend" :key="idx" :class="['text-[9px] font-mono tabular-nums', idx === ex.trend.length - 1 ? 'text-primary font-bold' : 'text-muted-foreground/50']">
                    {{ v }}{{ idx < ex.trend.length - 1 ? ' ·' : '' }}
                  </span>
                </div>
              </div>
            </div>
            <div class="flex flex-col items-end shrink-0">
              <div class="flex items-baseline gap-1">
                <span class="text-sm font-black italic tabular-nums text-primary">{{ ex.e1rm }}</span>
                <span class="text-[8px] font-black text-muted-foreground uppercase tracking-widest">kg</span>
              </div>
              <span v-if="ex.plateau" class="text-[8px] font-black text-orange-400 uppercase tracking-[0.1em] bg-orange-400/10 px-1.5 py-0.5 rounded mt-1">Plateau</span>
            </div>
          </div>
        </div>
      </UiCard>

      <!-- Training Journey Section -->
      <UiCard
        class="p-5 bg-linear-to-br from-card/40 to-background/40 border-white/5 space-y-6"
        data-section="training-journey"
      >
        <div class="flex items-center gap-2 px-1">
          <TrendingUp class="w-3 h-3 text-primary/60" />
          <h3 class="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/70">Mastery Distribution</h3>
        </div>
        <div>
          <div class="flex h-2.5 w-full rounded-full overflow-hidden mb-6 bg-white/5 shadow-inner">
            <div
              v-for="pillar in xpPillars"
              :key="pillar.label"
              class="h-full transition-all duration-1000 first:rounded-l-full last:rounded-r-full"
              :class="pillar.color"
              :style="{ width: `${pillar.percent}%` }"
            ></div>
          </div>
          <div class="grid grid-cols-2 gap-y-4 gap-x-6">
            <div v-for="pillar in xpPillars" :key="pillar.label" class="flex items-start gap-2.5">
              <div class="w-2 h-2 rounded-full mt-1 outline outline-2 outline-white/5" :class="pillar.color"></div>
              <div class="flex flex-col">
                <span class="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/50 mb-0.5">{{ pillar.label }}</span>
                <span class="text-xs font-black italic tabular-nums">{{ pillar.value.toLocaleString() }} <span class="text-[9px] opacity-40">XP</span></span>
              </div>
            </div>
          </div>
        </div>

        <div class="border-t border-white/5 pt-6 space-y-6">
          <div class="flex items-center gap-2 px-1">
            <History class="w-3 h-3 text-primary/60" />
            <h3 class="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/70">Career Statistics</h3>
          </div>
          <div class="grid grid-cols-2 gap-y-6 gap-x-8">
            <div class="space-y-1.5">
               <span class="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] block">Started</span>
              <span class="text-xs font-black italic">{{ formattedStartDate }}</span>
            </div>
            <div class="space-y-1.5 text-right">
              <span class="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] block">Volume Moved</span>
              <span class="text-xs font-black italic text-primary">{{ formattedTotalVolume }}</span>
            </div>
            <div class="space-y-1.5">
               <span class="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] block">Training Sessions</span>
              <span class="text-xs font-black italic">{{ progress.totalWorkoutDays }} Sessions</span>
            </div>
            <div class="space-y-1.5 text-right">
              <span class="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] block">Total Repetitions</span>
              <span class="text-xs font-black italic tabular-nums">{{ progress.totalSets.toLocaleString() }}</span>
            </div>
            <div class="space-y-1.5">
              <span class="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] block">Journey Duration</span>
              <span class="text-xs font-black italic">{{ progress.journeyDurationWeeks }} Weeks</span>
            </div>
          </div>

          <!-- Grit Score Integrated -->
          <div class="pt-2 border-t border-white/5 flex items-center justify-between">
            <div class="flex flex-col">
               <span class="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60">Weeks to Next Level</span>
              <span class="text-[9px] text-muted-foreground/40 italic">Estimated weeks to evolve rank</span>
            </div>
            <div class="flex items-baseline gap-1.5">
              <span class="text-[9px] font-black uppercase opacity-40">Estimated Progress</span>
              <span class="text-2xl font-black italic tracking-tighter text-primary">~{{ gritScore }}</span>
              <span class="text-[9px] font-black uppercase opacity-40">Wks</span>
            </div>
          </div>
        </div>
      </UiCard>

      <!-- Quote -->
      <p class="text-[9px] text-center text-muted-foreground/30 italic px-10 py-6 leading-relaxed uppercase tracking-widest">
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

.animate-pulse-slow {
  animation: pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.animate-pulse-standard {
  animation: pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.animate-pulse-fast {
  animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.animate-pulse-hyper {
  animation: pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite, glow-pulse 1.2s alternate infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); filter: brightness(1); }
  50% { transform: scale(1.01); filter: brightness(1.2); }
}

@keyframes glow-pulse {
  from { filter: brightness(1); }
  to { filter: brightness(1.4) saturate(1.2); }
}
</style>
