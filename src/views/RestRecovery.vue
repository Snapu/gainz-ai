<script setup lang="ts">
import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date";
import { ArrowLeft, Moon, Plus, X } from "@lucide/vue";
import { haptic } from "ios-haptics";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import EmptyState from "@/components/EmptyState.vue";
import RestRecoveryItem from "@/components/RestRecoveryItem.vue";
import UiBottomSheet from "@/components/ui/UiBottomSheet.vue";
import UiButton from "@/components/ui/UiButton.vue";
import UiCard from "@/components/ui/UiCard.vue";
import UiInput from "@/components/ui/UiInput.vue";
import UiRangeCalendar from "@/components/ui/UiRangeCalendar.vue";
import UiToggleGroup from "@/components/ui/UiToggleGroup.vue";
import UiToggleGroupItem from "@/components/ui/UiToggleGroupItem.vue";
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
  haptic.confirm();
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
    <AppHeader>
      <UiButton variant="ghost" size="icon" @click="router.back()" class="mr-4 -ml-2">
        <ArrowLeft class="w-6 h-6" />
      </UiButton>
      <h1 class="text-xl font-black tracking-tight flex-1">Rest & Recovery</h1>
      <UiButton variant="ghost" size="icon" @click="isAddOpen = true">
        <Plus class="w-6 h-6" />
      </UiButton>
    </AppHeader>

    <p class="px-6 pt-4 text-sm text-muted-foreground">Track rest days, illness, injuries, and other off days so your AI coach can account for them.</p>

    <!-- Event List -->
    <main class="flex-1 px-6 py-6 overflow-y-auto pb-32">
      <EmptyState 
        v-if="sortedEvents.length === 0"
        :icon="Moon"
        title="No off days logged."
        description="Tap + to record a rest day, sickness, or injury."
      />

      <UiCard
        v-if="sortedEvents.length > 0"
        variant="list"
      >
        <RestRecoveryItem 
          v-for="ev in sortedEvents" 
          :key="ev.id"
          :event="ev"
          @delete="remove"
        />
      </UiCard>
    </main>

    <!-- Log Recovery Bottom Sheet -->
    <UiBottomSheet v-model:open="isAddOpen" content-class="p-0 gap-0">
      <template #header>
        <div class="flex items-center justify-between p-6 pb-2 shrink-0">
          <h2 class="text-2xl font-bold tracking-tight">Log Recovery</h2>
          <button @click="isAddOpen = false" class="rounded-full p-2.5 bg-white/5 hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-primary active:scale-95">
            <X class="w-5 h-5 text-muted-foreground hover:text-foreground" />
            <span class="sr-only">Close</span>
          </button>
        </div>
      </template>

      <!-- Scrollable Content -->
      <div class="flex flex-col gap-6 overflow-y-auto px-6 py-4 no-scrollbar">
        <div>
          <label class="text-xs font-semibold text-muted-foreground mb-3 block ml-1 uppercase tracking-wider">Type</label>
          <UiToggleGroup type="single" v-model="formType" class="grid grid-cols-2 gap-2">
            <UiToggleGroupItem v-for="t in PRESET_TYPES" :key="t" :value="t" variant="ghost" size="sm">
              {{ t }}
            </UiToggleGroupItem>
          </UiToggleGroup>
        </div>

        <div v-if="formType === 'Other'" class="animate-in slide-in-from-top-2 fade-in">
          <label class="text-xs font-semibold text-muted-foreground mb-2 block ml-1 uppercase tracking-wider">Custom Type</label>
          <UiInput v-model="formCustomType" placeholder="e.g. Travel" class="h-12" />
        </div>

        <div>
          <label class="text-xs font-semibold text-muted-foreground mb-3 block ml-1 uppercase tracking-wider">Dates</label>
          <UiRangeCalendar v-model="dateRange" />
        </div>
      </div>

      <!-- Docked Footer Action -->
      <div class="px-6 pb-safe pt-4 shrink-0 bg-background/95 backdrop-blur z-10 border-t border-white/5">
        <UiButton class="w-full h-14 rounded-2xl text-base font-black mb-6 shadow-lg shadow-primary/20 transition-all active:scale-[0.98]" @click="saveEvent">
          Save Entry
        </UiButton>
      </div>
    </UiBottomSheet>
  </div>
</template>

