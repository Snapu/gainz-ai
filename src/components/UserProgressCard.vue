<script setup lang="ts">
import MomentumFlames from "@/components/MomentumFlames.vue";
import Progress from "@/components/ui/Progress.vue";
import UiCard from "@/components/ui/UiCard.vue";
import type { UserProgress } from "@/services/leveling";

defineProps<{
  progress: UserProgress;
}>();

defineEmits<(e: "click") => void>();
</script>

<template>
  <UiCard 
    as="button"
    @click="$emit('click')"
    class="w-[calc(100%-2rem)] text-left px-5 py-5 mb-4 mx-4 mt-4 active:scale-[0.98] outline-none group"
  >
    <!-- Background Depth Circles -->
    <div class="absolute inset-0 bg-background/20 z-0"></div>
    <div class="absolute -top-16 -right-16 w-32 h-32 bg-primary/10 blur-[80px] rounded-full"></div>
    <div class="absolute -bottom-8 -left-8 w-24 h-24 bg-primary/10 blur-[60px] rounded-full"></div>
    
    <!-- Content Row -->
    <div class="relative z-10 flex items-center gap-5">
      <!-- Avatar Section -->
      <div class="relative flex-shrink-0">
        <div class="relative w-24 h-24 rounded-2xl overflow-hidden border border-white/10 shadow-lg group-hover:border-primary/30 transition-colors">
          <img :src="progress.avatar" :alt="progress.title" class="w-full h-full object-cover" />
        </div>
      </div>

      <!-- Info Column -->
      <div class="flex-1 min-w-0 flex flex-col gap-2">
        <h2 class="text-xl font-black italic tracking-tighter text-foreground truncate leading-none mb-1 group-hover:text-primary transition-colors">
          {{ progress.title }}
        </h2>
        
        <div class="flex flex-col gap-2">
          <!-- Typographic Level (Aligned with stats) -->
          <div class="text-xs font-semibold flex items-baseline">
            <span class="text-[10px] text-muted-foreground opacity-70 mr-1 uppercase tracking-tighter">lvl</span>
            <span class="text-primary">{{ progress.level }}</span>
          </div>
          
          <!-- Simple Progress Bar -->
          <Progress :model-value="progress.progressPercent" class="bg-white/5 rounded-full" />
        </div>

        <!-- Mini Status Footer -->
        <div class="flex items-center justify-end">
          <MomentumFlames :momentum="progress.momentum" />
        </div>
      </div>
    </div>
  </UiCard>
</template>
