import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { useRestTimerStore } from "./restTimerStore";

describe("useRestTimerStore", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("persists targetRestSeconds across store re-instantiation", async () => {
    const store1 = useRestTimerStore();
    store1.start(90);
    await nextTick();
    expect(store1.targetRestSeconds).toBe(90);

    // Simulate reload with a fresh Pinia instance reading from localStorage
    setActivePinia(createPinia());
    const store2 = useRestTimerStore();

    expect(store2.isResting).toBe(true);
    expect(store2.targetRestSeconds).toBe(90);
  });

  it("resets targetRestSeconds to null when start() is called without duration", () => {
    const store = useRestTimerStore();
    store.start(90);
    expect(store.targetRestSeconds).toBe(90);

    store.start();
    expect(store.targetRestSeconds).toBeNull();
  });

  it("formats time as a countdown when targetRestSeconds is set and not in overtime", () => {
    const store = useRestTimerStore();
    store.start(90);
    store.restElapsed = 0;
    expect(store.formattedTime).toBe("1:30");

    store.restElapsed = 25;
    expect(store.formattedTime).toBe("1:05");

    store.restElapsed = 90;
    expect(store.formattedTime).toBe("0:00");
  });

  it("formats time with a leading + when in overtime past targetRestSeconds", () => {
    const store = useRestTimerStore();
    store.start(90);
    store.restElapsed = 95;
    expect(store.isOvertime).toBe(true);
    expect(store.formattedTime).toBe("+0:05");

    store.restElapsed = 160;
    expect(store.formattedTime).toBe("+1:10");
  });

  it("formats time as elapsed count-up when targetRestSeconds is null", () => {
    const store = useRestTimerStore();
    store.start();
    store.restElapsed = 0;
    expect(store.formattedTime).toBe("0:00");

    store.restElapsed = 65;
    expect(store.formattedTime).toBe("1:05");
  });
});
