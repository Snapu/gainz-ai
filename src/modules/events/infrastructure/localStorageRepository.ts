import { ok, Result } from "neverthrow";
import { type Event, EventSchema } from "@/modules/events/domain";

const STORAGE_KEY = "events:stored";

type EventStorageLoadError = "load-failed" | "parse-data-failed";

const readStoredEvents = Result.fromThrowable(
  () => localStorage.getItem(STORAGE_KEY),
  () => "load-failed" as const,
);

const parseStoredEvents = Result.fromThrowable(JSON.parse, () => "parse-data-failed" as const);

export function loadEventsInfra(): Event[] {
  return readStoredEvents()
    .andThen((stored) => {
      if (!stored) return ok<unknown, EventStorageLoadError>([]);
      return parseStoredEvents(stored);
    })
    .map((parsed) => {
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
    })
    .mapErr((error) => {
      console.error("Failed to load events from localStorage:", error);
      return error;
    })
    .unwrapOr([]);
}

export function saveEventsInfra(events: Event[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}
