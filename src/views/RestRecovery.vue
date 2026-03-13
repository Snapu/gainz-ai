<script setup lang="ts">
import { CalendarDate, getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { ArrowLeft, Moon, Plus, Trash } from "lucide-vue-next";
import type { DateRange } from "reka-ui";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import RestRecoveryItem from "@/components/RestRecoveryItem.vue";
import BottomSheet from "@/components/ui/BottomSheet.vue";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import RangeCalendar from "@/components/ui/RangeCalendar.vue";
import ToggleGroup from "@/components/ui/ToggleGroup.vue";
import ToggleGroupItem from "@/components/ui/ToggleGroupItem.vue";
import { useEventsStore } from "@/stores/events";
import type { Event as AppEvent } from "@/types/event";

const router = useRouter();
const eventsStore = useEventsStore();

const PRESET_TYPES = ["Rest Day", "Sickness", "Injury", "Fasting", "Other"];

const isAddOpen = ref(false);
const formType = ref<string>("Rest Day");
const formCustomType = ref("");

// Default to today
const now = today(getLocalTimeZone());
// Use a more relaxed type for the ref to avoid ZonedDateTime mismatch
const dateRange = ref<any>({
  start: now,
  end: now,
});

function saveEvent() {
  const finalType = formType.value === "Other" ? formCustomType.value : formType.value;
  if (!finalType || !dateRange.value.start || !dateRange.value.end) return;

  // Generate all dates in the range for storage consistency
  const dates: string[] = [];
  let current = dateRange.value.start as CalendarDate;
  const end = dateRange.value.end as CalendarDate;

  while (current.compare(end) <= 0) {
    dates.push(current.toString());
    current = current.add({ days: 1 });
  }

  const ev: AppEvent = {
    id: crypto.randomUUID(),
    type: finalType,
    dates,
  };

  eventsStore.addEvent(ev);
  isAddOpen.value = false;

  // Reset range
  dateRange.value = { start: now, end: now };
}

const sortedEvents = computed(() => {
  return [...eventsStore.events].sort((a, b) => (b.dates[0] || "").localeCompare(a.dates[0] || ""));
});

function remove(id: string) {
  eventsStore.removeEvent(id);
}
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col pt-safe">
    <!-- Header -->
    <header class="flex items-center px-4 py-4 sticky top-0 bg-background/90 z-10 backdrop-blur-xl border-b border-white/5">
      <Button variant="ghost" size="icon" @click="router.back()" class="mr-4 -ml-2">
        <ArrowLeft class="w-6 h-6" />
      </Button>
      <h1 class="text-xl font-black tracking-tight flex-1">Rest & Recovery</h1>
      <Button variant="ghost" size="icon" @click="isAddOpen = true">
        <Plus class="w-6 h-6" />
      </Button>
    </header>

    <p class="px-6 pt-4 text-sm text-muted-foreground">Track rest days, illness, injuries, and other off days so your AI coach can account for them.</p>

    <!-- Event List -->
    <main class="flex-1 px-6 py-6 overflow-y-auto pb-32">
      <div v-if="sortedEvents.length === 0" class="flex flex-col items-center justify-center h-40 text-muted-foreground/50">
        <Moon class="w-12 h-12 mb-4 opacity-50" />
        <p class="font-medium text-lg">No off days logged.</p>
        <p class="text-sm mt-1 opacity-70">Tap + to record a rest day, sickness, or injury.</p>
      </div>

      <div class="flex flex-col gap-4">
        <RestRecoveryItem 
          v-for="ev in sortedEvents" 
          :key="ev.id"
          :event="ev"
          @delete="remove"
        />
      </div>
    </main>

    <!-- Log Recovery Bottom Sheet -->
    <BottomSheet v-model:open="isAddOpen" title="Log Recovery">
      <div class="flex flex-col gap-4 max-h-[80vh] overflow-y-auto px-1 pb-4">
        <div>
          <label class="text-xs font-semibold text-muted-foreground mb-2 block ml-1 uppercase tracking-wider">Type</label>
          <ToggleGroup type="single" v-model="formType" class="grid grid-cols-2 gap-2">
            <ToggleGroupItem v-for="t in PRESET_TYPES" :key="t" :value="t" class="h-12 py-0 justify-center font-bold border-white/5 bg-white/5 data-[state=on]:bg-primary text-sm">
              {{ t }}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div v-if="formType === 'Other'" class="animate-in slide-in-from-top-2 fade-in">
          <label class="text-xs font-semibold text-muted-foreground mb-1 block ml-1 uppercase tracking-wider">Custom Type</label>
          <Input v-model="formCustomType" placeholder="e.g. Travel" class="h-12" />
        </div>

        <div>
          <label class="text-xs font-semibold text-muted-foreground mb-2 block ml-1 uppercase tracking-wider">Dates</label>
          <RangeCalendar v-model="dateRange" />
        </div>

        <Button class="w-full h-14 rounded-2xl text-base font-black mt-2 shadow-lg shadow-primary/20 transition-all active:scale-[0.98]" @click="saveEvent">
          Save Entry
        </Button>
      </div>
    </BottomSheet>
  </div>
</template>

