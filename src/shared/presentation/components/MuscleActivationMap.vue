<script setup lang="ts">
import {
  BarChart2,
  CalendarDays,
  CheckCircle2,
  Flame,
  Hourglass,
  Sparkles,
  Timer,
} from "@lucide/vue";
import { computed, ref } from "vue";
import { useMetricsStore } from "@/modules/profile/presentation";
import {
  type MuscleGroup,
  type MuscleGroupInsight,
  RECOVERY_HOURS,
  VOLUME_LANDMARKS,
  type VolumeLandmark,
} from "@/modules/trainingInsights/presentation";
import UiBottomSheet from "./ui/UiBottomSheet.vue";
import UiSegmentedControl from "./ui/UiSegmentedControl.vue";

const props = defineProps<{
  muscleGroups: Partial<Record<MuscleGroup, MuscleGroupInsight>>;
}>();

const metricsStore = useMetricsStore();

const BASE = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL.slice(0, -1)
  : import.meta.env.BASE_URL;
const MUSCLE_MAP_IMAGE_SRC = `${BASE}/assets/muscle/muscle-map-anime.png`;

function getDotColor(landmark?: VolumeLandmark): string {
  if (!landmark) return "bg-white/30 border-white/50";
  switch (landmark) {
    case "below_MEV":
      return "bg-yellow-500 border-yellow-300 shadow-[0_0_10px_rgba(234,179,8,1)]";
    case "at_MEV":
      return "bg-emerald-500 border-emerald-300 shadow-[0_0_10px_rgba(16,185,129,1)]";
    case "at_MAV":
      return "bg-cyan-400 border-cyan-200 shadow-[0_0_15px_rgba(34,211,238,1)]";
    case "approaching_MRV":
      return "bg-orange-500 border-orange-300 shadow-[0_0_15px_rgba(249,115,22,1)]";
    case "above_MRV":
      return "bg-red-500 border-red-300 shadow-[0_0_20px_rgba(239,68,68,1)] animate-pulse";
    default:
      return "bg-white/30 border-white/50";
  }
}

function getLineColor(landmark?: VolumeLandmark): string {
  if (!landmark) return "rgba(255,255,255,0.25)";
  switch (landmark) {
    case "below_MEV":
      return "#eab308";
    case "at_MEV":
      return "#10b981";
    case "at_MAV":
      return "#22d3ee";
    case "approaching_MRV":
      return "#f97316";
    case "above_MRV":
      return "#ef4444";
    default:
      return "rgba(255,255,255,0.25)";
  }
}

function getJargon(landmark?: VolumeLandmark): string {
  switch (landmark) {
    case "below_MEV":
      return "Maintenance";
    case "at_MEV":
      return "Minimum Effective";
    case "at_MAV":
      return "Optimal Hypertrophy";
    case "approaching_MRV":
      return "Near Max Recovery";
    case "above_MRV":
      return "Overreaching";
    default:
      return "Under-Stimulated";
  }
}

interface MuscleNode {
  dot: { x: number; y: number };
  textAnchor: { x: number; y: number };
  align: "left" | "right";
}

// X coordinates mapped mathematically for 200% width cropped halves

const MUSCLE_MAP_FRONT: Partial<Record<MuscleGroup, MuscleNode>> = {
  Chest: { dot: { x: 48, y: 29 }, textAnchor: { x: 0, y: 22 }, align: "left" },
  Biceps: { dot: { x: 28, y: 35 }, textAnchor: { x: 0, y: 35 }, align: "left" },
  Abs: { dot: { x: 46, y: 44 }, textAnchor: { x: 0, y: 48 }, align: "left" },
  Quads: { dot: { x: 40, y: 64 }, textAnchor: { x: 0, y: 64 }, align: "left" },
  Shoulders: { dot: { x: 64, y: 24 }, textAnchor: { x: 100, y: 15 }, align: "right" },
};

const MUSCLE_MAP_BACK: Partial<Record<MuscleGroup, MuscleNode>> = {
  Back: { dot: { x: 52, y: 33 }, textAnchor: { x: 0, y: 25 }, align: "left" },
  Triceps: { dot: { x: 75, y: 35 }, textAnchor: { x: 100, y: 32 }, align: "right" },
  Glutes: { dot: { x: 54, y: 49 }, textAnchor: { x: 100, y: 49 }, align: "right" },
  Hamstrings: { dot: { x: 66, y: 65 }, textAnchor: { x: 100, y: 65 }, align: "right" },
  Calves: { dot: { x: 64, y: 80 }, textAnchor: { x: 100, y: 82 }, align: "right" },
};

