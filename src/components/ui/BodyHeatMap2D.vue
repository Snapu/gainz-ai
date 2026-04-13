<script setup lang="ts">
import { computed } from "vue";
import type { MuscleGroup, VolumeLandmark, MuscleGroupInsight } from "@/services/trainingScience";

const props = defineProps<{
  muscleGroups: Partial<Record<MuscleGroup, MuscleGroupInsight>>;
}>();

/** Color-coding for each stimulus landmark (Pill Backgrounds) */
function getLandmarkStyles(landmark?: VolumeLandmark): string {
  if (!landmark) return "border-white/10 bg-white/5 text-muted-foreground/60";
  switch (landmark) {
    case "below_MEV": return "border-yellow-500/20 bg-yellow-500/10 text-yellow-500/80 shadow-[0_0_10px_rgba(234,179,8,0.1)]"; // Maintenance
    case "at_MEV": return "border-emerald-500/20 bg-emerald-500/10 text-emerald-500/80 shadow-[0_0_10px_rgba(16,185,129,0.1)]"; // Progressive Minimum
    case "at_MAV": return "border-cyan-400/30 bg-cyan-400/10 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]"; // Optimal Stimulus
    case "above_MRV": return "border-red-500/40 bg-red-500/10 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-pulse"; // Recovery Limit
    default: return "border-white/10 bg-white/5 text-muted-foreground/60";
  }
}

/** Pre-defined coordinates for each muscle group on the generated blueprint 
 * Based on 100% width/height of the container. 
 * Front View: ~0-50% width | Back View: ~50-100% width
 */
const MUSCLE_COORDINATES: Record<MuscleGroup, { top: string; left: string; side?: 'L' | 'R' }> = {
  "Shoulders": { top: '23%', left: '33%', side: 'R' }, // Anchored to one side for minimalism
  "Chest": { top: '28%', left: '25%' },
  "Abs": { top: '42%', left: '25%' },
  "Biceps": { top: '38%', left: '12%', side: 'L' },
  "Quads": { top: '68%', left: '21%', side: 'L' },
  "Back": { top: '30%', left: '75%' },
  "Triceps": { top: '38%', left: '88%', side: 'R' },
  "Glutes": { top: '50%', left: '75%' },
  "Hamstrings": { top: '70%', left: '79%', side: 'R' },
  "Calves": { top: '88%', left: '75%' }
};

const activeGroups = computed(() => {
  return Object.entries(MUSCLE_COORDINATES)
    .map(([group, coords]) => ({
      name: group as MuscleGroup,
      coords,
      status: props.muscleGroups[group as MuscleGroup]
    }))
    .filter(g => g.status && g.status.sets > 0);
});
</script>

<template>
  <div class="relative w-full aspect-square max-w-[500px] mx-auto select-none overflow-hidden rounded-xl border border-white/5 bg-black/40">
    
    <!-- Anatomical Blueprint Background -->
    <img 
      src="@/assets/anatomical_blueprint.png" 
      alt="Anatomical Blueprint"
      class="absolute inset-0 w-full h-full object-contain opacity-70 grayscale contrast-125 brightness-90 mix-blend-screen pointer-events-none"
    />

    <!-- HUD Grid Overlay (Subtle Aesthetic) -->
    <div class="absolute inset-0 pointer-events-none opacity-5 z-0">
       <div class="w-full h-full bg-[linear-gradient(rgba(34,211,238,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.2)_1px,transparent_1px)] bg-[size:20px_20px]"></div>
    </div>

    <!-- DATA CALLOUTS -->
    <div 
      v-for="muscle in activeGroups" 
      :key="muscle.name"
      class="absolute transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 group transition-all duration-700"
      :style="{ top: muscle.coords.top, left: muscle.coords.left }"
    >
       <!-- Callout Anchor Line (Optional, keeping it clean for now) -->
       
       <!-- Data Pill -->
       <div 
         class="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-sm border backdrop-blur-md transition-all duration-500"
         :class="getLandmarkStyles(muscle.status?.landmark)"
       >
          <span class="text-[7px] font-black uppercase tracking-[0.25em] opacity-40 leading-none">
            {{ muscle.name }}
          </span>
          <div class="flex items-baseline gap-1">
             <span class="text-xs font-mono font-black italic tracking-tighter">{{ muscle.status?.sets }}</span>
             <span class="text-[7px] font-black uppercase opacity-20">sets</span>
          </div>
       </div>

       <!-- Position Indicator (Glow Point) -->
       <div class="absolute -inset-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" :class="[getLandmarkStyles(muscle.status?.landmark).split(' ')[0], 'bg-current opacity-5']"></div>
    </div>

    <!-- Legend Overlay -->
    <div class="absolute bottom-4 inset-x-8 flex items-center justify-between pointer-events-none">
        <div class="flex flex-col gap-1.5">
           <div class="flex items-center gap-3">
              <div class="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]"></div>
              <span class="text-[8px] font-black uppercase tracking-[0.3em] text-cyan-400/40">Optimal</span>
           </div>
           <div class="flex items-center gap-3">
              <div class="w-1.5 h-1.5 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]"></div>
              <span class="text-[8px] font-black uppercase tracking-[0.3em] text-yellow-500/40">Maintenance</span>
           </div>
        </div>
        
        <div class="flex flex-col items-end opacity-20">
           <span class="text-[7px] font-black uppercase tracking-[0.5em]">Mapping Active</span>
           <span class="text-[6px] font-mono">CODE-ANNOTATED V4.1</span>
        </div>
    </div>

    <!-- Scan Line Effect -->
    <div class="absolute inset-0 pointer-events-none z-10 scan-line"></div>
  </div>
</template>

<style scoped>
.scan-line {
  background: linear-gradient(
    to bottom,
    transparent 50%,
    rgba(0, 0, 0, 0.05) 51%,
    transparent 52%
  );
  background-size: 100% 4px;
  opacity: 0.2;
}

/* Ensure the pill font is high-performance */
.font-mono {
  font-family: 'JetBrains Mono', 'Roboto Mono', monospace;
}
</style>
