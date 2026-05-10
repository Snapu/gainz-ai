import { type Event, EventSchema } from "@/modules/events/domain";

const STORAGE_KEY = "events:stored";

export function loadEventsInfra(): Event[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
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
}

export function saveEventsInfra(events: Event[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}
