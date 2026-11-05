<script setup lang="ts">
withDefaults(
  defineProps<{
    text: string;
    subtitle?: string;
    fullscreen?: boolean;
  }>(),
  {
    subtitle: undefined,
    fullscreen: false,
  },
);
</script>

<template>
  <div 
    class="relative w-full flex flex-col items-center justify-center overflow-hidden py-10 px-4 select-none"
    :class="fullscreen ? 'min-h-screen py-0' : 'min-h-[12rem]'"
    role="status"
    aria-live="polite"
  >
    <!-- Top Hairline Laser Beam (Frameless light guide) -->
    <div class="absolute top-0 inset-x-0 h-px w-full overflow-hidden bg-white/5">
      <div class="beam-glow h-full w-1/3 bg-linear-to-r from-transparent via-primary to-transparent" />
    </div>

    <!-- Centered Factual AI Telemetry -->
    <div class="flex flex-col items-center justify-center gap-3 text-center max-w-sm">
      <!-- Minimalist Breathing AI Dot -->
      <div class="relative flex items-center justify-center w-7 h-7">
        <div class="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-30" />
        <div class="relative w-2 h-2 rounded-full bg-primary ring-2 ring-primary/40" />
      </div>

      <!-- Factual Shimmering Telemetry Text -->
      <div class="flex flex-col items-center gap-1">
        <p class="shimmer-text text-sm font-semibold tracking-tight text-foreground">
          {{ text }}
        </p>
        <p v-if="subtitle" class="text-xs text-muted-foreground/60 font-medium">
          {{ subtitle }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.beam-glow {
  animation: laser-slide 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes laser-slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(300%);
  }
}

.shimmer-text {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.5) 0%,
    rgba(255, 255, 255, 1) 50%,
    rgba(255, 255, 255, 0.5) 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: text-shimmer 2.5s ease-in-out infinite;
}

@keyframes text-shimmer {
  0%, 100% {
    background-position: 100% 0;
  }
  50% {
    background-position: 0 0;
  }
}
</style>
