import { defineStore } from "pinia";
import { type Ref, ref } from "vue";
import { addEvent, type Event, loadEvents, removeEvent } from "@/modules/events/application";
import { loadEventsInfra, saveEventsInfra } from "@/modules/events/infrastructure";

export const useEventsStore = defineStore("events", () => {
  const events: Ref<Event[]> = ref(loadEvents(loadEventsInfra()));

  function addEventToStore(event: Event): void {
    const nextEvents = addEvent(events.value, event);
    saveEventsInfra(nextEvents);
    events.value = nextEvents;
  }

  function removeEventFromStore(id: string): void {
    const nextEvents = removeEvent(events.value, id);
    saveEventsInfra(nextEvents);
    events.value = nextEvents;
  }

  return {
    events,
    addEvent: addEventToStore,
    removeEvent: removeEventFromStore,
  };
});
