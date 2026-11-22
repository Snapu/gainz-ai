<script setup lang="ts">
import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date";
import { Bed, Plus } from "@lucide/vue";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import type { AppEvent } from "@/modules/events/presentation";
import { useEventsStore } from "@/modules/events/presentation";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import EmptyState from "@/shared/presentation/components/EmptyState.vue";
import RestRecoveryItem from "@/shared/presentation/components/RestRecoveryItem.vue";
import UiBottomSheet from "@/shared/presentation/components/ui/UiBottomSheet.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiInput from "@/shared/presentation/components/ui/UiInput.vue";
import UiRangeCalendar from "@/shared/presentation/components/ui/UiRangeCalendar.vue";
import UiToggleGroup from "@/shared/presentation/components/ui/UiToggleGroup.vue";
import UiToggleGroupItem from "@/shared/presentation/components/ui/UiToggleGroupItem.vue";
import { t } from "@/shared/presentation/i18n";

const router = useRouter();
const eventsStore = useEventsStore();

const PRESET_TYPE_OPTIONS = [
  { value: "Rest Day", key: "recovery.types.restDay" },
  { value: "Sickness", key: "recovery.types.sickness" },
  { value: "Injury", key: "recovery.types.injury" },
  { value: "Fasting", key: "recovery.types.fasting" },
  { value: "Other", key: "recovery.types.other" },
] as const;

const isAddOpen = ref(false);
const formType = ref<string>("Rest Day");
const formCustomType = ref("");

// Default to today
const now = today(getLocalTimeZone());

// Use a more relaxed type for the ref to avoid ZonedDateTime mismatch
// biome-ignore lint/suspicious/noExplicitAny: v-model mismatch with Reka UI DateRange
const dateRange = ref<any>({
  start: now,
  end: now,
});

const isSaveDisabled = computed(
  () =>
    (formType.value === "Other" && !formCustomType.value.trim()) ||
    !dateRange.value?.start ||
    !dateRange.value?.end,
);

function saveEvent() {
  const finalType = formType.value === "Other" ? formCustomType.value.trim() : formType.value;
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
  <div class="h-full bg-background flex flex-col overflow-hidden pt-safe">
    <!-- Header -->
    <AppHeader show-back :title="t('recovery.title')" class="shrink-0" @back="router.back()">
      <template #actions>
        <UiButton variant="ghost" size="icon" @click="isAddOpen = true" :aria-label="t('recovery.addAria')">
          <Plus class="w-5 h-5" />
        </UiButton>
      </template>
    </AppHeader>

    <p class="w-full max-w-2xl mx-auto px-4 pt-4 text-xs font-medium text-muted-foreground shrink-0">{{ t("recovery.intro") }}</p>

    <!-- Event List -->
    <main class="flex-1 min-h-0 w-full max-w-2xl mx-auto px-4 pt-4 pb-28 overflow-y-auto overscroll-y-contain no-scrollbar flex flex-col gap-4">
      <EmptyState 
        v-if="sortedEvents.length === 0"
        :icon="Bed"
        :title="t('recovery.emptyTitle')"
        :description="t('recovery.emptyDesc')"
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
    <UiBottomSheet v-model:open="isAddOpen" :title="t('recovery.sheetTitle')">
      <!-- Scrollable Content -->
      <div class="flex flex-col gap-6 overflow-y-auto px-6 py-4 no-scrollbar">
        <div>
          <label class="text-micro text-muted-foreground/60 mb-2 block ml-1">{{ t("recovery.typeLabel") }}</label>
          <UiToggleGroup type="single" v-model="formType" class="grid grid-cols-2 gap-3">
            <UiToggleGroupItem v-for="option in PRESET_TYPE_OPTIONS" :key="option.value" :value="option.value">
              {{ t(option.key) }}
            </UiToggleGroupItem>
          </UiToggleGroup>
        </div>

        <div v-if="formType === 'Other'" class="animate-in slide-in-from-top-2 fade-in">
          <label class="text-micro text-muted-foreground/60 mb-2 block ml-1">{{ t("recovery.customTypeLabel") }}</label>
          <UiInput v-model="formCustomType" :placeholder="t('recovery.customPlaceholder')" class="h-12" />
        </div>

        <div>
          <label class="text-micro text-muted-foreground/60 mb-2 block ml-1">{{ t("recovery.datesLabel") }}</label>
          <UiRangeCalendar v-model="dateRange" />
        </div>
      </div>

      <template #footer>
        <UiButton
          haptic
          :disabled="isSaveDisabled"
          class="w-full h-14 rounded-xl text-base font-bold shadow-lg shadow-lg/20 transition-all active:scale-95"
          @click="saveEvent"
        >
          {{ t("recovery.saveEntry") }}
        </UiButton>
      </template>
    </UiBottomSheet>
  </div>
</template>

