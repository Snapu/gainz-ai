import type { Event } from "@/modules/events/domain";

export type { Event } from "@/modules/events/domain";

export function loadEvents(events: Event[]): Event[] {
  return events;
}

export function addEvent(existingEvents: Event[], event: Event): Event[] {
  return [...existingEvents, event];
}

export function removeEvent(existingEvents: Event[], id: string): Event[] {
  return existingEvents.filter((event) => event.id !== id);
}
