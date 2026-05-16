<script setup lang="ts">
import { CheckCircle2, X } from "@lucide/vue";
import { uiIconButtonClass } from "@/shared/presentation/components/ui/styles";

defineProps<{
  formattedTime: string;
  isOvertime?: boolean;
}>();

defineEmits<(e: "dismiss") => void>();
</script>

<template>
  <div 
    class="group pointer-events-auto relative flex w-full max-w-[280px] items-center justify-between space-x-4 overflow-hidden rounded-xl border border-white/10 bg-card/95 p-4 shadow-2xl backdrop-blur-xl transition-all"
  >
    <div class="flex items-center gap-3 min-w-0">
      <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <CheckCircle2 class="h-5 w-5" />
      </div>
      
      <div class="grid gap-0.5 min-w-0">
        <h3 class="text-sm font-bold uppercase tracking-widest text-foreground/80 leading-none">Set Logged</h3>
        <div class="flex items-center gap-1.5">
          <span class="text-xs text-muted-foreground font-bold uppercase tracking-wider">Rest:</span>
          <span 
            class="font-mono text-sm font-bold italic tracking-tighter tabular-nums leading-none"
            :class="isOvertime ? 'text-destructive' : 'text-primary'"
          >
            {{ formattedTime }}
          </span>
        </div>
      </div>
    </div>

    <!-- Close Button -->
    <button type="button" 
      @click="$emit('dismiss')"
      :class="uiIconButtonClass"
    >
      <X class="h-4 w-4" />
    </button>
  </div>
</template>

<style scoped>
/* Any custom component-specific styles if needed */
</style>
