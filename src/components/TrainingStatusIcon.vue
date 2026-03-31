<script setup lang="ts">
import { Zap } from "lucide-vue-next";
import { computed } from "vue";

const props = defineProps<{
  readiness: number;
  showMultiplier?: boolean;
  size?: "sm" | "md" | "lg";
}>();

const orbConfig = computed(() => {
  const r = props.readiness;

  if (r < 0.7) {
    return {
      label: "RECOVERING",
      color: "text-blue-400/80",
      glow: "shadow-[0_0_15px_rgba(59,130,246,0.3)]",
      pulse: "animate-pulse-slow",
    };
  }

  if (r < 0.9) {
    return {
      label: "STABILIZING",
      color: "text-cyan-400/80",
      glow: "shadow-[0_0_15px_rgba(34,211,238,0.3)]",
      pulse: "animate-pulse-standard",
    };
  }

  if (r <= 1.15) {
    return {
      label: "READY",
      color: "text-emerald-400/80",
      glow: "shadow-[0_0_20px_rgba(52,211,153,0.4)]",
      pulse: "animate-pulse-fast",
    };
  }

  return {
    label: "FLOW STATE",
    color: "text-fuchsia-400",
    glow: "shadow-[0_0_30px_rgba(192,38,211,0.6)]",
    pulse: "animate-pulse-hyper",
  };
});

const sizeClass = computed(() => {
  switch (props.size) {
    case "sm":
      return "w-3 h-3";
    case "lg":
      return "w-8 h-8";
    default:
      return "w-5 h-5";
  }
});
</script>

<template>
  <div class="inline-flex items-center gap-2">
    <div class="relative flex items-center justify-center">
      <!-- Glow Aura -->
      <div 
        class="absolute inset-0 rounded-full blur-[10px] transition-all duration-1000"
        :class="[orbConfig.glow, orbConfig.pulse]"
      ></div>
      
      <!-- Icon -->
      <Zap 
        :class="[sizeClass, orbConfig.color, orbConfig.pulse, 'relative z-10 transition-colors duration-1000 fill-current']"
      />
    </div>
    
    <!-- Optional Multiplier Label -->
    <div v-if="showMultiplier" class="flex flex-col leading-none">
       <span class="text-[10px] font-black italic text-primary leading-none">{{ (readiness * 1.5).toFixed(1) }}x</span>
       <span class="text-[7px] font-black uppercase tracking-widest text-muted-foreground opacity-60">{{ orbConfig.label }}</span>
    </div>
  </div>
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
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.15);
  }
}

@keyframes glow-pulse {
  from { filter: brightness(1); }
  to { filter: brightness(1.4) saturate(1.2); }
}
</style>
