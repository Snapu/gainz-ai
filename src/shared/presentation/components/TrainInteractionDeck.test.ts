import { describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import TrainInteractionDeck from "./TrainInteractionDeck.vue";

describe("TrainInteractionDeck", () => {
  const defaultExercise = {
    exerciseName: "Bench Press",
    targetSets: 3,
    targetReps: "8",
    targetWeight: "80 kg",
    targetRpe: 8,
  };

  it("renders active exercise target and emits logCurrent when primary button is clicked", async () => {
    let emittedLogCurrent = false;

    const Host = defineComponent({
      setup() {
        return () =>
          h(TrainInteractionDeck, {
            currentExercise: defaultExercise,
            currentProgress: { done: 1, isCompleted: false },
            isResting: false,
            restFormattedTime: "00:00",
            isOvertime: false,
            onLogCurrent: () => {
              emittedLogCurrent = true;
            },
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    const eyebrow = container.querySelector("[data-testid='deck-mode-eyebrow']");
    expect(eyebrow?.textContent?.trim()).toBe("Log");
    expect(eyebrow?.nextElementSibling?.textContent?.trim()).toBe("Bench Press");
    expect(container.textContent).not.toContain("Set 2 of 3");

    const mainContainer = container.querySelector("[data-testid='deck-main-container']");
    expect(mainContainer).not.toBeNull();
    expect(mainContainer?.className).toContain("rounded-xl");
    expect(mainContainer?.className).toContain("bg-white/5");

    const logBtn = container.querySelector(
      "button[data-testid='deck-primary-action']",
    ) as HTMLButtonElement | null;
    expect(logBtn).not.toBeNull();
    expect(logBtn?.getAttribute("aria-label")).toBe("Log Set 2");
    expect(logBtn?.className).toContain("bg-primary");
    expect(logBtn?.className).toContain("rounded-full");
    logBtn?.click();
    await nextTick();

    expect(emittedLogCurrent).toBe(true);
    app.unmount();
  });

  it("does not render Tier 1 custom exercise or superset chips during an active workout", async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(TrainInteractionDeck, {
            currentExercise: defaultExercise,
            currentProgress: { done: 0, isCompleted: false },
            isResting: false,
            restFormattedTime: "00:00",
            isOvertime: false,
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    expect(container.querySelector("button[data-testid='deck-custom-exercise']")).toBeNull();
    expect(container.querySelector("button[data-testid='deck-superset-chip']")).toBeNull();
    app.unmount();
  });

  it("renders rest timer with radial ring and icon skip button when isResting is true", async () => {
    let emittedSkipRest = false;
    let emittedLogCurrent = false;

    const Host = defineComponent({
      setup() {
        return () =>
          h(TrainInteractionDeck, {
            currentExercise: defaultExercise,
            currentProgress: { done: 1, isCompleted: false },
            isResting: true,
            restFormattedTime: "1:05",
            restElapsed: 25,
            targetRestSeconds: 90,
            isOvertime: false,
            onSkipRest: () => {
              emittedSkipRest = true;
            },
            onLogCurrent: () => {
              emittedLogCurrent = true;
            },
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    const mainContainer = container.querySelector("[data-testid='deck-main-container']");
    expect(mainContainer?.className).toContain("bg-emerald-500/10");
    expect(mainContainer?.className).toContain("border-emerald-500/20");

    const eyebrow = container.querySelector("[data-testid='deck-mode-eyebrow']");
    expect(eyebrow?.textContent?.trim()).toBe("Rest");
    expect(eyebrow?.nextElementSibling?.textContent?.trim()).toBe("Bench Press");

    expect(container.querySelector("[data-testid='deck-hold-ring']")).toBeNull();

    const restRing = container.querySelector("[data-testid='deck-rest-ring']");
    expect(restRing).not.toBeNull();
    expect(restRing?.textContent).toContain("1:05");
    expect(restRing?.querySelector("span")?.className).toContain("text-emerald-400");

    const circles = restRing?.querySelectorAll("circle") ?? [];
    expect(circles.length).toBe(2);
    const progressCircle = circles[1];
    const progressClass = progressCircle?.getAttribute("class") ?? "";
    expect(progressClass).toContain("stroke-emerald-400");
    expect(progressClass).not.toContain("opacity-0");

    const dashArray = Number.parseFloat(progressCircle?.getAttribute("stroke-dasharray") ?? "0");
    const dashOffset = Number.parseFloat(progressCircle?.getAttribute("stroke-dashoffset") ?? "0");
    expect(dashOffset / dashArray).toBeCloseTo(25 / 90, 3);

    const add30Btn = container.querySelector("button[data-testid='deck-add-30s']");
    expect(add30Btn).toBeNull();

    const skipBtn = container.querySelector(
      "button[data-testid='deck-skip-rest']",
    ) as HTMLButtonElement | null;
    expect(skipBtn).not.toBeNull();
    expect(skipBtn?.textContent?.trim()).toBe("");
    expect(skipBtn?.getAttribute("aria-label")).toBe("Skip Rest");
    skipBtn?.click();
    await nextTick();
    expect(emittedSkipRest).toBe(true);

    const logNextBtn = container.querySelector(
      "button[data-testid='deck-primary-action']",
    ) as HTMLButtonElement | null;
    expect(logNextBtn?.getAttribute("aria-label")).toBe("Log Set 2");
    expect(logNextBtn?.className).toContain("bg-primary");
    logNextBtn?.click();
    await nextTick();
    expect(emittedLogCurrent).toBe(true);

    // Ensure rest ring, skip icon button, and primary action share the right-side controls container (after exercise title)
    expect(restRing?.parentElement).toBe(logNextBtn?.parentElement);
    expect(skipBtn?.parentElement).toBe(logNextBtn?.parentElement);

    app.unmount();
  });

  it("renders Finish Rest button when resting and workout is completed", async () => {
    let emittedSkipRest = false;
    const isOvertime = ref(false);

    const Host = defineComponent({
      setup() {
        return () =>
          h(TrainInteractionDeck, {
            currentExercise: defaultExercise,
            currentProgress: { done: 3, isCompleted: true },
            isResting: true,
            restFormattedTime: isOvertime.value ? "+0:15" : "1:00",
            targetRestSeconds: 90,
            isOvertime: isOvertime.value,
            isWorkoutComplete: true,
            onSkipRest: () => {
              emittedSkipRest = true;
            },
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    const mainContainer = container.querySelector("[data-testid='deck-main-container']");
    expect(mainContainer?.className).toContain("bg-emerald-500/10");
    expect(mainContainer?.className).toContain("border-emerald-500/20");
    expect(container.querySelector("[data-testid='deck-workout-complete-icon']")).toBeNull();
    const eyebrow = container.querySelector("[data-testid='deck-mode-eyebrow']");
    expect(eyebrow?.textContent?.trim()).toBe("Rest");
    expect(container.textContent).toContain("Workout Complete");

    const finishBtn = container.querySelector(
      "button[data-testid='deck-primary-action']",
    ) as HTMLButtonElement | null;
    expect(finishBtn?.getAttribute("aria-label")).toBe("Finish Rest");
    finishBtn?.click();
    await nextTick();

    expect(emittedSkipRest).toBe(true);

    isOvertime.value = true;
    await nextTick();

    expect(mainContainer?.className).toContain("bg-red-500/10");
    expect(mainContainer?.className).toContain("border-red-500/20");
    expect(mainContainer?.className).not.toContain("bg-emerald-500/10");
    expect(eyebrow?.textContent?.trim()).toBe("Rest Overtime");
    expect(container.querySelector("[data-testid='deck-workout-complete-icon']")).toBeNull();

    app.unmount();
  });

  it("renders overtime visual styling on rest ring and deck container when isOvertime is true", async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(TrainInteractionDeck, {
            currentExercise: defaultExercise,
            currentProgress: { done: 1, isCompleted: false },
            isResting: true,
            restFormattedTime: "+0:30",
            restElapsed: 120,
            targetRestSeconds: 90,
            isOvertime: true,
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    const mainContainer = container.querySelector("[data-testid='deck-main-container']");
    expect(mainContainer?.className).toContain("bg-red-500/10");
    expect(mainContainer?.className).toContain("border-red-500/20");

    const eyebrow = container.querySelector("[data-testid='deck-mode-eyebrow']");
    expect(eyebrow?.textContent?.trim()).toBe("Rest Overtime");

    const restRing = container.querySelector("[data-testid='deck-rest-ring']");
    expect(restRing).not.toBeNull();
    expect(restRing?.textContent).toContain("+0:30");
    expect(restRing?.querySelector("span")?.className).toContain("text-red-400");

    const circles = restRing?.querySelectorAll("circle") ?? [];
    expect(circles.length).toBe(2);
    const progressCircle = circles[1];
    const progressClass = progressCircle?.getAttribute("class") ?? "";
    expect(progressClass).toContain("stroke-red-400");
    expect(progressClass).toContain("animate-pulse");
    expect(progressCircle?.getAttribute("stroke-dashoffset")).toBe("0");
    app.unmount();
  });

  it("compacts long rest readouts inside the 40px rest ring for both overtime and open-ended count-up", async () => {
    const restFormattedTime = ref("+10:05");
    const isOvertime = ref(true);
    const targetRestSeconds = ref<number | null>(90);

    const Host = defineComponent({
      setup() {
        return () =>
          h(TrainInteractionDeck, {
            currentExercise: defaultExercise,
            currentProgress: { done: 1, isCompleted: false },
            isResting: true,
            restFormattedTime: restFormattedTime.value,
            restElapsed: 695,
            targetRestSeconds: targetRestSeconds.value,
            isOvertime: isOvertime.value,
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    try {
      app.mount(container);
      await nextTick();

      const restRing = container.querySelector("[data-testid='deck-rest-ring']");
      expect(restRing?.textContent?.trim()).toBe("+10m");

      restFormattedTime.value = "100:00";
      isOvertime.value = false;
      targetRestSeconds.value = null;
      await nextTick();

      expect(restRing?.textContent?.trim()).toBe("100m");
    } finally {
      app.unmount();
    }
  });

  it("renders exercise duration timer with Start and Reset icon toggle and distinct Hold styling", async () => {
    const timedExercise = {
      exerciseName: "Plank",
      targetSets: 3,
      targetReps: "60s",
      targetDurationSeconds: 60,
    };

    const Host = defineComponent({
      setup() {
        return () =>
          h(TrainInteractionDeck, {
            currentExercise: timedExercise,
            currentProgress: { done: 0, isCompleted: false },
            isResting: false,
            restFormattedTime: "0:00",
            isOvertime: false,
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    const mainContainer = container.querySelector("[data-testid='deck-main-container']");
    expect(mainContainer?.className).toContain("bg-white/5");

    const eyebrow = container.querySelector("[data-testid='deck-mode-eyebrow']");
    expect(eyebrow?.textContent?.trim()).toBe("Hold");

    expect(container.querySelector("[data-testid='deck-rest-ring']")).toBeNull();

    const holdRing = container.querySelector("[data-testid='deck-hold-ring']");
    expect(holdRing).not.toBeNull();
    expect(holdRing?.textContent).toContain("1:00");
    expect(eyebrow?.nextElementSibling?.textContent?.trim()).toBe("Plank");

    const timerActionBtn = container.querySelector(
      "button[data-testid='deck-timer-toggle']",
    ) as HTMLButtonElement | null;
    const primaryBtn = container.querySelector("button[data-testid='deck-primary-action']");
    expect(timerActionBtn).not.toBeNull();
    expect(primaryBtn).not.toBeNull();
    expect(holdRing?.parentElement).toBe(primaryBtn?.parentElement);
    expect(timerActionBtn?.parentElement).toBe(primaryBtn?.parentElement);

    // Initially shows Start Timer with tonal primary contrast
    expect(timerActionBtn?.getAttribute("aria-label")).toBe("Start Timer");
    expect(timerActionBtn?.className).toContain("bg-primary/10");
    expect(timerActionBtn?.textContent?.trim()).toBe("");

    // Clicking starts timer, switches eyebrow to Holding, tints deck primary, and switches button to Reset Timer
    timerActionBtn?.click();
    await nextTick();
    expect(eyebrow?.textContent?.trim()).toBe("Holding");
    expect(mainContainer?.className).toContain("bg-primary/10");
    expect(mainContainer?.className).toContain("border-primary/20");
    expect(holdRing?.querySelector(".stroke-primary")).not.toBeNull();
    expect(timerActionBtn?.getAttribute("aria-label")).toBe("Reset Timer");
    expect(container.querySelector("button[data-testid='deck-timer-reset']")).toBeNull();

    // Clicking again resets timer and returns to idle Hold state
    timerActionBtn?.click();
    await nextTick();
    expect(eyebrow?.textContent?.trim()).toBe("Hold");
    expect(mainContainer?.className).toContain("bg-white/5");
    expect(timerActionBtn?.getAttribute("aria-label")).toBe("Start Timer");
    expect(holdRing?.textContent).toContain("1:00");

    app.unmount();
  });

  it("transitions hold timer to emerald Hold Complete state when countdown reaches zero", async () => {
    vi.useFakeTimers();
    let app: ReturnType<typeof createApp> | null = null;
    try {
      const Host = defineComponent({
        setup() {
          return () =>
            h(TrainInteractionDeck, {
              currentExercise: {
                exerciseName: "Plank",
                targetSets: 3,
                targetReps: "5s",
                targetDurationSeconds: 5,
              },
              currentProgress: { done: 0, isCompleted: false },
              isResting: false,
              restFormattedTime: "0:00",
              isOvertime: false,
            });
        },
      });

      const container = document.createElement("div");
      app = createApp(Host);
      app.mount(container);
      await nextTick();

      const timerActionBtn = container.querySelector(
        "button[data-testid='deck-timer-toggle']",
      ) as HTMLButtonElement | null;
      timerActionBtn?.click();
      await nextTick();

      vi.advanceTimersByTime(5200);
      await nextTick();

      const eyebrow = container.querySelector("[data-testid='deck-mode-eyebrow']");
      expect(eyebrow?.textContent?.trim()).toBe("Hold Complete");

      const mainContainer = container.querySelector("[data-testid='deck-main-container']");
      expect(mainContainer?.className).toContain("bg-emerald-500/10");
      expect(mainContainer?.className).toContain("border-emerald-500/20");

      const holdRing = container.querySelector("[data-testid='deck-hold-ring']");
      expect(holdRing?.querySelector(".stroke-emerald-400")).not.toBeNull();
      const completeIcon = holdRing?.querySelector("[data-testid='deck-hold-complete-icon']");
      expect(completeIcon).not.toBeNull();
      expect(completeIcon?.getAttribute("aria-hidden")).toBe("true");

      // Clicking Reset returns to idle Hold state
      timerActionBtn?.click();
      await nextTick();
      expect(eyebrow?.textContent?.trim()).toBe("Hold");
      expect(holdRing?.textContent).toContain("0:05");
      expect(timerActionBtn?.getAttribute("aria-label")).toBe("Start Timer");
    } finally {
      app?.unmount();
      vi.useRealTimers();
    }
  });

  it("resets countdown timer when swiping to a different exercise", async () => {
    const activeEx = ref({
      exerciseName: "Plank",
      targetSets: 3,
      targetDurationSeconds: 60,
    });

    const Host = defineComponent({
      setup() {
        return () =>
          h(TrainInteractionDeck, {
            currentExercise: activeEx.value,
            currentProgress: { done: 0, isCompleted: false },
            isResting: false,
            restFormattedTime: "00:00",
            isOvertime: false,
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    expect(container.textContent).toContain("Plank");
    expect(container.textContent).toContain("1:00");

    // Switch to another timed exercise with different name
    activeEx.value = {
      exerciseName: "Side Plank",
      targetSets: 3,
      targetDurationSeconds: 60,
    };
    await nextTick();

    expect(container.textContent).toContain("Side Plank");
    expect(container.textContent).toContain("1:00");

    app.unmount();
  });

  it("resets countdown timer when currentProgress.done increments on the same timed exercise", async () => {
    const progress = ref({ done: 0, isCompleted: false });

    const Host = defineComponent({
      setup() {
        return () =>
          h(TrainInteractionDeck, {
            currentExercise: {
              exerciseName: "Plank",
              targetSets: 3,
              targetDurationSeconds: 60,
            },
            currentProgress: progress.value,
            isResting: false,
            restFormattedTime: "00:00",
            isOvertime: false,
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    const timerActionBtn = container.querySelector(
      "button[data-testid='deck-timer-toggle']",
    ) as HTMLButtonElement | null;
    expect(timerActionBtn?.getAttribute("aria-label")).toBe("Start Timer");

    // Start the timer (makes it active/dirty)
    timerActionBtn?.click();
    await nextTick();
    expect(timerActionBtn?.getAttribute("aria-label")).toBe("Reset Timer");

    // Logging a set increments done -> should reset timer back to clean Start state
    progress.value = { done: 1, isCompleted: false };
    await nextTick();
    expect(timerActionBtn?.getAttribute("aria-label")).toBe("Start Timer");
    expect(container.querySelector("[data-testid='deck-hold-ring']")?.textContent).toContain(
      "1:00",
    );

    app.unmount();
  });

  it("renders completed state with + Add Extra Set when currentProgress.isCompleted is true but workout is not finished", async () => {
    let emittedLogCurrent = false;

    const Host = defineComponent({
      setup() {
        return () =>
          h(TrainInteractionDeck, {
            currentExercise: defaultExercise,
            currentProgress: { done: 3, isCompleted: true },
            isResting: false,
            restFormattedTime: "00:00",
            isOvertime: false,
            isWorkoutComplete: false,
            onLogCurrent: () => {
              emittedLogCurrent = true;
            },
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    const eyebrow = container.querySelector("[data-testid='deck-mode-eyebrow']");
    expect(eyebrow?.textContent?.trim()).toBe("Log Extra");
    expect(eyebrow?.nextElementSibling?.textContent?.trim()).toBe("Bench Press");

    const extraBtn = container.querySelector(
      "button[data-testid='deck-primary-action']",
    ) as HTMLButtonElement | null;
    expect(extraBtn).not.toBeNull();
    expect(extraBtn?.getAttribute("aria-label")).toBe("Add Extra Set");
    expect(extraBtn?.className).toContain("bg-primary");
    extraBtn?.click();
    await nextTick();

    expect(emittedLogCurrent).toBe(true);
    app.unmount();
  });

  it("renders Workout Complete with emerald success highlight without duplicate custom buttons when isWorkoutComplete is true", async () => {
    let emittedLogCustom = false;

    const Host = defineComponent({
      setup() {
        return () =>
          h(TrainInteractionDeck, {
            currentExercise: defaultExercise,
            currentProgress: { done: 3, isCompleted: true },
            isResting: false,
            restFormattedTime: "00:00",
            isOvertime: false,
            isWorkoutComplete: true,
            onLogCustom: () => {
              emittedLogCustom = true;
            },
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    const mainContainer = container.querySelector("[data-testid='deck-main-container']");
    expect(mainContainer?.className).toContain("bg-emerald-500/10");
    expect(mainContainer?.className).toContain("border-emerald-500/20");

    const completeIcon = container.querySelector("[data-testid='deck-workout-complete-icon']");
    expect(completeIcon).not.toBeNull();
    expect(completeIcon?.getAttribute("class")).toContain("text-emerald-400");
    expect(completeIcon?.getAttribute("aria-hidden")).toBe("true");

    const eyebrow = container.querySelector("[data-testid='deck-mode-eyebrow']");
    expect(eyebrow?.textContent?.trim()).toBe("All Sets Logged");
    expect(eyebrow?.className).toContain("text-emerald-400");
    expect(eyebrow?.nextElementSibling?.textContent?.trim()).toBe("Workout Complete");

    // Tier 1 custom button must NOT be rendered in State D
    const tier1Btn = container.querySelector("button[data-testid='deck-custom-exercise']");
    expect(tier1Btn).toBeNull();

    // Single State D button exists with secondary styling
    const actionBtn = container.querySelector(
      "button[data-testid='deck-log-exercise']",
    ) as HTMLButtonElement | null;
    expect(actionBtn).not.toBeNull();
    expect(actionBtn?.getAttribute("aria-label")).toBe("Log Exercise");
    expect(actionBtn?.className).toContain("bg-white/5");
    expect(actionBtn?.className).not.toContain("bg-primary");
    actionBtn?.click();
    await nextTick();

    expect(emittedLogCustom).toBe(true);
    app.unmount();
  });

  it("renders Rest Day state with neutral surface and primary Log Exercise button when isRestDay is true", async () => {
    let emittedLogCustom = false;

    const Host = defineComponent({
      setup() {
        return () =>
          h(TrainInteractionDeck, {
            currentExercise: null,
            currentProgress: null,
            isResting: false,
            restFormattedTime: "00:00",
            isOvertime: false,
            isRestDay: true,
            onLogCustom: () => {
              emittedLogCustom = true;
            },
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    const mainContainer = container.querySelector("[data-testid='deck-main-container']");
    expect(mainContainer?.className).toContain("bg-white/5");
    expect(mainContainer?.className).not.toContain("bg-emerald-500/10");
    expect(container.querySelector("[data-testid='deck-workout-complete-icon']")).toBeNull();

    expect(container.textContent).toContain("Rest Day");

    const actionBtn = container.querySelector(
      "button[data-testid='deck-log-exercise']",
    ) as HTMLButtonElement | null;
    expect(actionBtn).not.toBeNull();
    expect(actionBtn?.className).toContain("bg-primary");
    actionBtn?.click();
    await nextTick();

    expect(emittedLogCustom).toBe(true);
    app.unmount();
  });

  it("renders No Active Workout state with neutral surface and primary Log Exercise button when no exercise is active", async () => {
    let emittedLogCustom = false;

    const Host = defineComponent({
      setup() {
        return () =>
          h(TrainInteractionDeck, {
            currentExercise: null,
            currentProgress: null,
            isResting: false,
            restFormattedTime: "00:00",
            isOvertime: false,
            isWorkoutComplete: false,
            isRestDay: false,
            onLogCustom: () => {
              emittedLogCustom = true;
            },
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    const mainContainer = container.querySelector("[data-testid='deck-main-container']");
    expect(mainContainer?.className).toContain("bg-white/5");
    expect(mainContainer?.className).not.toContain("bg-emerald-500/10");
    expect(container.querySelector("[data-testid='deck-workout-complete-icon']")).toBeNull();

    expect(container.textContent).toContain("No Active Workout");

    const actionBtn = container.querySelector(
      "button[data-testid='deck-log-exercise']",
    ) as HTMLButtonElement | null;
    expect(actionBtn).not.toBeNull();
    expect(actionBtn?.className).toContain("bg-primary");
    actionBtn?.click();
    await nextTick();

    expect(emittedLogCustom).toBe(true);
    app.unmount();
  });

  it("renders static emerald track without progress arc for open-ended count-up rest when targetRestSeconds is null", async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(TrainInteractionDeck, {
            currentExercise: defaultExercise,
            currentProgress: { done: 1, isCompleted: false },
            isResting: true,
            restFormattedTime: "0:42",
            restElapsed: 42,
            targetRestSeconds: null,
            isOvertime: false,
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    try {
      app.mount(container);
      await nextTick();

      const restRing = container.querySelector("[data-testid='deck-rest-ring']");
      expect(restRing).not.toBeNull();
      expect(restRing?.textContent).toContain("0:42");
      expect(restRing?.querySelector("span")?.className).toContain("text-emerald-400");

      const circles = restRing?.querySelectorAll("circle") ?? [];
      expect(circles.length).toBe(2);
      expect(circles[0]?.getAttribute("class")).toContain("text-emerald-400/30");
      expect(circles[1]?.getAttribute("class")).toContain("opacity-0");
    } finally {
      app.unmount();
    }
  });

  it("requests screen wake lock while hold timer runs, releases on reset or pending cancellation, and degrades silently on NotAllowedError", async () => {
    const releaseMock = vi.fn().mockResolvedValue(undefined);
    const pendingReleaseMock = vi.fn().mockResolvedValue(undefined);
    let resolvePendingWakeLock!: (sentinel: unknown) => void;
    const pendingWakeLockPromise = new Promise((resolve) => {
      resolvePendingWakeLock = resolve;
    });

    const requestWakeLockMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("Low power mode", "NotAllowedError"))
      .mockResolvedValueOnce({
        released: false,
        type: "screen",
        release: releaseMock,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
      .mockReturnValueOnce(pendingWakeLockPromise);

    Object.defineProperty(navigator, "wakeLock", {
      value: { request: requestWakeLockMock },
      configurable: true,
    });

    let app: ReturnType<typeof createApp> | null = null;
    try {
      const Host = defineComponent({
        setup() {
          return () =>
            h(TrainInteractionDeck, {
              currentExercise: {
                exerciseName: "Plank",
                targetSets: 3,
                targetReps: "60s",
                targetDurationSeconds: 60,
              },
              currentProgress: { done: 0, isCompleted: false },
              isResting: false,
              restFormattedTime: "0:00",
              isOvertime: false,
            });
        },
      });

      const container = document.createElement("div");
      app = createApp(Host);
      app.mount(container);
      await nextTick();

      const timerActionBtn = container.querySelector(
        "button[data-testid='deck-timer-toggle']",
      ) as HTMLButtonElement | null;
      const eyebrow = container.querySelector("[data-testid='deck-mode-eyebrow']");

      // 1. NotAllowedError must degrade silently without blocking the hold timer
      timerActionBtn?.click();
      await nextTick();
      await Promise.resolve();
      expect(requestWakeLockMock).toHaveBeenCalledWith("screen");
      expect(eyebrow?.textContent?.trim()).toBe("Holding");
      expect(timerActionBtn?.getAttribute("aria-label")).toBe("Reset Timer");

      // Reset back to idle
      timerActionBtn?.click();
      await nextTick();
      await Promise.resolve();
      expect(eyebrow?.textContent?.trim()).toBe("Hold");

      // 2. Normal acquisition and release on reset
      timerActionBtn?.click();
      await nextTick();
      await Promise.resolve();
      expect(requestWakeLockMock).toHaveBeenCalledTimes(2);

      timerActionBtn?.click();
      await nextTick();
      await Promise.resolve();
      expect(releaseMock).toHaveBeenCalled();

      // 3. Rapid Start -> Reset while wake lock request is still pending releases once resolved
      timerActionBtn?.click();
      await nextTick();
      expect(requestWakeLockMock).toHaveBeenCalledTimes(3);

      timerActionBtn?.click();
      await nextTick();
      expect(eyebrow?.textContent?.trim()).toBe("Hold");

      resolvePendingWakeLock({
        released: false,
        type: "screen",
        release: pendingReleaseMock,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(pendingReleaseMock).toHaveBeenCalled();
    } finally {
      app?.unmount();
      delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    }
  });
});
