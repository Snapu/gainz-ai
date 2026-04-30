<script setup lang="ts">
import { getLocalTimeZone, today } from "@internationalized/date";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import type { DateRange } from "reka-ui";
import {
  RangeCalendarCell,
  RangeCalendarCellTrigger,
  RangeCalendarGrid,
  RangeCalendarGridBody,
  RangeCalendarGridHead,
  RangeCalendarGridRow,
  RangeCalendarHeadCell,
  RangeCalendarHeader,
  RangeCalendarHeading,
  RangeCalendarNext,
  RangeCalendarPrev,
  RangeCalendarRoot,
} from "reka-ui";

const modelValue = defineModel<DateRange>();
const now = today(getLocalTimeZone());
</script>

<template>
  <RangeCalendarRoot
    v-model="modelValue"
    weekday-format="short"
    :week-starts-on="1"
    fixed-weeks
    v-slot="{ grid, weekDays }"
    class="rounded-2xl bg-card/60 border border-white/5 p-3 backdrop-blur-md w-full"
  >
    <RangeCalendarHeader class="flex items-center justify-between mb-1">
      <RangeCalendarPrev
        class="inline-flex items-center justify-center rounded-xl w-9 h-9 bg-transparent hover:bg-white/10 active:scale-90 transition-all cursor-pointer text-muted-foreground hover:text-foreground outline-none"
      >
        <ChevronLeft class="w-5 h-5" />
      </RangeCalendarPrev>

      <RangeCalendarHeading class="text-sm font-bold text-foreground tracking-tight" />

      <RangeCalendarNext
        class="inline-flex items-center justify-center rounded-xl w-9 h-9 bg-transparent hover:bg-white/10 active:scale-90 transition-all cursor-pointer text-muted-foreground hover:text-foreground outline-none"
      >
        <ChevronRight class="w-5 h-5" />
      </RangeCalendarNext>
    </RangeCalendarHeader>

    <div class="flex flex-col gap-2">
      <RangeCalendarGrid v-for="month in grid" :key="month.value.toString()" class="w-full border-collapse">
        <RangeCalendarGridHead>
          <RangeCalendarGridRow class="flex w-full">
            <RangeCalendarHeadCell
              v-for="day in weekDays"
              :key="day"
              class="flex-1 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground pb-2"
            >
              {{ day }}
            </RangeCalendarHeadCell>
          </RangeCalendarGridRow>
        </RangeCalendarGridHead>

        <RangeCalendarGridBody>
          <RangeCalendarGridRow
            v-for="(row, index) in month.rows"
            :key="`row-${index}`"
            class="flex w-full"
          >
            <RangeCalendarCell
              v-for="date in row"
              :key="date.toString()"
              :date="date"
              class="relative flex-1 text-center p-0.5"
            >
              <RangeCalendarCellTrigger
                :day="date"
                :month="month.value"
                class="relative inline-flex items-center justify-center rounded-xl w-full aspect-square text-sm font-semibold transition-all cursor-pointer
                  text-foreground/70 hover:bg-white/10 hover:text-foreground
                  data-[today]:text-primary data-[today]:font-black
                  data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:font-bold data-[selected]:shadow-lg data-[selected]:shadow-primary/20
                  data-[highlighted]:bg-primary/15 data-[highlighted]:text-primary
                  data-[selection-start]:rounded-l-xl data-[selection-start]:bg-primary data-[selection-start]:text-primary-foreground
                  data-[selection-end]:rounded-r-xl data-[selection-end]:bg-primary data-[selection-end]:text-primary-foreground
                  data-[outside-view]:text-foreground/20 data-[outside-view]:pointer-events-none
                  data-[disabled]:text-foreground/10 data-[disabled]:pointer-events-none
                  data-[unavailable]:text-destructive/50 data-[unavailable]:line-through
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
            </RangeCalendarCell>
          </RangeCalendarGridRow>
        </RangeCalendarGridBody>
      </RangeCalendarGrid>
    </div>
  </RangeCalendarRoot>
</template>
