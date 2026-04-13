<script setup lang="ts">
import { computed } from "vue";
import type { MuscleGroup, VolumeLandmark, MuscleGroupInsight } from "@/services/trainingScience";

const props = defineProps<{
  muscleGroups: Partial<Record<MuscleGroup, MuscleGroupInsight>>;
}>();

/** Color-coding for each stimulus landmark */
function getLandmarkColor(landmark?: VolumeLandmark): string {
  if (!landmark) return "fill-white/5";
  switch (landmark) {
    case "below_MEV": return "fill-yellow-500/40"; // Maintenance
    case "at_MEV": return "fill-emerald-500/40"; // Progressive Minimum
    case "at_MAV": return "fill-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]"; // Optimal Stimulus
    case "above_MRV": return "fill-red-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.8)] animate-pulse"; // Recovery Limit
    default: return "fill-white/5";
  }
}

/** Get stimulus data for a group, or default to zeroed entry */
function getGroupStatus(group: MuscleGroup) {
  return props.muscleGroups[group] ?? { sets: 0, landmark: "below_MEV" as const };
}

/** SVG Human Body Paths (Stylized Blueprint) 
 * Simplified shapes for anterior (front) and posterior (back)
 */
</script>

<template>
  <div class="flex flex-col items-center gap-12 py-8 select-none">
    
    <!-- Unified Container for Two Views -->
    <div class="flex flex-col sm:flex-row items-center justify-center gap-16 w-full max-w-[400px]">
      
      <!-- ANTERIOR (FRONT) VIEW -->
      <div class="relative group">
        <span class="absolute -top-8 inset-x-0 text-center text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/30">Anterior</span>
        <svg viewBox="0 0 100 200" class="w-28 h-56 transition-all duration-700">
          <!-- Stylized Skeleton / Base -->
          <path d="M50,10 L50,190" stroke="white" stroke-width="0.5" stroke-opacity="0.1" stroke-dasharray="2,2" />
          
          <!-- Head/Neck (Base) -->
          <circle cx="50" cy="15" r="8" fill="transparent" stroke="white" stroke-width="0.5" stroke-opacity="0.1" />

          <!-- Shoulders -->
          <path 
            :class="getLandmarkColor(getGroupStatus('Shoulders').landmark)"
            d="M30,35 Q35,30 50,30 Q65,30 70,35 L75,45 Q70,55 50,55 Q30,55 25,45 Z" 
            class="transition-all duration-700 stroke-white/5 stroke-[0.5]"
          />

          <!-- Chest -->
          <path 
            :class="getLandmarkColor(getGroupStatus('Chest').landmark)"
            d="M32,58 Q50,55 68,58 L68,80 Q50,85 32,80 Z" 
            class="transition-all duration-700 stroke-white/5 stroke-[0.5]"
          />

          <!-- Biceps -->
          <path 
            :class="getLandmarkColor(getGroupStatus('Biceps').landmark)"
            d="M23,55 Q18,70 20,90 L28,90 Q30,70 25,55 Z M77,55 Q82,70 80,90 L72,90 Q70,70 75,55 Z" 
            class="transition-all duration-700 stroke-white/5 stroke-[0.5]"
          />

          <!-- Abs -->
          <path 
            :class="getLandmarkColor(getGroupStatus('Abs').landmark)"
            d="M35,85 Q50,85 65,85 L65,115 Q50,120 35,115 Z" 
            class="transition-all duration-700 stroke-white/5 stroke-[0.5]"
          />

          <!-- Quads -->
          <path 
            :class="getLandmarkColor(getGroupStatus('Quads').landmark)"
            d="M30,125 Q48,125 48,125 L45,170 L30,170 Z M70,125 Q52,125 52,125 L55,170 L70,170 Z" 
            class="transition-all duration-700 stroke-white/5 stroke-[0.5]"
          />
        </svg>
        
        <!-- Anterior Annotations -->
        <div class="hidden group-hover:block pointer-events-none">
           <!-- Potential for hovering callouts here if mobile-friendly -->
        </div>
      </div>

      <!-- POSTERIOR (BACK) VIEW -->
      <div class="relative group">
        <span class="absolute -top-8 inset-x-0 text-center text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/30">Posterior</span>
        <svg viewBox="0 0 100 200" class="w-28 h-56 transition-all duration-700">
           <!-- Head (Back) -->
          <circle cx="50" cy="15" r="8" fill="transparent" stroke="white" stroke-width="0.5" stroke-opacity="0.1" />

          <!-- Upper Back (Traps/Delts focus) -->
          <path 
            :class="getLandmarkColor(getGroupStatus('Shoulders').landmark)"
            d="M30,35 Q50,25 70,35 L75,45 Q50,45 25,45 Z" 
            class="transition-all duration-700 stroke-white/5 stroke-[0.5] opacity-40"
          />

          <!-- Back (Lats) -->
          <path 
            :class="getLandmarkColor(getGroupStatus('Back').landmark)"
            d="M30,48 Q50,45 70,48 L65,95 Q50,105 35,95 Z" 
            class="transition-all duration-700 stroke-white/5 stroke-[0.5]"
          />

          <!-- Triceps -->
          <path 
            :class="getLandmarkColor(getGroupStatus('Triceps').landmark)"
            d="M20,55 Q15,75 18,95 L25,95 Q25,75 25,55 Z M80,55 Q85,75 82,95 L75,95 Q75,75 75,55 Z" 
            class="transition-all duration-700 stroke-white/5 stroke-[0.5]"
          />

          <!-- Glutes -->
          <path 
            :class="getLandmarkColor(getGroupStatus('Glutes').landmark)"
            d="M30,105 Q50,100 70,105 L72,125 Q50,130 28,125 Z" 
            class="transition-all duration-700 stroke-white/5 stroke-[0.5]"
          />

          <!-- Hamstrings -->
          <path 
            :class="getLandmarkColor(getGroupStatus('Hamstrings').landmark)"
            d="M30,130 Q48,130 48,130 L45,175 L30,175 Z M70,130 Q52,130 52,130 L55,175 L70,175 Z" 
            class="transition-all duration-700 stroke-white/5 stroke-[0.5]"
          />

          <!-- Calves -->
          <path 
            :class="getLandmarkColor(getGroupStatus('Calves').landmark)"
            d="M32,180 Q45,180 45,180 L43,195 L32,195 Z M68,180 Q55,180 55,180 L57,195 L68,195 Z" 
            class="transition-all duration-700 stroke-white/5 stroke-[0.5]"
          />
        </svg>
      </div>

    </div>

    <!-- Data Legend (Minimalist Annotations) -->
    <div class="grid grid-cols-2 gap-x-12 gap-y-3 w-full px-4 max-w-[400px]">
       <div 
         v-for="group in ALL_PRIMARY_GROUPS" 
         :key="group"
         class="flex items-center justify-between py-1.5 border-b border-white/5"
       >
         <div class="flex items-center gap-2">
            <div 
              class="w-1.5 h-1.5 rounded-full" 
              :class="[getLandmarkColor(getGroupStatus(group).landmark).replace('fill-', 'bg-')]"
            ></div>
            <span class="text-[10px] font-black uppercase tracking-widest text-muted-foreground italic">{{ group }}</span>
         </div>
         <span class="text-[11px] font-mono font-bold text-foreground">{{ getGroupStatus(group).sets }} <span class="opacity-20 text-[9px] font-sans">S</span></span>
       </div>
    </div>
  </div>
</template>
