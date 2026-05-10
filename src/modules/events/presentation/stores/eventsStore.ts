import { defineStore } from "pinia";
import { type Ref, ref } from "vue";
import { addEvent, type Event, loadEvents, removeEvent } from "@/modules/events/application";
import { createEventsRepository } from "@/modules/events/infrastructure";

export const useEventsStore = defineStore("events", () => {
  const repository = createEventsRepository();
  const events: Ref<Event[]> = ref(loadEvents(repository));

  function addEventToStore(event: Event): void {
    events.value = addEvent(events.value, event, repository);
  }

  function removeEventFromStore(id: string): void {
    events.value = removeEvent(events.value, id, repository);
  }

  return {
    events,
    addEvent: addEventToStore,
    removeEvent: removeEventFromStore,
  };
});
