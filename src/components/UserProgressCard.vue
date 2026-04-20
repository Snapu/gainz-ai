<script setup lang="ts">
import { ChevronRight } from "lucide-vue-next";
import { computed } from "vue";
import UiCard from "@/components/ui/UiCard.vue";
import type { UserProgress } from "@/services/leveling";
import type { SystemicPhase, TrainingInsights } from "@/services/trainingScience";

const props = defineProps<{
  progress: UserProgress;
  insights: TrainingInsights;
}>();

defineEmits<(e: "click") => void>();

const PHASE_THEME: Record<SystemicPhase, { 
  textClass: string; 
  accentColor: string;
  glowClass: string;
  iconClass: string;
}> = {
  Deload: { 
    textClass: "text-orange-400 font-bold",
    accentColor: "#fb923c",
    glowClass: "shadow-[0_0_15px_rgba(251,146,60,0.3)]",
    iconClass: "bg-orange-500/20 text-orange-400"
  },
  Build: { 
    textClass: "text-primary font-bold drop-shadow-[0_0_8px_rgba(var(--primary),0.5)]",
    accentColor: "rgb(var(--primary))",
    glowClass: "shadow-[0_0_20px_rgba(var(--primary),0.4)]",
    iconClass: "bg-primary/20 text-primary"
  },
  Maintain: { 
    textClass: "text-cyan-400 font-bold drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]",
    accentColor: "#22d3ee",
    glowClass: "shadow-[0_0_15px_rgba(34,211,238,0.3)]",
    iconClass: "bg-cyan-500/20 text-cyan-400"
  },
  Inactive: { 
    textClass: "text-muted-foreground",
    accentColor: "currentColor",
    glowClass: "shadow-none",
    iconClass: "bg-muted/20 text-muted-foreground"
  },
};

const phaseTheme = computed(() => PHASE_THEME[props.insights.phase]);

// Circumference of level circle (r=18)
const circumference = 2 * Math.PI * 18;
const strokeDashoffset = computed(() => 
  circumference - (props.progress.progressPercent / 100) * circumference
);
</script>

<template>
  <UiCard 
    as="button"
    @click="$emit('click')"
    class="w-[calc(100%-2rem)] text-left aspect-[5/4] border-white/10 shadow-2xl active:scale-[0.97] outline-none group hover:border-primary/50 block mx-4 mt-4 mb-0 relative overflow-hidden transition-all duration-500 rounded-[2rem] isolate ring-1 ring-white/10"
  >
    <!-- Background Image with Parallax-like scaling -->
    <img 
      :src="progress.avatar" 
      :alt="progress.title" 
      class="absolute inset-0 w-full h-full object-cover object-top z-[-2] group-hover:scale-110 transition-transform duration-1000 ease-out brightness-[0.7] group-hover:brightness-[0.8]" 
    />
    
    <!-- Sophisticated Gradient Overlays -->
    <div class="absolute inset-0 z-[-1] bg-linear-to-b from-black/80 via-transparent to-black/95"></div>
    <div class="absolute inset-0 z-[-1] bg-linear-to-tr from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>

    <!-- Micro-UI Elements: Corner Brackets -->
    <div class="absolute top-4 left-4 w-4 h-4 border-t border-l border-white/20 rounded-tl-sm pointer-events-none"></div>
    <div class="absolute top-4 right-4 w-4 h-4 border-t border-r border-white/20 rounded-tr-sm pointer-events-none"></div>
    <div class="absolute bottom-4 left-4 w-4 h-4 border-b border-l border-white/20 rounded-bl-sm pointer-events-none"></div>
    <div class="absolute bottom-4 right-4 w-4 h-4 border-b border-r border-white/20 rounded-br-sm pointer-events-none"></div>

    <!-- Main Content -->
    <div class="relative z-10 flex flex-col justify-between h-full p-6">
      
      <!-- TOP SECTION: Rank & Level Badge -->
      <div class="flex items-start justify-between w-full">
        <div class="flex flex-col gap-0.5">
          <span class="text-[10px] font-black tracking-[0.2em] uppercase text-white/40 drop-shadow-sm mb-1">
            Current Rank
          </span>
          <h2 class="text-2xl font-black tracking-tight text-white drop-shadow-2xl leading-none">
            {{ progress.title }}
          </h2>
          <div class="flex items-center gap-2 mt-2">
            <div class="h-[1px] w-6 bg-primary/50"></div>
            <span class="text-[10px] font-medium tracking-wider text-white/60 uppercase italic">
              {{ progress.description.split('.')[0] }} 
            </span>
          </div>
        </div>

        <!-- Level Circular Badge -->
        <div class="relative flex items-center justify-center w-14 h-14 group-hover:scale-110 transition-transform duration-500">
          <svg class="w-full h-full -rotate-90">
            <!-- Background Ring -->
            <circle
              cx="28" cy="28" r="18"
              fill="none"
              stroke="white"
              stroke-width="3"
              class="opacity-10"
            />
            <!-- Progress Ring -->
            <circle
              cx="28" cy="28" r="18"
              fill="none"
              :stroke="phaseTheme.accentColor"
              stroke-width="3"
              stroke-linecap="round"
              :stroke-dasharray="circumference"
              :stroke-dashoffset="strokeDashoffset"
              class="transition-all duration-1000 ease-in-out"
              :class="phaseTheme.glowClass"
            />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span class="text-[8px] font-black text-white/40 uppercase leading-none mb-0.5">Lvl</span>
            <span class="text-lg font-black text-white leading-none">{{ progress.level }}</span>
          </div>
        </div>
      </div>

      <!-- BOTTOM SECTION: Stats & Phase -->
      <div class="flex items-end justify-between w-full">
        <div class="flex flex-col gap-4">
          <!-- Training Phase Pill -->
          <div :class="['inline-flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-xl border border-white/10 saturate-150', phaseTheme.glowClass]">
            <div :class="['w-1.5 h-1.5 rounded-full animate-pulse', phaseTheme.iconClass.split(' ')[1]]"></div>
            <span :class="['text-[11px] font-black tracking-widest uppercase', phaseTheme.textClass]">
              {{ insights.phase }} Phase
            </span>
          </div>

          <!-- Volume Stats -->
          <div class="flex items-center gap-4">
            <div class="flex flex-col">
              <span class="text-[9px] font-bold text-white/30 uppercase tracking-tighter mb-0.5">Weekly Load</span>
              <span class="text-sm font-black text-white/90 tracking-wide">
                {{ insights.fatigue.weeklyTotalSets[3] || 0 }} <span class="text-[10px] font-medium text-white/50">SETS</span>
              </span>
            </div>
            <div class="w-[1px] h-6 bg-white/10"></div>
            <div class="flex flex-col">
              <span class="text-[9px] font-bold text-white/30 uppercase tracking-tighter mb-0.5">Ready Index</span>
              <span class="text-sm font-black text-white/90 tracking-wide">
                {{ (progress.readiness * 100).toFixed(0) }}%
              </span>
            </div>
          </div>
        </div>

        <!-- Action Interaction -->
        <div class="relative">
          <div class="absolute inset-0 bg-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div class="w-12 h-12 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-all duration-500 group-hover:-translate-y-1 shadow-2xl">
            <ChevronRight class="w-6 h-6 text-white group-hover:text-primary-foreground transform group-hover:translate-x-0.5 transition-all duration-500" />
          </div>
        </div>
      </div>

    </div>
  </UiCard>
</template>
