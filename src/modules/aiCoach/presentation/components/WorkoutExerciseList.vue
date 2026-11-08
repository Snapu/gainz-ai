<script setup lang="ts">
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import {
  type DisplayExercise,
  getValidSupersetId,
  isSupersetStart,
  supersetConnectorClass,
} from "../helpers/aiCoachPageHelpers";

export interface WorkoutExerciseListItem extends DisplayExercise {
  restSeconds?: number;
}

defineProps<{
  exercises: WorkoutExerciseListItem[];
  showRest?: boolean;
}>();
</script>

<template>
  <div class="flex flex-col divide-y divide-white/5 pl-2 relative">
    <div
      v-for="(ex, exIdx) in exercises"
      :key="`${ex.exerciseName}-${exIdx}`"
      class="flex items-center justify-between gap-2 text-xs py-2 relative min-w-0"
    >
      <!-- Superset Indicator Line -->
      <div
        v-if="getValidSupersetId(ex, exercises)"
        class="absolute -left-2 w-[2px] bg-primary/40"
        :class="supersetConnectorClass(exIdx, exercises)"
      />

      <!-- Exercise Name + Optional Superset Badge -->
      <div class="flex items-center gap-1.5 min-w-0 flex-1 pr-2">
        <span class="font-semibold text-foreground/90 truncate">
          {{ ex.exerciseName }}
        </span>
        <UiBadge
          v-if="isSupersetStart(exIdx, exercises)"
          variant="info"
          class="text-micro px-1.5 py-0 uppercase tracking-wider shrink-0"
        >
          Superset
        </UiBadge>
      </div>

      <!-- Sets × Reps / Duration / Distance + Optional Weight & Rest -->
      <div class="flex items-center gap-1.5 shrink-0 tabular-nums text-xs ml-2">
        <span class="font-bold text-foreground/80">
          {{
            ex.targetReps
              ? `${ex.targetSets} × ${ex.targetReps}`
              : ex.targetDurationSeconds
                ? `${ex.targetSets} × ${ex.targetDurationSeconds}s`
                : ex.targetDistanceMeters
                  ? `${ex.targetSets} × ${ex.targetDistanceMeters}m`
                  : `${ex.targetSets} Sets`
          }}
        </span>
        <span v-if="ex.targetWeight" class="font-bold text-primary">
          {{ ex.targetWeight }}
        </span>
        <span v-if="showRest && ex.restSeconds" class="text-muted-foreground/60 text-xs">
          · {{ ex.restSeconds }}s
        </span>
      </div>
    </div>
  </div>
</template>
