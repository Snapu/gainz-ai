<script setup lang="ts">
import { BarChart2, CalendarDays, CheckCircle2, Hourglass, Timer } from "lucide-vue-next";
import { computed, ref } from "vue";
import type { MuscleGroup, MuscleGroupInsight, VolumeLandmark } from "@/services/trainingScience";
import { RECOVERY_HOURS, VOLUME_LANDMARKS } from "@/services/trainingScience";
import UiBottomSheet from "./ui/UiBottomSheet.vue";
import UiSegmentedControl from "./ui/UiSegmentedControl.vue";

const props = defineProps<{
  muscleGroups: Partial<Record<MuscleGroup, MuscleGroupInsight>>;
}>();

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

// VOLUME_LANDMARKS and RECOVERY_HOURS imported from trainingScience.ts (single source of truth)

const selectedDetail = computed(() => {
  if (!selectedMuscle.value) return null;
  const name = selectedMuscle.value;
  const status = props.muscleGroups[name];
  const targets = VOLUME_LANDMARKS[name];
  const recoveryHours = RECOVERY_HOURS[name];
  const maxDisplay = targets.mrv * 1.15;
  const sets = status?.sets ?? 0;
  return {
    name,
    landmark: status?.landmark,
    sets,
    frequencyPerWeek: status?.frequencyPerWeek ?? 0,
    hoursSinceLastTrained: status?.hoursSinceLastTrained ?? null,
    recoveryReady: status?.recoveryReady ?? true,
    targets,
    recoveryHours,
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
        />
      </div>
    </div>

    <!-- Tap hint -->
    <p :class="['text-center text-[9px] text-muted-foreground/40 mb-1 tracking-wider uppercase animate-pulse duration-2000', selectedMuscle ? 'invisible' : '']">Tap a muscle for details</p>

    <div class="relative w-full h-[72vh] overflow-hidden rounded-xl">

      <!-- Scrollable map viewport -->
      <div class="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain pb-12">
        <div class="relative w-full aspect-[1/2] min-h-full">

          <!-- IMAGE LAYER (Screen blended on the stacking context root to drop the black background) -->
          <div :key="'img-'+currentView.id" class="absolute inset-0 w-full h-full animate-in fade-in zoom-in-95 duration-500 mix-blend-screen">
            <div class="absolute inset-0 overflow-hidden bg-transparent">
               <img 
                 src="@/assets/muscle_map_anime.png" 
                 class="absolute inset-y-0 w-[200%] h-full max-w-none pointer-events-none opacity-[0.25] invert transition-all duration-700 ease-in-out object-fill"
                 :class="currentView.alignImage"
                 :style="{ transform: currentView.offsetStyle }"
               />
            </div>
          </div>

          <!-- OVERLAY LAYER (Normal blending to preserve text legibility) -->
          <!-- @click deselects when tapping empty space on the map -->
          <div :key="'overlay-'+currentView.id" class="absolute inset-0 w-full h-full animate-in fade-in zoom-in-95 duration-500" @click="selectedMuscle = null">
        
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
              <span
                class="text-[10px] sm:text-[12px] font-black uppercase tracking-[0.2em] leading-none mb-0.5 sm:mb-1 transition-colors duration-200"
                :class="selectedMuscle === muscle.name ? 'text-white' : 'text-foreground/90'"
              >
                {{ muscle.name }}
              </span>
              <span class="text-[8px] sm:text-[8.5px] font-mono text-muted-foreground uppercase tracking-[0.1em] bg-background/40 px-1 py-[1.5px] rounded backdrop-blur-md mb-0.5 whitespace-nowrap">
                {{ getJargon(muscle.status?.landmark) }}
              </span>
              <span class="text-[9.5px] sm:text-[11px] font-mono font-bold whitespace-nowrap opacity-90 mt-[1px]" :style="{ color: getLineColor(muscle.status?.landmark) }">
                {{ muscle.status?.sets != null ? muscle.status.sets.toFixed(1) : '0' }} <span class="opacity-50 font-sans text-[7.5px] sm:text-[8.5px] font-normal tracking-wide">SETS/WK</span>
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
            <span class="text-base font-black uppercase tracking-widest flex-1">{{ selectedDetail.name }}</span>
            <span :class="['text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full', getLandmarkBadge(selectedDetail.landmark)]">
              {{ getJargon(selectedDetail.landmark) }}
            </span>
          </div>
        </template>

        <div v-if="selectedDetail" class="flex flex-col pb-safe">
          <!-- Volume Section -->
          <div class="px-5 pt-4 pb-4 border-b border-white/10 space-y-2">
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60">
                <BarChart2 class="w-3.5 h-3.5" />
                <span>Volume</span>
              </div>
              <span class="text-xs font-bold font-mono" :style="{ color: getLineColor(selectedDetail.landmark) }">
                {{ selectedDetail.sets.toFixed(1) }} sets/wk
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
              <!-- Current position needle -->
              <div
                class="absolute top-0 h-full w-[2px] bg-white shadow-[0_0_5px_rgba(255,255,255,0.9)] transition-all duration-500 z-10"
                :style="{ left: selectedDetail.bar.currentPct + '%' }"
              ></div>
            </div>

            <!-- Bar axis labels -->
            <div class="relative h-3.5 text-[8px] text-muted-foreground/50 font-mono select-none mt-1">
              <span class="absolute -translate-x-1/2" :style="{ left: selectedDetail.bar.mevPct + '%' }">MEV {{ selectedDetail.targets.mev }}</span>
              <span class="absolute -translate-x-1/2" :style="{ left: ((selectedDetail.bar.mavLowPct + selectedDetail.bar.mavHighPct) / 2) + '%' }">MAV {{ selectedDetail.targets.mavLow }}–{{ selectedDetail.targets.mavHigh }}</span>
              <span class="absolute -translate-x-1/2" :style="{ left: selectedDetail.bar.mrvPct + '%' }">MRV {{ selectedDetail.targets.mrv }}</span>
            </div>
          </div>

          <!-- Recovery Section -->
          <div class="px-5 pt-4 pb-4 border-b border-white/10 space-y-2">
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60">
                <Timer class="w-3.5 h-3.5" />
                <span>Recovery</span>
              </div>
              <div class="flex items-center gap-1 text-[10px] font-bold" :class="selectedDetail.recoveryReady ? 'text-green-400' : 'text-yellow-400'">
                <CheckCircle2 v-if="selectedDetail.recoveryReady" class="w-3.5 h-3.5" />
                <Hourglass v-else class="w-3.5 h-3.5" />
                <span>{{ selectedDetail.recoveryReady ? 'Ready to train' : 'Still recovering' }}</span>
              </div>
            </div>
            <template v-if="selectedDetail.hoursSinceLastTrained !== null">
              <div class="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-700"
                  :class="selectedDetail.recoveryReady ? 'bg-green-400' : 'bg-yellow-400'"
                  :style="{ width: Math.min(100, (selectedDetail.hoursSinceLastTrained / selectedDetail.recoveryHours) * 100) + '%' }"
                ></div>
              </div>
              <div class="flex justify-between text-[8.5px] text-muted-foreground/50 font-mono mt-1">
                <span>{{ selectedDetail.hoursSinceLastTrained }}h elapsed</span>
                <span>{{ selectedDetail.recoveryHours }}h needed</span>
              </div>
            </template>
            <p v-else class="text-[9px] text-muted-foreground/40 italic">Not trained recently</p>
          </div>

          <!-- Frequency Row -->
          <div class="flex items-center justify-between px-5 py-4 pb-8">
            <div class="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60">
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

  </div>
</template>

<style scoped>
.font-mono {
  font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
}
</style>
