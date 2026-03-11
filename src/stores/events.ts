import { defineStore } from "pinia";
import { type Ref, ref } from "vue";
import { type Event, EventSchema } from "@/types/event";

const STORAGE_KEY = "events:stored";

export const useEventsStore = defineStore("events", () => {
  const loadInitialEvents = (): Event[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];

      const parsed = JSON.parse(stored);

      // Validate each event against schema
      if (!Array.isArray(parsed)) return [];

      const validEvents: Event[] = [];
      for (const item of parsed) {
        const result = EventSchema.safeParse(item);
        if (result.success) {
          validEvents.push(result.data);
        } else {
          console.warn("Skipping invalid event from localStorage:", result.error);
        }
      }

      return validEvents;
    } catch (error) {
      console.error("Failed to load events from localStorage:", error);
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

  return {
    events,
    addEvent,
    removeEvent,
  };
});
