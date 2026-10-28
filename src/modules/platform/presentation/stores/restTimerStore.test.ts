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
});
