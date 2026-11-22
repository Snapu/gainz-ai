<script setup lang="ts">
import { getLocalTimeZone, parseDate } from "@internationalized/date";
import { computed } from "vue";
import type { AppEvent } from "@/modules/events/presentation";
import UiSwipeableItem from "@/shared/presentation/components/ui/UiSwipeableItem.vue";
import { t } from "@/shared/presentation/i18n";
import { formatMediumDate } from "@/shared/presentation/i18n/formatters";

const props = defineProps<{
  event: AppEvent;
}>();

const emit = defineEmits<(e: "delete", id: string) => void>();

const PRESET_TYPE_KEYS = {
  "Rest Day": "recovery.types.restDay",
  Sickness: "recovery.types.sickness",
  Injury: "recovery.types.injury",
  Fasting: "recovery.types.fasting",
} as const satisfies Record<string, string>;

const displayType = computed(() => {
  const key = PRESET_TYPE_KEYS[props.event.type as keyof typeof PRESET_TYPE_KEYS];
  return key ? t(key) : props.event.type;
});

function formatDateString(dateStr: string): string {
  try {
    const date = parseDate(dateStr);
    return formatMediumDate(date.toDate(getLocalTimeZone()));
  } catch {
    return dateStr;
  }
}

function formatEventDate(dates: string[]): string {
  const first = dates[0];
  if (!first) return "";
  if (dates.length === 1) return formatDateString(first);
  const last = dates[dates.length - 1];
  if (!last) return formatDateString(first);
  return `${formatDateString(first)} - ${formatDateString(last)}`;
}
</script>

<template>
  <UiSwipeableItem variant="inset" @action="emit('delete', props.event.id)">
    <div class="flex justify-between items-center">
      <h3 class="text-sm font-semibold text-foreground tracking-tight">{{ displayType }}</h3>
      <p class="text-xs font-semibold tabular-nums text-primary">{{ formatEventDate(event.dates) }}</p>
    </div>
  </UiSwipeableItem>
</template>
