<script setup lang="ts">
import { ChevronRight, Info, Sparkles } from "@lucide/vue";
import { computed } from "vue";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiProgressionLine, {
  type ProgressionSessionItem,
} from "@/shared/presentation/components/ui/UiProgressionLine.vue";
import UiRadialProgress from "@/shared/presentation/components/ui/UiRadialProgress.vue";
import { t } from "@/shared/presentation/i18n";
import type { DisplayExercise } from "../helpers/aiCoachPageHelpers";
import {
  formatDurationMinutes,
  formatDurationSeconds,
  splitReps,
  splitWeight,
} from "../helpers/aiCoachPageHelpers";

const props = defineProps<{
  exercise: DisplayExercise;
  isHighlighted?: boolean;
  headingLevel?: "h3" | "h4";
  isSuperset?: boolean;
  lastSessionSummary?: string | null;
  progressionData?: ProgressionSessionItem[] | null;
  loggedSets?: ExerciseLog[];
}>();

const emit = defineEmits<{
  (e: "search", exerciseName: string): void;
  (e: "editLog", log: ExerciseLog): void;
}>();

const isSupersetExercise = computed(() => {
  return Boolean(props.isSuperset || props.exercise.supersetId);
});

const displayTarget = computed(() => {
  if (props.exercise.targetDistanceMeters != null) {
    return {
      label: t("coach.card.setsDistance"),
      value: props.exercise.targetDistanceMeters,
      unit: t("common.m"),
    };
  }
  if (props.exercise.targetDurationSeconds != null) {
    const formatted = formatDurationSeconds(props.exercise.targetDurationSeconds);
    return {
      label: t("coach.card.setsTime"),
      value: formatted.value,
      unit: formatted.unit === "min" ? t("common.min") : t("common.s"),
    };
  }

  const repsInfo = splitReps(props.exercise.targetReps);
  return { label: t("coach.card.setsReps"), value: repsInfo.value, unit: repsInfo.unit };
});

function formatLoggedDuration(minutes: number): { value: string; unit: string } {
  const formatted = formatDurationMinutes(minutes);
  return {
    value: formatted.value,
    unit: formatted.unit === "min" ? t("common.min") : t("common.s"),
  };
}

const displayWeight = computed(() => {
  if (!props.exercise.targetWeight) return null;
  return splitWeight(props.exercise.targetWeight);
});

const formattedWeightValue = computed(() => {
  if (!displayWeight.value) return "";
  if (displayWeight.value.value.startsWith("BW + ")) {
    return `${t("common.bw")}${displayWeight.value.value.slice(2)}`;
  }
  return displayWeight.value.value;
});

const formattedLoggedSets = computed(() =>
  (props.loggedSets ?? []).map((log) => ({
    log,
    formattedDuration: log.duration != null ? formatLoggedDuration(log.duration) : null,
  })),
);
</script>

