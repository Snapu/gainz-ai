import { defineStore } from "pinia";
import { type Ref, ref } from "vue";
import type { Event } from "@/types/event";

const STORAGE_KEY = "events:stored";

export const useEventsStore = defineStore("events", () => {
  const loadInitialEvents = (): Event[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const events: Ref<Event[]> = ref(loadInitialEvents());

  const persistEvents = (): void => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.value));
  };

  function addEvent(event: Event): void {
    events.value.push(event);
    persistEvents();
  }

  function removeEvent(id: string): void {
    events.value = events.value.filter((e) => e.id !== id);
    persistEvents();
  }

  function getEventsByDateRange(start: Date, end: Date): Event[] {
    return events.value.filter((event) => {
      const eventStart = new Date(event.startDate);
      const eventEnd = new Date(event.endDate);

      // Event overlaps with range if:
      // - event ends after or at range start AND
      // - event starts before or at range end
      return eventEnd >= start && eventStart <= end;
    });
  }

  return {
    events,
    addEvent,
    removeEvent,
    getEventsByDateRange,
  };
});
