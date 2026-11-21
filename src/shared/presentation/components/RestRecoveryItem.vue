<script setup lang="ts">
import { getLocalTimeZone, parseDate } from "@internationalized/date";
import type { AppEvent } from "@/modules/events/presentation";
import UiSwipeableItem from "@/shared/presentation/components/ui/UiSwipeableItem.vue";

const props = defineProps<{
  event: AppEvent;
}>();

const emit = defineEmits<(e: "delete", id: string) => void>();

const formatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDateString(dateStr: string) {
  try {
    const date = parseDate(dateStr);
    return formatter.format(date.toDate(getLocalTimeZone()));
  } catch (e) {
    return dateStr;
  }
}

function formatEventDate(dates: string[]) {
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
      <h3 class="text-sm font-semibold text-foreground tracking-tight">{{ event.type }}</h3>
      <p class="text-xs font-semibold tabular-nums text-primary">{{ formatEventDate(event.dates) }}</p>
    </div>
  </UiSwipeableItem>
</template>
