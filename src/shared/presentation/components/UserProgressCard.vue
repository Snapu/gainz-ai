<script setup lang="ts">
import { computed } from "vue";
import type { UserProgress } from "@/modules/sharedKernel/presentation";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiRadialProgress from "@/shared/presentation/components/ui/UiRadialProgress.vue";
import { t } from "@/shared/presentation/i18n";
import { formatNumber } from "@/shared/presentation/i18n/formatters";

const props = defineProps<{
  progress: UserProgress;
}>();

const rankTitle = computed(() =>
  props.progress?.rankId
    ? t(`ranks.${props.progress.rankId}`)
    : (props.progress?.title ?? t("ranks.foundation")),
);

const formattedTonnage = computed(() => {
  const kg = props.progress?.totalVolumeKg ?? 0;
  if (kg >= 1000) {
    const tons = kg / 1000;
    const value =
      tons >= 100
        ? formatNumber(Math.round(tons))
        : formatNumber(Number(tons.toFixed(1)), {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          });
    return `${value} ${t("common.t")}`;
  }
  return `${formatNumber(kg)} ${t("common.kg")}`;
});

const formattedJourney = computed(() => {
  const weeks = props.progress?.journeyDurationWeeks ?? 0;
  if (weeks <= 0) return t("progress.wk", { value: formatNumber(0) }, 0);
  if (weeks >= 52) {
    const yrsNum = Number((weeks / 52).toFixed(1));
    const value = Number.isInteger(yrsNum)
      ? formatNumber(yrsNum)
      : formatNumber(yrsNum, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return t("progress.yr", { value }, yrsNum);
  }
  if (weeks >= 8) {
    const mos = Math.round(weeks / 4.33);
    return t("progress.mo", { value: formatNumber(mos) }, mos);
  }
  return t("progress.wk", { value: formatNumber(weeks) }, weeks);
});

const formattedXP = computed(() => {
  const xp = props.progress?.totalXP ?? 0;
  return `${formatNumber(xp)} ${t("common.xp")}`;
});
</script>

<template>
  <UiCard 
    class="w-full shrink-0 overflow-hidden p-0"
  >
    <div class="flex flex-row w-full items-stretch">
      
      <!-- Rank: Avatar & Level Info (38% Width) -->
      <div class="w-[38%] min-h-[9rem] relative shrink-0 border-r border-white/5 overflow-hidden bg-muted/10">
        <img 
          v-if="progress?.avatar"
          :src="progress.avatar" 
          :alt="rankTitle" 
          class="absolute inset-0 w-full h-full object-cover" 
        />
        
        <div class="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent" />
        
        <!-- Level Progress -->
        <div class="absolute bottom-3 left-3 flex items-center gap-2">
           <UiRadialProgress 
            :progress="progress?.progressPercent ?? 0" 
            :size="38" 
            :stroke-width="3.5"
            track-class="text-white/20"
            progress-class="text-primary"
          >
            <div class="flex flex-col items-center justify-center">
              <span class="text-micro text-white/70 leading-none mb-0.5">{{ t("progress.lvl") }}</span>
              <span class="text-xs font-black text-white leading-none">{{ progress?.level ?? 1 }}</span>
            </div>
          </UiRadialProgress>
        </div>
      </div>

      <!-- Rank: Text & Lifetime Telemetry (Flexible Width) -->
      <div class="flex-1 flex flex-col justify-between p-3.5 sm:p-4">
        
        <div class="flex flex-col gap-0.5 text-left min-w-0">
          <span class="text-micro text-muted-foreground/60 truncate">{{ t("progress.rank") }}</span>
          <h2 class="text-lg font-black tracking-tight text-foreground leading-snug break-words">
            {{ rankTitle }}
          </h2>
        </div>

        <!-- Lifetime Telemetry (2x2 Grid) -->
        <div class="grid grid-cols-2 gap-x-3 gap-y-2 text-left pt-2 border-t border-white/5">
          <div class="flex flex-col min-w-0">
            <span class="text-micro text-muted-foreground/60 truncate">{{ t("progress.tonnage") }}</span>
            <span class="text-sm font-bold text-foreground tabular-nums truncate">{{ formattedTonnage }}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-micro text-muted-foreground/60 truncate">{{ t("progress.active") }}</span>
            <span class="text-sm font-bold text-foreground tabular-nums truncate">{{ formattedJourney }}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-micro text-muted-foreground/60 truncate">{{ t("progress.workouts") }}</span>
            <span class="text-sm font-bold text-foreground tabular-nums truncate">{{ progress?.totalWorkoutDays ?? 0 }}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-micro text-muted-foreground/60 truncate">{{ t("progress.totalXp") }}</span>
            <span class="text-sm font-bold text-foreground tabular-nums truncate">{{ formattedXP }}</span>
          </div>
        </div>

      </div>
      
    </div>
  </UiCard>
</template>
