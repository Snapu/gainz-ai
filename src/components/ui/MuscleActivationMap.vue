<script setup lang="ts">
import { computed, ref } from "vue";
import type { MuscleGroup, MuscleGroupInsight, VolumeLandmark } from "@/services/trainingScience";

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
  Chest: { dot: { x: 48, y: 31 }, textAnchor: { x: 6, y: 22 }, align: "left" },
  Biceps: { dot: { x: 28, y: 39 }, textAnchor: { x: 6, y: 39 }, align: "left" },
  Abs: { dot: { x: 46, y: 44 }, textAnchor: { x: 6, y: 48 }, align: "left" },
  Quads: { dot: { x: 40, y: 64 }, textAnchor: { x: 6, y: 64 }, align: "left" },
  Shoulders: { dot: { x: 64, y: 26 }, textAnchor: { x: 94, y: 15 }, align: "right" },
};

const MUSCLE_MAP_BACK: Partial<Record<MuscleGroup, MuscleNode>> = {
  Back: { dot: { x: 52, y: 33 }, textAnchor: { x: 6, y: 25 }, align: "left" },
  Triceps: { dot: { x: 74, y: 39 }, textAnchor: { x: 94, y: 39 }, align: "right" },
  Glutes: { dot: { x: 54, y: 49 }, textAnchor: { x: 94, y: 49 }, align: "right" },
  Hamstrings: { dot: { x: 66, y: 65 }, textAnchor: { x: 94, y: 65 }, align: "right" },
  Calves: { dot: { x: 66, y: 82 }, textAnchor: { x: 94, y: 82 }, align: "right" },
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
const currentView = computed(() => views.value[currentViewIndex.value]!);

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
</script>

<template>
  <div class="flex flex-col w-full max-w-[400px] mx-auto select-none overflow-visible">
    
    <!-- Toggle -->
    <div class="flex justify-center mb-2 z-40 relative">
      <div class="inline-flex bg-muted/50 p-1 rounded-full items-center w-[240px]">
        <button 
          @click="currentViewIndex = 0" 
          :class="['flex-1 py-2 rounded-full text-[10px] uppercase tracking-widest font-black transition-colors', currentViewIndex === 0 ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground']"
        >
          Anterior
        </button>
        <button 
          @click="currentViewIndex = 1" 
          :class="['flex-1 py-2 rounded-full text-[10px] uppercase tracking-widest font-black transition-colors', currentViewIndex === 1 ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground']"
        >
          Posterior
        </button>
      </div>
    </div>

    <div class="relative w-full aspect-[1/2]">
      
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
      <div :key="'overlay-'+currentView.id" class="absolute inset-0 w-full h-full animate-in fade-in zoom-in-95 duration-500 pointer-events-none">
        
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
           
           <!-- Glowing Dot -->
           <div 
             class="absolute transform -translate-x-1/2 -translate-y-1/2 w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full border transition-all duration-700 z-10"
             :style="{ left: `${muscle.node.dot.x}%`, top: `${muscle.node.dot.y}%` }"
             :class="getDotColor(muscle.status?.landmark)"
           >
             <span 
               class="absolute inset-0 rounded-full animate-ping opacity-60"
               :class="getDotColor(muscle.status?.landmark).split(' ')[0]"
             ></span>
           </div>

           <!-- Stacked Callout HUD - Soft glass integration -->
           <div 
             class="absolute flex justify-center transform -translate-y-1/2 z-20 pointer-events-none"
             :style="getAnchorStyle(muscle.node)"
           >
              <span class="text-[10px] sm:text-[12px] font-black uppercase tracking-[0.2em] text-foreground/90 leading-none mb-0.5 sm:mb-1">
                {{ muscle.name }}
              </span>
              <span class="text-[8px] sm:text-[8.5px] font-mono text-muted-foreground uppercase tracking-[0.1em] bg-background/40 px-1 py-[1.5px] rounded backdrop-blur-md mb-0.5 whitespace-nowrap">
                {{ getJargon(muscle.status?.landmark) }}
              </span>
              <span class="text-[9.5px] sm:text-[11px] font-mono font-bold whitespace-nowrap opacity-90 mt-[1px]" :style="{ color: getLineColor(muscle.status?.landmark) }">
                {{ muscle.status?.sets || 0 }} <span class="opacity-50 font-sans text-[7.5px] sm:text-[8.5px] font-normal tracking-wide">SETS/WK</span>
              </span>
           </div>

        </template>

      </div>
    </div>
  </div>
</template>

<style scoped>
.font-mono {
  font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
}
</style>
