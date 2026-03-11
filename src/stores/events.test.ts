import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEventsStore } from "@/stores/events";
import type { Event } from "@/types/event";

// Helper to create test events
function createEvent(
  type: string,
  startDate: Date,
  endDate: Date,
  id: string = crypto.randomUUID(),
): Event {
  return {
    id,
    type,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
}

describe("useEventsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("should return reactive events array", () => {
      const store = useEventsStore();
      expect(store.events).toBeDefined();
      expect(Array.isArray(store.events)).toBe(true);
      expect(store.events).toHaveLength(0);
    });

    it("should restore events from localStorage on initialization", () => {
      const testEvent = createEvent("Sickness", new Date("2024-03-01"), new Date("2024-03-05"));
      const stored = JSON.stringify([testEvent]);

      vi.spyOn(localStorage, "getItem").mockReturnValue(stored);

      setActivePinia(createPinia());
      const store = useEventsStore();

      expect(store.events).toHaveLength(1);
      expect(store.events[0]).toEqual(testEvent);
    });
  });

  describe("addEvent", () => {
    it("should add event to array", () => {
      const store = useEventsStore();
      const event = createEvent("Injury", new Date("2024-03-01"), new Date("2024-03-10"));

      store.addEvent(event);

      expect(store.events).toHaveLength(1);
      expect(store.events[0]).toEqual(event);
    });

    it("should persist event to localStorage after adding", () => {
      const store = useEventsStore();
      const event = createEvent("Rest Day", new Date("2024-03-15"), new Date("2024-03-15"));

      vi.spyOn(localStorage, "setItem");
      store.addEvent(event);

      expect(localStorage.setItem).toHaveBeenCalledWith("events:stored", JSON.stringify([event]));
    });

    it("should add multiple events", () => {
      const store = useEventsStore();
      const event1 = createEvent("Sickness", new Date("2024-03-01"), new Date("2024-03-05"));
      const event2 = createEvent("Injury", new Date("2024-03-10"), new Date("2024-03-20"));

      store.addEvent(event1);
      store.addEvent(event2);

      expect(store.events).toHaveLength(2);
      expect(store.events).toContainEqual(event1);
      expect(store.events).toContainEqual(event2);
    });
  });

  describe("removeEvent", () => {
    it("should remove event by id", () => {
      const store = useEventsStore();
      const event1 = createEvent("Sickness", new Date("2024-03-01"), new Date("2024-03-05"));
      const event2 = createEvent("Injury", new Date("2024-03-10"), new Date("2024-03-20"));

      store.addEvent(event1);
      store.addEvent(event2);

      store.removeEvent(event1.id);

      expect(store.events).toHaveLength(1);
      expect(store.events[0]).toEqual(event2);
    });

    it("should persist changes to localStorage after removal", () => {
      const store = useEventsStore();
      const event = createEvent("Fasting", new Date("2024-03-15"), new Date("2024-03-15"));

      store.addEvent(event);
      vi.spyOn(localStorage, "setItem").mockClear();

      store.removeEvent(event.id);

      expect(localStorage.setItem).toHaveBeenCalledWith("events:stored", JSON.stringify([]));
    });

    it("should handle removing non-existent event gracefully", () => {
      const store = useEventsStore();
      const event = createEvent("Sickness", new Date("2024-03-01"), new Date("2024-03-05"));

      store.addEvent(event);
      store.removeEvent("non-existent-id");

      expect(store.events).toHaveLength(1);
    });
  });

  describe("getEventsByDateRange", () => {
    it("should return empty array when no events exist", () => {
      const store = useEventsStore();
      const start = new Date("2024-03-01");
      const end = new Date("2024-03-31");

      const result = store.getEventsByDateRange(start, end);

      expect(result).toEqual([]);
    });

    it("should filter events within date range", () => {
      const store = useEventsStore();
      const event1 = createEvent("Sickness", new Date("2024-03-05"), new Date("2024-03-10"));
      const event2 = createEvent("Injury", new Date("2024-03-15"), new Date("2024-03-20"));
      const event3 = createEvent("Rest Day", new Date("2024-04-01"), new Date("2024-04-01"));

      store.addEvent(event1);
      store.addEvent(event2);
      store.addEvent(event3);

      const result = store.getEventsByDateRange(new Date("2024-03-01"), new Date("2024-03-31"));

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(event1);
      expect(result).toContainEqual(event2);
    });

    it("should include events that start before and end after range", () => {
      const store = useEventsStore();
      const event = createEvent("Long Injury", new Date("2024-02-01"), new Date("2024-04-01"));

      store.addEvent(event);

      const result = store.getEventsByDateRange(new Date("2024-03-01"), new Date("2024-03-31"));

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(event);
    });

    it("should exclude events that end before range start", () => {
      const store = useEventsStore();
      const event = createEvent("Sickness", new Date("2024-02-01"), new Date("2024-02-28"));

      store.addEvent(event);

      const result = store.getEventsByDateRange(new Date("2024-03-01"), new Date("2024-03-31"));

      expect(result).toHaveLength(0);
    });

    it("should exclude events that start after range end", () => {
      const store = useEventsStore();
      const event = createEvent("Injury", new Date("2024-04-01"), new Date("2024-04-10"));

      store.addEvent(event);

      const result = store.getEventsByDateRange(new Date("2024-03-01"), new Date("2024-03-31"));

      expect(result).toHaveLength(0);
    });
  });

  describe("localStorage persistence", () => {
    it("should persist events across store re-initialization", () => {
      const event = createEvent("Fasting", new Date("2024-03-10"), new Date("2024-03-10"));

      let store = useEventsStore();
      store.addEvent(event);

      // Re-initialize store
      setActivePinia(createPinia());
      store = useEventsStore();

      expect(store.events).toHaveLength(1);
      expect(store.events[0]).toEqual(event);
    });

    it("should handle empty localStorage gracefully", () => {
      vi.spyOn(localStorage, "getItem").mockReturnValue(null);

      setActivePinia(createPinia());
      const store = useEventsStore();

      expect(store.events).toHaveLength(0);
    });

    it("should handle corrupted localStorage JSON gracefully", () => {
      vi.spyOn(localStorage, "getItem").mockReturnValue("invalid json");

      setActivePinia(createPinia());
      const store = useEventsStore();

      expect(store.events).toHaveLength(0);
    });
  });
});