const views = computed(() => {
  const front = Object.entries(MUSCLE_MAP_FRONT).map(([group, node]) => ({
    name: group as MuscleGroup,
    node,
    status: props.muscleGroups[group as MuscleGroup],
  }));
  const back = Object.entries(MUSCLE_MAP_BACK).map(([group, node]) => ({
    name: group as MuscleGroup,
    node,
    status: props.muscleGroups[group as MuscleGroup],
  }));

  return [
    {
      id: "front-view",
      alignImage: "left-0",
      offsetStyle: "translateX(-1.5%)",
      muscles: front,
    },
    {
      id: "back-view",
      alignImage: "right-0",
      offsetStyle: "translateX(1.5%)",
      muscles: back,
    },
  ];
});

const currentViewIndex = ref(0);
const viewOptions = [
  { id: 0, label: "Anterior" },
  { id: 1, label: "Posterior" },
] as const;

const currentView = computed(() => views.value[currentViewIndex.value]!);
const isMapImageLoaded = ref(false);

const isDetailOpen = computed({
  get: () => selectedMuscle.value !== null,
  set: (val) => {
    if (!val) selectedMuscle.value = null;
  },
});

function getAnchorStyle(node: MuscleNode) {
  if (node.align === "right") {
    return {
      right: `${100 - node.textAnchor.x}%`,
      top: `${node.textAnchor.y}%`,
      textAlign: "right" as const,
      flexDirection: "column" as const,
      alignItems: "flex-end" as const,
    };
  } else {
    return {
      left: `${node.textAnchor.x}%`,
      top: `${node.textAnchor.y}%`,
      textAlign: "left" as const,
      flexDirection: "column" as const,
      alignItems: "flex-start" as const,
    };
  }
}

// ─── Interactivity ───────────────────────────────────────────────────────────

const selectedMuscle = ref<MuscleGroup | null>(null);

function toggleMuscle(name: MuscleGroup) {
  selectedMuscle.value = selectedMuscle.value === name ? null : name;
}

// VOLUME_LANDMARKS and RECOVERY_HOURS imported from trainingInsights domain (single source of truth)

const selectedDetail = computed(() => {
  if (!selectedMuscle.value) return null;
  const name = selectedMuscle.value;
  const status = props.muscleGroups[name];
  const targets = VOLUME_LANDMARKS[name];
  const metric = metricsStore.metrics[name];
  const recoveryHours = status?.recoveryHours ?? RECOVERY_HOURS[name];
  const maxDisplay = targets.mrv * 1.15;
  const sets = status?.sets ?? 0;

  const personalMAVPct = metric?.personalMAV
    ? Math.min((metric.personalMAV / maxDisplay) * 100, 100)
    : null;
  const personalMRVPct = metric?.personalMRV
    ? Math.min((metric.personalMRV / maxDisplay) * 100, 100)
    : null;

  return {
    name,
    landmark: status?.landmark,
    sets,
    isoWeekSets: status?.isoWeekSets ?? 0,
    frequencyPerWeek: status?.frequencyPerWeek ?? 0,
    hoursSinceLastTrained: status?.hoursSinceLastTrained ?? null,
    recoveryReady: status?.recoveryReady ?? true,
    targets,
    recoveryHours,
    flags: {
      personalMAV: metric?.personalMAV ?? null,
      personalMRV: metric?.personalMRV ?? null,
      personalMAVPct,
      personalMRVPct,
    },
    bar: {
      mevPct: (targets.mev / maxDisplay) * 100,
      mavLowPct: (targets.mavLow / maxDisplay) * 100,
      mavHighPct: (targets.mavHigh / maxDisplay) * 100,
      mrvPct: (targets.mrv / maxDisplay) * 100,
      currentPct: Math.min((sets / maxDisplay) * 100, 100),
    },
  };
});

function getLandmarkBadge(landmark?: VolumeLandmark): string {
  if (!landmark) return "bg-white/20 text-white/60";
  switch (landmark) {
    case "below_MEV":
      return "bg-yellow-500/20 text-yellow-300";
    case "at_MEV":
      return "bg-emerald-500/20 text-emerald-300";
    case "at_MAV":
      return "bg-cyan-400/20 text-cyan-300";
    case "approaching_MRV":
      return "bg-orange-500/20 text-orange-300";
    case "above_MRV":
      return "bg-red-500/20 text-red-300";
    default:
      return "bg-white/20 text-white/60";
  }
}
</script>

