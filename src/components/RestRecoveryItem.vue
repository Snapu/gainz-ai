<script setup lang="ts">
import { getLocalTimeZone, parseDate } from "@internationalized/date";
import { usePointerSwipe } from "@vueuse/core";
import { Trash } from "lucide-vue-next";
import { ref } from "vue";
import type { Event as AppEvent } from "@/types/event";

const props = defineProps<{
  event: AppEvent;
}>();

const emit = defineEmits<(e: "delete", id: string) => void>();

const itemRef = ref<HTMLElement | null>(null);
const { distanceX, isSwiping } = usePointerSwipe(itemRef, {
  onSwipeEnd(e, direction) {
    if (direction === "left" && distanceX.value > 80) {
      emit("delete", props.event.id);
    }
  },
});

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
  <div class="relative w-full overflow-hidden rounded-2xl bg-destructive/20 border border-destructive/20">
    <!-- Background delete action -->
    <div class="absolute inset-y-0 right-0 flex items-center justify-end px-6 text-destructive">
      <Trash class="w-6 h-6" />
    </div>
    
    <!-- Foreground content -->
    <div 
      ref="itemRef"
      class="relative w-full bg-card/80 backdrop-blur-md p-5 rounded-2xl border border-white/5 shadow-sm transition-transform touch-pan-y"
      :style="{ transform: isSwiping && distanceX > 0 ? `translateX(-${distanceX}px)` : '' }"
    >
      <div class="flex justify-between items-start">
        <div>
          <h3 class="font-bold text-lg text-foreground tracking-tight">{{ event.type }}</h3>
          <p class="text-sm text-primary font-semibold tracking-wide mt-1">{{ formatEventDate(event.dates) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
