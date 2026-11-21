import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("auto-stops rest timer once overtime reaches 10 minutes", async () => {
    vi.useFakeTimers();
    try {
      const startMs = new Date("2026-11-21T10:00:00Z").getTime();
      vi.setSystemTime(startMs);

      const store = useRestTimerStore();
      store.start(90);
      await nextTick();

      // At 9:59 of overtime (90s target + 599s overtime) -> still resting
      vi.advanceTimersByTime((90 + 599) * 1000);
      expect(store.isResting).toBe(true);
      expect(store.isOvertime).toBe(true);
      expect(store.formattedTime).toBe("+9:59");

      // 1 second later (10:00 of overtime) -> auto-stops and clears state
      vi.advanceTimersByTime(1000);
      expect(store.isResting).toBe(false);
      expect(store.restStartTime).toBeNull();
      expect(store.targetRestSeconds).toBeNull();
      expect(store.restElapsed).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears a stale persisted rest timer that is already past 10 minutes of overtime on re-instantiation", async () => {
    vi.useFakeTimers();
    try {
      const nowMs = new Date("2026-11-21T10:15:00Z").getTime();
      vi.setSystemTime(nowMs);

      const staleStartMs = nowMs - (90 + 600) * 1000;
      localStorage.setItem("gainz:restStartTime", JSON.stringify(staleStartMs));
      localStorage.setItem("gainz:targetRestSeconds", JSON.stringify(90));

      setActivePinia(createPinia());
      const store = useRestTimerStore();
      expect(vi.getTimerCount()).toBe(0);
      await nextTick();

      expect(store.isResting).toBe(false);
      expect(store.restStartTime).toBeNull();
      expect(store.targetRestSeconds).toBeNull();
      expect(store.restElapsed).toBe(0);
      expect(localStorage.getItem("gainz:restStartTime")).toBeNull();
      expect(localStorage.getItem("gainz:targetRestSeconds")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps interval running and resets restElapsed when reset() and start() run within the same millisecond", async () => {
    vi.useFakeTimers();
    try {
      const startMs = new Date("2026-11-21T10:00:00Z").getTime();
      vi.setSystemTime(startMs);

      const store = useRestTimerStore();
      store.start(60);
      await nextTick();

      store.restElapsed = 30;
      store.reset();
      store.start(90);

      expect(store.restElapsed).toBe(0);
      expect(store.isResting).toBe(true);

      await nextTick();
      vi.advanceTimersByTime(10 * 1000);
      expect(store.restElapsed).toBe(10);
      expect(store.formattedTime).toBe("1:20");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not auto-stop open-ended count-up rest when targetRestSeconds is null", async () => {
    vi.useFakeTimers();
    try {
      const startMs = new Date("2026-11-21T10:00:00Z").getTime();
      vi.setSystemTime(startMs);

      const store = useRestTimerStore();
      store.start();
      await nextTick();

      vi.advanceTimersByTime(15 * 60 * 1000);
      expect(store.isResting).toBe(true);
      expect(store.isOvertime).toBe(false);
      expect(store.formattedTime).toBe("15:00");
    } finally {
      vi.useRealTimers();
    }
  });
});
