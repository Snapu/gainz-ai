<script setup lang="ts">
import { ChevronDown } from "@lucide/vue";
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
  <div class="mt-4 overflow-hidden">
    <!-- Session Header -->
    <UiCard 
      as="button"
      @click="$emit('toggle')"
      class="w-full flex items-center justify-between p-4 mb-3 hover:border-primary/50 group border-border/40 shadow-sm transition-all duration-200"
    >
      <div class="flex flex-col items-start relative z-10 w-full">
        <h3 class="text-xs font-semibold tracking-wide text-muted-foreground uppercase mb-2 group-hover:text-primary/80 transition-colors">{{ date }}</h3>
        
        <div class="flex items-center gap-3 w-full min-w-0">
          <!-- Duration -->
          <div v-if="stats.durationMinutes > 0" class="flex items-baseline gap-1 min-w-[2.5rem] shrink-0">
            <span class="text-2xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">{{ stats.durationMinutes }}</span>
            <span class="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Min</span>
          </div>
          
          <div v-if="stats.durationMinutes > 0" class="h-5 w-px bg-border/50 mx-0.5 shrink-0"></div>
          
          <!-- Quick Stats -->
          <div class="grid grid-cols-3 gap-2 sm:gap-3 flex-1 min-w-0">
            <div class="flex min-w-0 flex-col items-start gap-0.5">
              <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sets</span>
              <span class="text-sm font-bold text-foreground">{{ stats.sets }}</span>
            </div>
            <div class="flex min-w-0 flex-col items-start gap-0.5">
              <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Exercises</span>
              <span class="text-sm font-bold text-foreground">{{ stats.exerciseCount }}</span>
            </div>
            <div class="flex min-w-0 flex-col items-start gap-0.5">
              <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Volume</span>
              <span class="text-sm font-bold text-foreground flex items-baseline gap-0.5 min-w-0">
                <span class="truncate">{{ stats.volume.toLocaleString() }}</span>
                <span class="text-xs text-muted-foreground uppercase">KG</span>
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
    <UiCard
      v-show="!isCollapsed"
      variant="list"
      class="animate-in fade-in slide-in-from-top-2 duration-300"
    >
      <ExerciseLogItem 
        v-for="log in logs" 
        :key="log.id" 
        :log="log"
        variant="inset"
        @delete="$emit('deleteLog', $event)"
      />
    </UiCard>
  </div>
</template>
