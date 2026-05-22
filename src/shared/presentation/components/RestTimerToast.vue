<script setup lang="ts">
import { Timer, X } from "@lucide/vue";
import { computed } from "vue";
import { formatRestDuration } from "@/modules/sharedKernel/presentation";
import { uiIconButtonClass } from "@/shared/presentation/components/ui/styles";

const props = defineProps<{
  formattedTime: string;
  isOvertime?: boolean;
  targetRestSeconds?: number | null;
  restElapsed?: number;
}>();

defineEmits<(e: "dismiss") => void>();

const progressPercent = computed(() => {
  if (!props.targetRestSeconds) return 0;
  return Math.min(100, Math.round(((props.restElapsed || 0) / props.targetRestSeconds) * 100));
});
</script>

<template>
  <div 
    class="group pointer-events-auto relative flex w-full max-w-[280px] items-center justify-between space-x-4 overflow-hidden rounded-xl border border-muted/10 bg-card/85 p-4 shadow-2xl backdrop-blur-md transition-all duration-200"
  >
    <div class="flex items-center gap-3 min-w-0 pb-1">
      <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Timer class="h-4 w-4" :class="{ 'animate-pulse': !isOvertime }" />
      </div>
      
      <div class="grid gap-0.5 min-w-0">
        <h3 class="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 leading-none">Rest Cooldown</h3>
        <span class="text-xs font-bold text-foreground mt-0.5 truncate">
          {{ isOvertime ? 'Ready to go!' : 'Catch your breath...' }}
        </span>
        <div class="flex items-center gap-1.5 mt-1">
          <span 
            class="font-mono text-xs font-bold tracking-tight tabular-nums leading-none"
            :class="isOvertime ? 'text-destructive' : 'text-primary'"
          >
            {{ formattedTime }}
          </span>
          <span v-if="targetRestSeconds" class="text-[10px] text-muted-foreground/40 font-medium">/ {{ formatRestDuration(targetRestSeconds) }}</span>
        </div>
      </div>
    </div>

    <!-- Close Button -->
    <button type="button" 
      @click="$emit('dismiss')"
      :class="uiIconButtonClass"
      title="Skip rest"
    >
      <X class="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
    </button>

    <!-- Bottom visual progress bar line -->
    <div v-if="targetRestSeconds" class="absolute bottom-0 left-0 right-0 h-0.5 bg-muted/10 overflow-hidden">
      <div
        class="h-full bg-primary transition-all duration-1000 ease-linear"
        :style="{ width: `${progressPercent}%` }"
      />
    </div>
  </div>
</template>

<style scoped>
/* Any custom component-specific styles if needed */
</style>
