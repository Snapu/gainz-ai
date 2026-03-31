<script setup lang="ts">
import { computed } from "vue";
import Progress from "@/components/ui/Progress.vue";
import UiCard from "@/components/ui/UiCard.vue";
import type { UserProgress } from "@/services/leveling";

const props = defineProps<{
  progress: UserProgress;
}>();

defineEmits<(e: "click") => void>();

const readinessEffect = computed(() => {
  const r = props.progress.readiness;

  if (r < 0.7) {
    return {
      indicator: "from-blue-400 to-blue-600",
      container: "shadow-[0_0_12px_rgba(59,130,246,0.2)] animate-pulse-slow",
    };
  }

  if (r < 0.9) {
    return {
      indicator: "from-cyan-300 to-cyan-500",
      container: "shadow-[0_0_12px_rgba(34,211,238,0.2)] animate-pulse-standard",
    };
  }

  if (r <= 1.15) {
    return {
      indicator: "from-emerald-300 to-emerald-500",
      container: "shadow-[0_0_15px_rgba(52,211,153,0.3)] animate-pulse-fast",
    };
  }

  return {
    indicator: "from-fuchsia-400 to-purple-500",
    container: "shadow-[0_0_20px_rgba(192,38,211,0.4)] animate-pulse-hyper",
  };
});
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
          <!-- Level Only -->
          <div class="flex items-baseline shrink-0">
            <span class="text-[10px] text-muted-foreground opacity-70 mr-1 uppercase tracking-tighter font-bold">lvl</span>
            <span class="text-primary font-black italic leading-none">{{ progress.level }}</span>
          </div>
          
          <!-- Simple Progress Bar -->
          <Progress 
            :model-value="progress.progressPercent" 
            class="bg-white/5 rounded-full transition-all duration-1000"
            :class="readinessEffect.container"
            :indicator-class="readinessEffect.indicator"
          />

          <!-- Readiness Metrics Below Bar -->
          <div class="flex items-center justify-between px-0.5">
            <span class="text-[8px] text-muted-foreground opacity-40 uppercase tracking-[0.2em] font-black">
              Readiness
            </span>
            <div class="flex items-baseline gap-1.5 text-right">
              <span class="text-[8px] font-black uppercase text-primary/80 tracking-widest leading-none">
                {{ progress.readiness < 0.7 ? 'Recovering' : progress.readiness < 0.9 ? 'Stabilizing' : progress.readiness <= 1.15 ? 'Ready' : 'Flow State' }}
              </span>
              <span class="text-[11px] font-black italic text-primary leading-none tabular-nums">
                {{ (progress.readiness * 100).toFixed(0) }}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Active Buff Overlay (Optional Glow) -->
    <div v-if="progress.momentum > 1.15" class="absolute inset-0 bg-primary/5 pointer-events-none animate-pulse"></div>
  </UiCard>
</template>

<style scoped>
.animate-pulse-slow {
  animation: pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.animate-pulse-standard {
  animation: pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.animate-pulse-fast {
  animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.animate-pulse-hyper {
  animation: pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite, glow-pulse 1.2s alternate infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); filter: brightness(1); }
  50% { transform: scale(1.01); filter: brightness(1.2); }
}

@keyframes glow-pulse {
  from { filter: brightness(1); }
  to { filter: brightness(1.4) saturate(1.2); }
}
</style>
