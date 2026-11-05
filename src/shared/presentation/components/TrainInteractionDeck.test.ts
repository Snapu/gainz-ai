import { describe, expect, it } from "vitest";
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

    expect(container.textContent).toContain("Log Bench Press");
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

  it("emits logCustom when Log Custom Exercise chip is clicked and matches CoachTab chip dimensions", async () => {
    let emittedLogCustom = false;

    const Host = defineComponent({
      setup() {
        return () =>
          h(TrainInteractionDeck, {
            currentExercise: defaultExercise,
            currentProgress: { done: 0, isCompleted: false },
            isResting: false,
            restFormattedTime: "00:00",
            isOvertime: false,
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

    const customBtn = container.querySelector(
      "button[data-testid='deck-custom-exercise']",
    ) as HTMLButtonElement | null;
    expect(customBtn).not.toBeNull();
    expect(customBtn?.textContent).toContain("Log Custom Exercise");
    expect(customBtn?.className).toContain("h-8");
    expect(customBtn?.className).toContain("px-3");
    customBtn?.click();
    await nextTick();

    expect(emittedLogCustom).toBe(true);
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

    const timerRing = container.querySelector("[data-testid='deck-timer-ring']");
    expect(timerRing).not.toBeNull();
    expect(timerRing?.textContent).toContain("1:05");
    expect(container.textContent).toContain("Log Bench Press");

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

    // Ensure timer ring, skip icon button, and primary action share the right-side controls container (after exercise title)
    expect(timerRing?.parentElement).toBe(logNextBtn?.parentElement);
    expect(skipBtn?.parentElement).toBe(logNextBtn?.parentElement);

    app.unmount();
  });

  it("renders Finish Rest button when resting and workout is completed", async () => {
    let emittedSkipRest = false;

    const Host = defineComponent({
      setup() {
        return () =>
          h(TrainInteractionDeck, {
            currentExercise: defaultExercise,
            currentProgress: { done: 3, isCompleted: true },
            isResting: true,
            restFormattedTime: "1:00",
            targetRestSeconds: 90,
            isOvertime: false,
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

    expect(container.textContent).toContain("Workout Complete");

    const finishBtn = container.querySelector(
      "button[data-testid='deck-primary-action']",
    ) as HTMLButtonElement | null;
    expect(finishBtn?.getAttribute("aria-label")).toBe("Finish Rest");
    finishBtn?.click();
    await nextTick();

    expect(emittedSkipRest).toBe(true);
    app.unmount();
  });

  it("renders overtime visual styling on radial ring when isOvertime is true", async () => {
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

    const timerRing = container.querySelector("[data-testid='deck-timer-ring']");
    expect(timerRing).not.toBeNull();
    expect(timerRing?.textContent).toContain("+0:30");
    expect(timerRing?.querySelector(".stroke-destructive")).not.toBeNull();
    const overtimeSpan = container.querySelector(".text-destructive");
    expect(overtimeSpan).not.toBeNull();
    app.unmount();
  });

  it("renders exercise duration timer with Start and Reset icon toggle and no pause button", async () => {
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

    const timerRing = container.querySelector("[data-testid='deck-timer-ring']");
    expect(timerRing).not.toBeNull();
    expect(timerRing?.textContent).toContain("1:00");
    expect(container.textContent).toContain("Log Plank");

    const timerActionBtn = container.querySelector(
      "button[data-testid='deck-timer-toggle']",
    ) as HTMLButtonElement | null;
    const primaryBtn = container.querySelector("button[data-testid='deck-primary-action']");
    expect(timerActionBtn).not.toBeNull();
    expect(primaryBtn).not.toBeNull();
    expect(timerRing?.parentElement).toBe(primaryBtn?.parentElement);
    expect(timerActionBtn?.parentElement).toBe(primaryBtn?.parentElement);

    // Initially shows Start Timer
    expect(timerActionBtn?.getAttribute("aria-label")).toBe("Start Timer");
    expect(timerActionBtn?.textContent?.trim()).toBe("");

    // Clicking starts timer and switches button to Reset Timer (no Pause button, no Tier 1 reset chip)
    timerActionBtn?.click();
    await nextTick();
    expect(timerActionBtn?.getAttribute("aria-label")).toBe("Reset Timer");
    expect(container.querySelector("button[data-testid='deck-timer-reset']")).toBeNull();

    // Clicking again resets timer and returns to Start Timer
    timerActionBtn?.click();
    await nextTick();
    expect(timerActionBtn?.getAttribute("aria-label")).toBe("Start Timer");
    expect(timerRing?.textContent).toContain("1:00");

    app.unmount();
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
    expect(container.querySelector("[data-testid='deck-timer-ring']")?.textContent).toContain(
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

    expect(container.textContent).toContain("Log extra Bench Press");

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

  it("renders Workout Complete without duplicate custom buttons when isWorkoutComplete is true", async () => {
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

    expect(container.textContent).toContain("Workout Complete");

    // Tier 1 custom button must NOT be rendered in State D
    const tier1Btn = container.querySelector("button[data-testid='deck-custom-exercise']");
    expect(tier1Btn).toBeNull();

    // Single State D button exists
    const actionBtn = container.querySelector(
      "button[data-testid='deck-log-exercise']",
    ) as HTMLButtonElement | null;
    expect(actionBtn).not.toBeNull();
    expect(actionBtn?.getAttribute("aria-label")).toBe("Log Exercise");
    expect(actionBtn?.className).toContain("bg-primary");
    actionBtn?.click();
    await nextTick();

    expect(emittedLogCustom).toBe(true);
    app.unmount();
  });

  it("renders Rest Day state with Log Exercise button when isRestDay is true", async () => {
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

    expect(container.textContent).toContain("Rest Day");

    const actionBtn = container.querySelector(
      "button[data-testid='deck-log-exercise']",
    ) as HTMLButtonElement | null;
    expect(actionBtn).not.toBeNull();
    actionBtn?.click();
    await nextTick();

    expect(emittedLogCustom).toBe(true);
    app.unmount();
  });

  it("renders superset alternative chip and emits selectSupersetExercise when clicked", async () => {
    let selectedName = "";
    const partnerExercise = {
      exerciseName: "Barbell Row",
      targetSets: 3,
      targetReps: "8",
      targetWeight: "70 kg",
    };

    const Host = defineComponent({
      setup() {
        return () =>
          h(TrainInteractionDeck, {
            currentExercise: defaultExercise,
            currentProgress: { done: 0, isCompleted: false },
            supersetAlternatives: [partnerExercise],
            isResting: false,
            restFormattedTime: "0:00",
            isOvertime: false,
            onSelectSupersetExercise: (name: string) => {
              selectedName = name;
            },
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    const supersetChip = container.querySelector(
      "button[data-testid='deck-superset-chip']",
    ) as HTMLButtonElement | null;
    expect(supersetChip).not.toBeNull();
    expect(supersetChip?.textContent).toContain("Barbell Row");
    expect(supersetChip?.className).toContain("h-8");
    expect(supersetChip?.className).toContain("px-3");

    supersetChip?.click();
    await nextTick();
    expect(selectedName).toBe("Barbell Row");

    app.unmount();
  });
});
