<script setup lang="ts">
import { CheckCircle2 } from "@lucide/vue";
import { computed, type HTMLAttributes } from "vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import { cn } from "@/shared/presentation/lib/utils";

const props = defineProps<{
  exerciseName: string;
  targetSets?: number | string;
  targetReps?: number | string;
  targetDurationSeconds?: number | null;
  targetDistanceMeters?: number | null;
  restSeconds?: number | null;
  supersetId?: string | number | null;
  isCompleted?: boolean;
  subtitle?: string;
  class?: HTMLAttributes["class"];
}>();

const formattedPrescription = computed(() => {
  if (props.targetReps != null && props.targetReps !== "") {
    return `${props.targetSets} × ${props.targetReps}`;
  }
  if (props.targetDurationSeconds != null) {
    return `${props.targetSets} × ${props.targetDurationSeconds}s`;
  }
  if (props.targetDistanceMeters != null) {
    return `${props.targetSets} × ${props.targetDistanceMeters}m`;
  }
  if (props.targetSets != null) {
    return `${props.targetSets} Sets`;
  }
  return "";
});
</script>

<template>
  <div
    :class="cn(
      'flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-colors duration-200',
      props.isCompleted && 'opacity-60',
      props.class
    )"
  >
    <!-- Left: Identity -->
    <div class="flex flex-col min-w-0 mr-3">
      <div class="flex items-center gap-2">
        <span
          class="text-sm font-semibold text-foreground truncate"
          :class="{ 'line-through decoration-muted-foreground/40': props.isCompleted }"
        >
          {{ props.exerciseName }}
        </span>
        <UiBadge
          v-if="props.supersetId"
          variant="info"
          class="text-micro font-bold px-1.5 py-0 h-4 shrink-0 bg-primary/15 text-primary border-primary/25"
        >
          SS {{ props.supersetId }}
        </UiBadge>
      </div>
      <span v-if="props.subtitle" class="text-micro text-muted-foreground mt-0.5 truncate">
        {{ props.subtitle }}
      </span>
    </div>

    <!-- Right: Prescription & Status -->
    <div class="flex items-center gap-3 shrink-0">
      <div class="text-right flex flex-col items-end">
        <span v-if="formattedPrescription" class="text-sm font-bold text-foreground tabular-nums">
          {{ formattedPrescription }}
        </span>
        <span v-if="props.restSeconds" class="text-micro text-muted-foreground tabular-nums">
          {{ props.restSeconds }}s rest
        </span>
      </div>
      <CheckCircle2 v-if="props.isCompleted" class="w-4 h-4 text-emerald-400 shrink-0" />
    </div>
  </div>
</template>
