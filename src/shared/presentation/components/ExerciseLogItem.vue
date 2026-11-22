<script setup lang="ts">
import { computed } from "vue";
import { formatDurationMinutes } from "@/modules/sharedKernel/presentation";
import type { ExerciseLog } from "@/modules/trainingLogs/presentation";
import UiSwipeableItem from "@/shared/presentation/components/ui/UiSwipeableItem.vue";
import { t } from "@/shared/presentation/i18n";

const props = defineProps<{
  log: ExerciseLog;
  variant?: "card" | "inset";
}>();

const emit = defineEmits<{
  (e: "delete", log: ExerciseLog): void;
  (e: "edit", log: ExerciseLog): void;
}>();

const formattedDuration = computed(() => {
  if (props.log.duration == null || props.log.duration <= 0) return null;
  const formatted = formatDurationMinutes(props.log.duration);
  return {
    value: formatted.value,
    unit: formatted.unit === "min" ? t("common.min") : t("common.s"),
  };
});
</script>

<template>
  <UiSwipeableItem :variant="props.variant ?? 'card'" @action="emit('delete', props.log)">
    <div 
      class="flex justify-between items-center w-full cursor-pointer transition-opacity active:opacity-70"
      @click="emit('edit', props.log)"
    >
      <h3 class="text-sm font-semibold text-foreground tracking-tight leading-none truncate mr-3">{{ log.exerciseName }}</h3>
      <div class="flex gap-4 items-center shrink-0">
        <div v-if="log.weight" class="flex items-baseline">
           <span class="text-sm font-bold tabular-nums text-primary">{{ log.weight }}</span>
           <span class="text-xs font-semibold text-muted-foreground/70 ml-1">{{ t("common.kg") }}</span>
        </div>
        <div v-if="log.reps" class="flex items-baseline">
           <span class="text-sm font-bold tabular-nums text-foreground">{{ log.reps }}</span>
           <span class="text-xs font-semibold text-muted-foreground/70 ml-1">{{ t("common.reps") }}</span>
        </div>
        <div v-if="log.distance" class="flex items-baseline">
           <span class="text-sm font-bold tabular-nums text-foreground">{{ log.distance }}</span>
           <span class="text-xs font-semibold text-muted-foreground/70 ml-1">{{ t("common.m") }}</span>
        </div>
        <div v-if="formattedDuration" class="flex items-baseline">
           <span class="text-sm font-bold tabular-nums text-foreground">{{ formattedDuration.value }}</span>
           <span class="text-xs font-semibold text-muted-foreground/70 ml-1">{{ formattedDuration.unit }}</span>
        </div>
      </div>
    </div>
  </UiSwipeableItem>
</template>