<template>
  <div class="flex flex-col w-full max-w-[400px] mx-auto select-none overflow-visible">
    
    <!-- Toggle -->
    <div class="flex justify-center mb-2 z-40 relative px-4">
      <div class="w-full max-w-[240px]">
        <UiSegmentedControl
          :options="viewOptions"
          v-model="currentViewIndex"
          variant="secondary"
        />
      </div>
    </div>

    <!-- Tap hint -->
    <p :class="['text-center text-xs text-muted-foreground/40 mb-1 tracking-wider uppercase animate-pulse duration-300', selectedMuscle ? 'invisible' : '']">Tap a muscle for details</p>

    <div class="relative w-full aspect-[1/1.85] overflow-hidden rounded-xl">
      <div class="absolute inset-0 w-full h-full">

          <!-- IMAGE LAYER (Screen blended on the stacking context root to drop the black background) -->
          <div :key="'img-'+currentView.id" class="absolute inset-0 w-full h-full animate-in fade-in zoom-in-95 duration-300 mix-blend-screen">
            <div class="absolute inset-0 overflow-hidden bg-transparent">
               <img 
                 :src="MUSCLE_MAP_IMAGE_SRC" 
                 loading="eager"
                 fetchpriority="high"
                 class="absolute inset-y-0 w-[200%] h-full max-w-none pointer-events-none opacity-[0.25] invert transition-all duration-300 ease-in-out object-fill"
                 :class="currentView.alignImage"
                 :style="{ transform: currentView.offsetStyle }"
                 @load="isMapImageLoaded = true"
                 @error="isMapImageLoaded = true"
               />
            </div>
          </div>

          <!-- OVERLAY LAYER (Normal blending to preserve text legibility) -->
          <!-- @click deselects when tapping empty space on the map -->
          <div
            :key="'overlay-'+currentView.id"
            class="absolute inset-0 w-full h-full transition-opacity duration-200"
            :class="isMapImageLoaded ? 'opacity-100' : 'opacity-0 pointer-events-none'"
            @click="selectedMuscle = null"
          >
        
        <!-- SVG Overlay for Connecting Lines -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
           <line 
             v-for="muscle in currentView.muscles" 
             :key="'line-'+muscle.name"
             :x1="muscle.node.dot.x" 
             :y1="muscle.node.dot.y" 
             :x2="muscle.node.textAnchor.x" 
             :y2="muscle.node.textAnchor.y" 
             :stroke="getLineColor(muscle.status?.landmark)" 
             stroke-width="0.15" 
             stroke-dasharray="1.5, 2.5"
             class="opacity-60"
           />
        </svg>

        <!-- DOTS & TEXT LABELS -->
        <template v-for="muscle in currentView.muscles" :key="muscle.name">
           
           <!-- Glowing Dot — enlarged tap target (w-7 h-7 transparent wrapper) -->
           <div
             class="absolute transform -translate-x-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center cursor-pointer z-10"
             :style="{ left: `${muscle.node.dot.x}%`, top: `${muscle.node.dot.y}%` }"
             @click.stop="toggleMuscle(muscle.name)"
           >
             <div
               class="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full border transition-all duration-300"
               :class="[
                 getDotColor(muscle.status?.landmark),
                 selectedMuscle === muscle.name ? 'scale-[2.2]' : ''
               ]"
             >
               <span
                 class="absolute inset-0 rounded-full animate-ping opacity-60"
                 :class="getDotColor(muscle.status?.landmark).split(' ')[0]"
               ></span>
             </div>
           </div>

           <!-- Stacked Callout HUD — tappable -->
           <div
             class="absolute flex justify-center transform -translate-y-1/2 z-20 cursor-pointer transition-opacity duration-200"
             :class="selectedMuscle && selectedMuscle !== muscle.name ? 'opacity-40' : 'opacity-100'"
             :style="getAnchorStyle(muscle.node)"
             @click.stop="toggleMuscle(muscle.name)"
           >
              <div class="flex items-center gap-1.5 mb-1 sm:mb-1.5">
                <span
                  class="text-xs sm:text-sm font-bold uppercase tracking-widest leading-none transition-colors duration-200"
                  :class="selectedMuscle === muscle.name ? 'text-white' : 'text-foreground/90'"
                >
                  {{ muscle.name }}
                </span>
                <Hourglass v-if="muscle.status && !muscle.status.recoveryReady" class="w-3 h-3 text-yellow-500 drop-shadow-md" />
              </div>
              <div class="flex items-center gap-1.5 mb-1 whitespace-nowrap">
                <span class="text-[9px] sm:text-[10px] font-mono text-muted-foreground uppercase tracking-wider bg-white/5 border border-white/10 px-1.5 py-[2px] rounded">
                  {{ getJargon(muscle.status?.landmark) }}
                </span>
              </div>
              <span class="text-xs sm:text-sm font-mono font-bold whitespace-nowrap opacity-90 mt-[2px]" :style="{ color: getLineColor(muscle.status?.landmark) }">
                {{ muscle.status?.isoWeekSets != null ? muscle.status.isoWeekSets.toFixed(0) : '0' }} <span class="opacity-50 font-sans text-[10px] sm:text-xs font-medium tracking-wide">SETS/WK</span>
              </span>
           </div>

          </template>

          </div>
        </div>
      </div>

      <!-- ─── Detail Overlay (BottomSheet) ──────────────── -->
      <UiBottomSheet v-model:open="isDetailOpen" :hide-overlay="true" :modal="false" contentClass="p-0 gap-0">
        <template #header>
          <!-- Header: name + landmark badge -->
          <div v-if="selectedDetail" class="flex items-center gap-2 px-5 pt-6 pb-4 border-b border-white/10">
            <span class="text-base font-bold uppercase tracking-widest flex-1">{{ selectedDetail.name }}</span>
            <span :class="['text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', getLandmarkBadge(selectedDetail.landmark)]">
              {{ getJargon(selectedDetail.landmark) }}
            </span>
          </div>
        </template>

        <div v-if="selectedDetail" class="flex flex-col pb-safe">
          <!-- Volume Section -->
          <div class="px-5 pt-4 pb-4 border-b border-white/10 space-y-2">
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
                <BarChart2 class="w-3.5 h-3.5" />
                <span>Volume</span>
              </div>
              <span class="text-xs font-bold font-mono" :style="{ color: getLineColor(selectedDetail.landmark) }">
                {{ selectedDetail.isoWeekSets.toFixed(0) }} sets/wk
              </span>
            </div>

            <!-- Segmented Volume Bar -->
            <div class="relative h-2.5 rounded-full overflow-hidden flex bg-white/5 border border-white/5">
              <!-- Zone: below MEV -->
              <div class="h-full bg-white/10" :style="{ width: selectedDetail.bar.mevPct + '%' }"></div>
              <!-- Zone: MEV → mavLow -->
              <div class="h-full bg-emerald-500/30 shadow-[inset_0_0_8px_rgba(16,185,129,0.4)] border-r border-emerald-500/20" :style="{ width: (selectedDetail.bar.mavLowPct - selectedDetail.bar.mevPct) + '%' }"></div>
              <!-- Zone: MAV range (optimal) -->
              <div class="h-full bg-cyan-400/30 shadow-[inset_0_0_8px_rgba(34,211,238,0.4)] border-r border-cyan-400/20" :style="{ width: (selectedDetail.bar.mavHighPct - selectedDetail.bar.mavLowPct) + '%' }"></div>
              <!-- Zone: approaching MRV -->
              <div class="h-full bg-orange-400/30 shadow-[inset_0_0_8px_rgba(251,146,60,0.4)] border-r border-orange-400/20" :style="{ width: (selectedDetail.bar.mrvPct - selectedDetail.bar.mavHighPct) + '%' }"></div>
              <!-- Zone: above MRV -->
              <div class="h-full bg-red-500/30 shadow-[inset_0_0_8px_rgba(239,68,68,0.4)]" :style="{ width: (100 - selectedDetail.bar.mrvPct) + '%' }"></div>
              
              <!-- Personal Growth Zone Illumination -->
              <div v-if="selectedDetail.flags.personalMAVPct !== null" class="absolute top-0 bottom-0 bg-cyan-400/20 shadow-[inset_0_0_10px_rgba(34,211,238,0.6)] z-[5]" :style="{ left: selectedDetail.flags.personalMAVPct + '%', right: (100 - (selectedDetail.flags.personalMRVPct ?? 100)) + '%' }"></div>
              
              <!-- Current position needle -->
              <div
                class="absolute top-0 h-full w-[2px] bg-white shadow-[0_0_5px_rgba(255,255,255,0.9)] transition-all duration-300 z-10"
                :style="{ left: selectedDetail.bar.currentPct + '%' }"
              ></div>
              
              <!-- Personal MAV Flag -->
              <div v-if="selectedDetail.flags.personalMAVPct !== null" class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 pointer-events-none" :style="{ left: selectedDetail.flags.personalMAVPct + '%' }">
                <Sparkles class="w-3.5 h-3.5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)] fill-cyan-400/20" />
              </div>
              
              <!-- Personal MRV Flag -->
              <div v-if="selectedDetail.flags.personalMRVPct !== null" class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 pointer-events-none" :style="{ left: selectedDetail.flags.personalMRVPct + '%' }">
                <Flame class="w-3.5 h-3.5 text-red-500 drop-shadow-[0_0_4px_rgba(239,68,68,0.8)] animate-pulse fill-red-500/20" />
              </div>
            </div>

            <!-- Bar axis labels -->
            <div class="relative h-3.5 text-xs text-muted-foreground/50 font-mono select-none mt-1">
              <span class="absolute -translate-x-1/2" :style="{ left: selectedDetail.bar.mevPct + '%' }">MEV {{ selectedDetail.targets.mev }}</span>
              <span class="absolute -translate-x-1/2" :style="{ left: ((selectedDetail.bar.mavLowPct + selectedDetail.bar.mavHighPct) / 2) + '%' }">MAV {{ selectedDetail.targets.mavLow }}–{{ selectedDetail.targets.mavHigh }}</span>
              <span class="absolute -translate-x-1/2" :style="{ left: selectedDetail.bar.mrvPct + '%' }">MRV {{ selectedDetail.targets.mrv }}</span>
            </div>
          </div>

          <!-- Recovery Section -->
          <div class="px-5 pt-4 pb-4 border-b border-white/10 space-y-2">
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
                <Timer class="w-3.5 h-3.5" />
                <span>Recovery</span>
              </div>
              <div class="flex items-center gap-1 text-xs font-bold" :class="selectedDetail.recoveryReady ? 'text-green-400' : 'text-yellow-400'">
                <CheckCircle2 v-if="selectedDetail.recoveryReady" class="w-3.5 h-3.5" />
                <Hourglass v-else class="w-3.5 h-3.5" />
                <span>{{ selectedDetail.recoveryReady ? 'Ready to train' : 'Still recovering' }}</span>
              </div>
            </div>
            <template v-if="selectedDetail.hoursSinceLastTrained !== null">
              <div class="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-300"
                  :class="selectedDetail.recoveryReady ? 'bg-green-400' : 'bg-yellow-400'"
                  :style="{ width: Math.min(100, (selectedDetail.hoursSinceLastTrained / selectedDetail.recoveryHours) * 100) + '%' }"
                ></div>
              </div>
              <div class="flex justify-between text-xs text-muted-foreground/50 font-mono mt-1">
                <template v-if="!selectedDetail.recoveryReady">
                  <span class="text-yellow-400/80">{{ Math.max(0, Math.round(selectedDetail.recoveryHours - selectedDetail.hoursSinceLastTrained)) }}h remaining</span>
                  <span>{{ Math.round(selectedDetail.recoveryHours) }}h target</span>
                </template>
                <template v-else>
                  <span class="text-green-400/80">Recovered</span>
                  <span>{{ Math.round(selectedDetail.hoursSinceLastTrained) }}h elapsed</span>
                </template>
              </div>
            </template>
            <p v-else class="text-xs text-muted-foreground/40 italic">Not trained recently</p>
          </div>

          <!-- Frequency Row -->
          <div class="flex items-center justify-between px-5 py-4 pb-8">
            <div class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
              <CalendarDays class="w-3.5 h-3.5" />
              <span>Frequency</span>
            </div>
            <span class="text-xs font-bold font-mono text-foreground/80">
              {{ selectedDetail.frequencyPerWeek > 0 ? selectedDetail.frequencyPerWeek + 'x / week' : 'Not yet trained' }}
            </span>
          </div>

        </div>
      </UiBottomSheet>

  </div>
</template>

<style scoped>
.font-mono {
  font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
}
</style>
