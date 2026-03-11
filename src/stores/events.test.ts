import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEventsStore } from "@/stores/events";
import type { Event } from "@/types/event";

// Helper to create test events
function createEvent(
  type: string,
  dates: string[],
  id: string = crypto.randomUUID(),
): Event {
  return { id, type, dates };
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
      const testEvent = createEvent("Sickness", ["2024-03-01", "2024-03-02", "2024-03-03", "2024-03-04", "2024-03-05"]);
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
      const event = createEvent("Injury", ["2024-03-01", "2024-03-02", "2024-03-03", "2024-03-04", "2024-03-05", "2024-03-06", "2024-03-07", "2024-03-08", "2024-03-09", "2024-03-10"]);

      store.addEvent(event);

      expect(store.events).toHaveLength(1);
      expect(store.events[0]).toEqual(event);
    });

    it("should persist event to localStorage after adding", () => {
      const store = useEventsStore();
      const event = createEvent("Rest Day", ["2024-03-15"]);

      vi.spyOn(localStorage, "setItem");
      store.addEvent(event);

      expect(localStorage.setItem).toHaveBeenCalledWith("events:stored", JSON.stringify([event]));
    });

    it("should add multiple events", () => {
      const store = useEventsStore();
      const event1 = createEvent("Sickness", ["2024-03-01", "2024-03-02", "2024-03-03", "2024-03-04", "2024-03-05"]);
      const event2 = createEvent("Injury", ["2024-03-10", "2024-03-11", "2024-03-12", "2024-03-13", "2024-03-14", "2024-03-15", "2024-03-16", "2024-03-17", "2024-03-18", "2024-03-19", "2024-03-20"]);

      store.addEvent(event1);
      store.addEvent(event2);

      expect(store.events).toHaveLength(2);
      expect(store.events).toContainEqual(event1);
      expect(store.events).toContainEqual(event2);
    });

    it("should add event with single date", () => {
      const store = useEventsStore();
      const event = createEvent("Single Day Event", ["2024-03-15"]);

      store.addEvent(event);

      expect(store.events).toHaveLength(1);
      expect(store.events[0].dates).toEqual(["2024-03-15"]);
    });

    it("should add event with multiple dates", () => {
      const store = useEventsStore();
      const event = createEvent("Multi Day Event", ["2024-03-10", "2024-03-11", "2024-03-12"]);

      store.addEvent(event);

      expect(store.events).toHaveLength(1);
      expect(store.events[0].dates).toHaveLength(3);
      expect(store.events[0].dates).toContain("2024-03-10");
    });
  });

  describe("removeEvent", () => {
    it("should remove event by id", () => {
      const store = useEventsStore();
      const event1 = createEvent("Sickness", ["2024-03-01", "2024-03-02", "2024-03-03", "2024-03-04", "2024-03-05"]);
      const event2 = createEvent("Injury", ["2024-03-10", "2024-03-11", "2024-03-12", "2024-03-13", "2024-03-14", "2024-03-15", "2024-03-16", "2024-03-17", "2024-03-18", "2024-03-19", "2024-03-20"]);

      store.addEvent(event1);
      store.addEvent(event2);

      store.removeEvent(event1.id);

      expect(store.events).toHaveLength(1);
      expect(store.events[0]).toEqual(event2);
    });

    it("should persist changes to localStorage after removal", () => {
      const store = useEventsStore();
      const event = createEvent("Fasting", ["2024-03-15"]);

      store.addEvent(event);
      vi.spyOn(localStorage, "setItem").mockClear();

      store.removeEvent(event.id);

      expect(localStorage.setItem).toHaveBeenCalledWith("events:stored", JSON.stringify([]));
    });

    it("should handle removing non-existent event gracefully", () => {
      const store = useEventsStore();
      const event = createEvent("Sickness", ["2024-03-01", "2024-03-02", "2024-03-03", "2024-03-04", "2024-03-05"]);

      store.addEvent(event);
      store.removeEvent("non-existent-id");

      expect(store.events).toHaveLength(1);
    });
  });

  describe("localStorage persistence", () => {
    it("should persist events across store re-initialization", () => {
      const event = createEvent("Fasting", ["2024-03-10"]);

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