<template>
  <UiCard
    as="div"
    class="flex flex-col w-full p-4 transition-colors duration-300"
    :class="isHighlighted ? 'border-primary/40 ring-1 ring-primary/20' : ''"
  >
    <!-- Card Content -->
    <div class="relative flex flex-col gap-4 w-full z-10">
      
      <!-- 1. Exercise Name (Header) -->
      <div class="flex items-start justify-between gap-3 w-full">
        <div class="flex items-center gap-2 flex-wrap min-w-0">
          <component
            :is="headingLevel ?? 'h3'"
            class="text-lg font-bold tracking-tight text-foreground leading-snug transition-colors duration-300 break-words"
          >
            {{ exercise.exerciseName }}
          </component>

          <UiBadge
            v-if="isSupersetExercise"
            variant="info"
            class="px-1.5 py-0.5"
          >
            {{ t("coach.card.superset") }}
          </UiBadge>
        </div>
        
        <button
          @click.stop="emit('search', exercise.exerciseName)"
          class="p-2 -mr-2 -mt-2 text-muted-foreground/50 hover:text-primary transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full shrink-0"
          :aria-label="t('coach.card.exerciseGuide')"
          :title="t('coach.card.exerciseGuide')"
        >
          <Info class="w-4 h-4" />
        </button>
      </div>

      <!-- 2. History -->
      <div v-if="progressionData && progressionData.length > 0" class="flex flex-col gap-2 w-full">
        <div class="flex items-center justify-between">
          <h4 class="text-micro text-muted-foreground tracking-widest">{{ t("coach.card.history") }}</h4>
        </div>
        <UiProgressionLine :sessions="progressionData" class="w-full" />
      </div>

      <!-- 3. Target Today (Unified Telemetry Strip) -->
      <div class="flex flex-col gap-2 w-full">
        <h4 class="text-micro text-muted-foreground tracking-widest">{{ t("coach.card.targetToday") }}</h4>
        
        <div class="rounded-xl bg-white/5 border border-white/5 divide-x divide-white/5 grid grid-cols-3 w-full overflow-hidden">
          <!-- Column 1: Sets × Reps/Time -->
          <div class="flex flex-col justify-between p-2.5 sm:p-3 min-w-0">
            <span class="text-micro text-muted-foreground/60 truncate">
              {{ displayTarget.label }}
            </span>
            <div class="flex items-baseline mt-1.5 min-w-0 h-7">
              <span class="text-lg font-black tabular-nums tracking-tight text-foreground shrink-0">{{ exercise.targetSets }}</span><span class="text-xs font-bold text-muted-foreground/60 mx-1 shrink-0">×</span><span class="text-lg font-black tabular-nums tracking-tight text-foreground truncate">{{ displayTarget.value }}</span>
              <span v-if="displayTarget.unit" class="text-xs font-semibold text-muted-foreground/70 ml-1 shrink-0">{{ displayTarget.unit }}</span>
            </div>
          </div>
          
          <!-- Column 2: Weight -->
          <div class="flex flex-col justify-between p-2.5 sm:p-3 min-w-0">
            <span class="text-micro text-muted-foreground/60 truncate">
              {{ t("coach.card.weight") }}
            </span>
            <div v-if="displayWeight" class="flex items-baseline mt-1.5 min-w-0 h-7">
              <span v-if="displayWeight.value === 'BW'" class="text-lg font-black tracking-tight text-foreground truncate">
                {{ t("common.bw") }}
              </span>
              <template v-else>
                <span class="text-lg font-black tabular-nums tracking-tight text-primary truncate">{{ formattedWeightValue }}</span>
                <span class="text-xs font-semibold text-muted-foreground/70 ml-1 shrink-0">{{ displayWeight.unit }}</span>
              </template>
            </div>
            <div v-else class="text-lg font-black text-muted-foreground/30 mt-1.5 h-7 flex items-baseline">-</div>
          </div>
          
          <!-- Column 3: RPE -->
          <div class="flex flex-col justify-between p-2.5 sm:p-3 min-w-0">
            <span class="text-micro text-muted-foreground/60 truncate">
              {{ t("coach.card.rpe") }}
            </span>
            <div v-if="exercise.targetRpe" class="flex items-baseline gap-1.5 mt-1.5 min-w-0 h-7">
              <UiRadialProgress 
                :progress="(exercise.targetRpe / 10) * 100" 
                :size="14" 
                :stroke-width="2" 
                progress-class="text-orange-400" 
                track-class="text-orange-500/20" 
                class="self-center shrink-0"
              />
              <span class="text-lg font-black tabular-nums tracking-tight text-orange-400">{{ exercise.targetRpe }}</span>
            </div>
            <div v-else class="text-lg font-black text-muted-foreground/30 mt-1.5 h-7 flex items-baseline">-</div>
          </div>
        </div>
      </div>
      
      <!-- 4. Coach Cue (Frameless) -->
      <div
        v-if="exercise.notes"
        class="flex items-start gap-2 w-full border-l-2 border-primary/40 pl-3 py-0.5"
      >
        <Sparkles class="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
        <p class="text-xs sm:text-sm text-foreground/80 font-medium leading-relaxed">
          {{ exercise.notes }}
        </p>
      </div>

      <!-- 5. Today's Sets -->
      <div v-if="loggedSets?.length" class="flex flex-col gap-2 w-full animate-in fade-in duration-300">
        <h4 class="text-micro text-muted-foreground tracking-widest">{{ t("coach.card.todaySets") }}</h4>
        
        <div class="flex flex-col divide-y divide-white/5 w-full">
          <!-- Render existing logs -->
          <div
            v-for="({ log, formattedDuration }, idx) in formattedLoggedSets"
            :key="log.id"
            class="px-2.5 py-2 hover:bg-white/5 active:bg-white/15 transition-colors"
            @click.stop="emit('editLog', log)"
          >
            <div 
              class="grid grid-cols-3 gap-2 items-center w-full cursor-pointer transition-opacity active:opacity-70 group"
            >
              <!-- Column 1: Reps / Duration / Distance -->
              <div class="flex items-baseline gap-2 min-w-0">
                <span class="text-micro text-muted-foreground/50 tabular-nums shrink-0">#{{ idx + 1 }}</span>
                <div v-if="log.reps != null" class="flex items-baseline min-w-0">
                   <span class="text-sm font-bold tabular-nums text-foreground">{{ log.reps }}</span>
                   <span class="text-xs font-semibold text-muted-foreground/70 ml-1">{{ t("common.reps") }}</span>
                </div>
                <div v-else-if="formattedDuration != null" class="flex items-baseline min-w-0">
                   <span class="text-sm font-bold tabular-nums text-foreground">{{ formattedDuration.value }}</span>
                   <span class="text-xs font-semibold text-muted-foreground/70 ml-1">{{ formattedDuration.unit }}</span>
                </div>
                <div v-else-if="log.distance != null" class="flex items-baseline min-w-0">
                   <span class="text-sm font-bold tabular-nums text-foreground">{{ log.distance }}</span>
                   <span class="text-xs font-semibold text-muted-foreground/70 ml-1">{{ t("common.m") }}</span>
                </div>
                <div v-else class="flex items-baseline">
                   <span class="text-sm font-bold text-muted-foreground/40">-</span>
                </div>
              </div>
              
              <!-- Column 2: Weight -->
              <div class="flex items-baseline pl-1 min-w-0">
                <template v-if="log.weight != null">
                   <span class="text-sm font-bold tabular-nums text-primary">{{ log.weight }}</span>
                   <span class="text-xs font-semibold text-muted-foreground/70 ml-1">{{ t("common.kg") }}</span>
                </template>
                <template v-else>
                   <span class="text-sm font-bold text-muted-foreground/40">-</span>
                </template>
              </div>

              <!-- Column 3: RPE & Chevron -->
              <div class="flex items-center justify-between pl-1 w-full min-w-0">
                <span v-if="log.rpe" class="text-xs font-semibold tabular-nums text-orange-400 whitespace-nowrap">
                  {{ t("coach.card.rpe") }} {{ log.rpe }}
                </span>
                <span v-else class="text-xs font-semibold text-muted-foreground/40 whitespace-nowrap">-</span>
                
                <ChevronRight class="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors shrink-0" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </UiCard>
</template>
