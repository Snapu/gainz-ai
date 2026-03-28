<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";
import ExerciseLogItem from "@/components/ExerciseLogItem.vue";
import UiCard from "@/components/ui/UiCard.vue";
import type { ExerciseLog } from "@/services/exerciseLogs";

defineProps<{
  date: string;
  logs: ExerciseLog[];
  stats: {
    sets: number;
    volume: number;
    durationMinutes: number;
    exerciseCount: number;
  };
  isCollapsed: boolean;
}>();

defineEmits<{
  (e: "toggle"): void;
  (e: "deleteLog", log: ExerciseLog): void;
}>();
</script>

<template>
  <div class="mt-8 overflow-hidden">
    <!-- Session Header -->
    <UiCard 
      as="button"
      @click="$emit('toggle')"
      class="w-full flex items-center justify-between p-4 mb-3 hover:border-primary/20 group"
    >
      <!-- Subtle Glow effect on hover -->
      <div class="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
      
      <div class="flex flex-col items-start px-1 relative z-10">
        <h3 class="text-[10px] font-black tracking-[0.2em] text-muted-foreground/60 uppercase group-hover:text-primary/60 transition-colors">{{ date }}</h3>
        <div class="flex items-center gap-3 mt-1.5">
          <div v-if="stats.durationMinutes > 0" class="flex flex-col items-start">
            <span class="text-lg font-black italic tracking-tighter text-foreground group-hover:text-primary transition-colors">{{ stats.durationMinutes }}<span class="text-[10px] ml-0.5 not-italic text-muted-foreground font-bold tracking-tight uppercase">Min</span></span>
          </div>
          
          <div v-if="stats.durationMinutes > 0" class="h-4 w-px bg-white/10 mx-1"></div>
          
          <div class="flex items-center gap-3">
            <div class="flex flex-col">
              <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Sets</span>
              <span class="text-xs font-black text-foreground">{{ stats.sets }}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Exercises</span>
              <span class="text-xs font-black text-foreground">{{ stats.exerciseCount }}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Volume</span>
              <span class="text-xs font-black text-foreground">{{ stats.volume.toLocaleString() }}<span class="text-[8px] ml-0.5 opacity-70">KG</span></span>
            </div>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2 relative z-10">
        <div class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
          <ChevronDown 
            class="w-4 h-4 text-muted-foreground group-hover:text-primary transition-all duration-300"
            :class="{ '-rotate-180': !isCollapsed }"
          />
        </div>
      </div>
    </UiCard>

    <!-- Session Content -->
    <div 
      v-show="!isCollapsed"
      class="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-300"
    >
      <ExerciseLogItem 
        v-for="log in logs" 
        :key="log.id" 
        :log="log"
        @delete="$emit('deleteLog', $event)"
      />
    </div>
  </div>
</template>
