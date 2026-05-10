<script setup lang="ts">
import { getLocalTimeZone, parseDate } from "@internationalized/date";
import type { Event as AppEvent } from "@/modules/events/domain";
import UiSwipeToDeleteItem from "@/shared/presentation/components/ui/UiSwipeToDeleteItem.vue";

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
  if (dates.length === 0) return "";
  const first = dates[0]!;
  if (dates.length === 1) return formatDateString(first);
  const last = dates[dates.length - 1]!;
  return `${formatDateString(first)} - ${formatDateString(last)}`;
}
</script>

<template>
  <UiSwipeToDeleteItem variant="inset" @delete="emit('delete', props.event.id)">
    <div class="flex justify-between items-center">
      <h3 class="font-bold text-sm text-foreground tracking-tight">{{ event.type }}</h3>
      <p class="text-xs text-primary font-bold tracking-wider uppercase">{{ formatEventDate(event.dates) }}</p>
    </div>
  </UiSwipeToDeleteItem>
</template>
