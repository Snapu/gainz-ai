import type { Event } from "@/modules/events/domain";

export type { Event } from "@/modules/events/domain";

export interface EventsRepository {
  load(): Event[];
  save(events: Event[]): void;
}

export function loadEvents(repository: EventsRepository): Event[] {
  return repository.load();
}

export function addEvent(
  existingEvents: Event[],
  event: Event,
  repository: EventsRepository,
): Event[] {
  const nextEvents = [...existingEvents, event];
  repository.save(nextEvents);
  return nextEvents;
}

export function removeEvent(
  existingEvents: Event[],
  id: string,
  repository: EventsRepository,
): Event[] {
  const nextEvents = existingEvents.filter((event) => event.id !== id);
  repository.save(nextEvents);
  return nextEvents;
}
