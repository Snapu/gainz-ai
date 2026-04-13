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
      class="w-full flex items-center justify-between p-5 mb-3 hover:border-primary/40 group border-border/40 shadow-sm transition-all"
    >
      <div class="flex flex-col items-start relative z-10 w-full">
        <h3 class="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-2 group-hover:text-primary/80 transition-colors">{{ date }}</h3>
        
        <div class="flex items-center gap-4 w-full">
          <!-- Duration -->
          <div v-if="stats.durationMinutes > 0" class="flex items-baseline gap-1 min-w-[3rem]">
            <span class="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">{{ stats.durationMinutes }}</span>
            <span class="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Min</span>
          </div>
          
          <div v-if="stats.durationMinutes > 0" class="h-6 w-px bg-border/50 mx-1"></div>
          
          <!-- Quick Stats -->
          <div class="flex items-center gap-5 flex-1">
            <div class="flex flex-col items-start gap-0.5">
              <span class="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Sets</span>
              <span class="text-sm font-bold text-foreground">{{ stats.sets }}</span>
            </div>
            <div class="flex flex-col items-start gap-0.5">
              <span class="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Exercises</span>
              <span class="text-sm font-bold text-foreground">{{ stats.exerciseCount }}</span>
            </div>
            <div class="flex flex-col items-start gap-0.5">
              <span class="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest">Volume</span>
              <span class="text-sm font-bold text-foreground flex items-baseline gap-0.5">
                {{ stats.volume.toLocaleString() }}
                <span class="text-[8px] text-muted-foreground uppercase">KG</span>
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Chevron -->
      <div class="flex items-center justify-center shrink-0 ml-2 relative z-10">
        <div class="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
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
