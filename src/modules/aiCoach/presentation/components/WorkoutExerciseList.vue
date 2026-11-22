<script setup lang="ts">
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import { t } from "@/shared/presentation/i18n";
import {
  type DisplayExercise,
  formatDurationSeconds,
  getValidSupersetId,
  isSupersetStart,
  supersetConnectorClass,
} from "../helpers/aiCoachPageHelpers";

interface WorkoutExerciseListItem extends DisplayExercise {
  restSeconds?: number;
}

defineProps<{
  exercises: WorkoutExerciseListItem[];
  showRest?: boolean;
}>();

function formatPrescription(ex: WorkoutExerciseListItem): string {
  if (ex.targetDistanceMeters != null) {
    return `${ex.targetSets} × ${ex.targetDistanceMeters} ${t("common.m")}`;
  }
  if (ex.targetDurationSeconds != null) {
    const d = formatDurationSeconds(ex.targetDurationSeconds);
    const unit = d.unit === "min" ? t("common.min") : t("common.s");
    return `${ex.targetSets} × ${d.value} ${unit}`;
  }
  if (ex.targetReps) return `${ex.targetSets} × ${ex.targetReps}`;
  return t("coach.card.setsCount", { count: ex.targetSets }, ex.targetSets);
}
</script>

<template>
  <div class="flex flex-col divide-y divide-white/5 pl-2 relative">
    <div
      v-for="(ex, exIdx) in exercises"
      :key="`${ex.exerciseName}-${exIdx}`"
      class="flex items-center justify-between gap-2 py-2.5 relative min-w-0"
    >
      <!-- Superset Indicator Line -->
      <div
        v-if="getValidSupersetId(ex, exercises)"
        class="absolute -left-2 w-[2px] bg-primary/40"
        :class="supersetConnectorClass(exIdx, exercises)"
      />

      <!-- Exercise Name + Optional Superset Badge -->
      <div class="flex items-center gap-2 min-w-0 flex-1 pr-2">
        <span class="text-sm font-semibold text-foreground/90 truncate">
          {{ ex.exerciseName }}
        </span>
        <UiBadge
          v-if="isSupersetStart(exIdx, exercises)"
          variant="info"
          class="px-1.5 py-0"
        >
          {{ t("coach.card.superset") }}
        </UiBadge>
      </div>

      <!-- Sets × Reps / Duration / Distance + Optional Weight & Rest -->
      <div class="flex items-center gap-2 shrink-0 tabular-nums text-xs ml-2">
        <span class="font-bold text-foreground/85">
          {{ formatPrescription(ex) }}
        </span>
        <span v-if="ex.targetWeight" class="font-bold text-primary">
          {{ ex.targetWeight }}
        </span>
        <span v-if="showRest && ex.restSeconds" class="font-semibold text-muted-foreground/60">
          · {{ ex.restSeconds }} {{ t("common.s") }}
        </span>
      </div>
    </div>
  </div>
</template>
