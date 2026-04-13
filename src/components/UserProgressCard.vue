<script setup lang="ts">
import { computed } from "vue";
import RadialProgress from "@/components/ui/RadialProgress.vue";
import UiCard from "@/components/ui/UiCard.vue";
import { computeReadinessTheme, consistencyLabel } from "@/composables/useUserProgression";
import type { UserProgress } from "@/services/leveling";

const props = defineProps<{
  progress: UserProgress;
}>();

defineEmits<(e: "click") => void>();

const consistencyTier = computed(() => consistencyLabel(props.progress.readiness));

const readinessTheme = computed(() => computeReadinessTheme(props.progress.readiness));
</script>

<template>
  <UiCard 
    as="button"
    @click="$emit('click')"
    class="w-[calc(100%-2rem)] text-left px-5 py-4 mb-4 mx-4 mt-4 active:scale-[0.98] outline-none group relative overflow-hidden transition-all duration-300 border-border/40 shadow-sm"
  >
    <!-- Content Row -->
    <div class="relative z-10 flex items-center gap-5">
      
      <!-- Avatar Section with Radial Progress -->
      <div class="relative shrink-0 flex items-center justify-center">
        <RadialProgress 
          :progress="progress.progressPercent" 
          :size="92" 
          :stroke-width="4.5"
          class="transition-all duration-1000"
          :class="readinessTheme.color"
        >
          <!-- Inner Avatar Image -->
          <div class="relative w-20 h-20 rounded-full overflow-hidden border border-border group-hover:border-primary/40 transition-colors shadow-sm">
            <img :src="progress.avatar" :alt="progress.title" class="w-full h-full object-cover" />
          </div>
        </RadialProgress>
        
        <!-- Level Badge Overlay -->
        <div class="absolute bottom-0 right-0 translate-x-1 translate-y-1 bg-primary text-primary-foreground px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-widest border-2 border-background shadow-md z-20">
          Lvl {{ progress.level }}
        </div>
      </div>

      <!-- Info Column -->
      <div class="flex-1 min-w-0 flex flex-col justify-center ml-1">
        <span class="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1">
          Active Rank
        </span>
        <h2 class="text-xl font-bold tracking-tight text-foreground truncate leading-none group-hover:text-primary transition-colors mb-2.5">
          {{ progress.title }}
        </h2>
        
        <div class="flex items-center gap-1.5">
          <div :class="['w-2 h-2 rounded-full animate-pulse shadow-sm', readinessTheme.color.replace('text-', 'bg-')]"></div>
          <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {{ consistencyTier }}
          </span>
        </div>
      </div>

      <!-- Subtle Pointer -->
      <div class="shrink-0 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </div>
    </div>
  </UiCard>
</template>
