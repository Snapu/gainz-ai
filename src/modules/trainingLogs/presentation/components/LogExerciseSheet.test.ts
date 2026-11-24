import { errAsync, okAsync } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import type { ExerciseLog } from "@/modules/trainingLogs/presentation";

const startRestTimerMock = vi.fn();
const resetRestTimerMock = vi.fn();
const addExerciseLogMock = vi.fn();
const updateExerciseLogMock = vi.fn();
const removeExerciseLogMock = vi.fn();
const toastMock = vi.fn();
let selectedExerciseUpdater: ((val: string) => void) | null = null;

const mockLogs: ExerciseLog[] = [
  {
    id: "log-1",
    exerciseName: "Bench Press",
    weight: 80,
    reps: 8,
    rpe: 9,
    loggedAt: new Date("2026-10-20T10:00:00Z"),
  },
  {
    id: "log-2",
    exerciseName: "Plank",
    duration: 2,
    loggedAt: new Date("2026-10-21T10:00:00Z"),
  },
  {
    id: "log-3",
    exerciseName: "Bench Press",
    weight: 85,
    reps: 6,
    rpe: 9.5,
    loggedAt: new Date("2026-10-22T10:00:00Z"),
  },
  {
    id: "log-4",
    exerciseName: "Squat",
    weight: 100,
    reps: 5,
    loggedAt: new Date("2026-10-21T10:00:00Z"),
  },
  {
    id: "log-5",
    exerciseName: "Squat",
    weight: 105,
    reps: 5,
    loggedAt: new Date("2026-10-23T10:00:00Z"),
  },
];

vi.mock("ios-haptics", () => ({
  hapticTrigger: vi.fn(),
}));

vi.mock("@/modules/deload/presentation", () => ({
  useDeloadStore: () => ({
    active: false,
  }),
}));

vi.mock("@/modules/platform/presentation", () => ({
  useRestTimerStore: () => ({
    start: startRestTimerMock,
    reset: resetRestTimerMock,
  }),
}));

vi.mock("@/shared/presentation/composables/useToast", () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

vi.mock("@/modules/trainingLogs/presentation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/trainingLogs/presentation")>();
  return {
    ...actual,
    useExerciseLogsStore: () => ({
      exerciseLogs: ref(mockLogs),
      addExerciseLog: addExerciseLogMock,
      updateExerciseLog: updateExerciseLogMock,
      removeExerciseLog: removeExerciseLogMock,
      lastLogForExercise: (name: string) => mockLogs.find((l) => l.exerciseName === name),
    }),
  };
});

vi.mock("@/shared/presentation/components/ui/UiBottomSheet.vue", () => ({
  default: defineComponent({
    props: ["open", "title"],
    emits: ["update:open"],
    setup(_props, { slots }) {
      return () => h("div", [slots.header?.(), slots.default?.(), slots.footer?.()]);
    },
  }),
}));

vi.mock("@/shared/presentation/components/ExerciseSelector.vue", () => ({
  default: defineComponent({
    name: "ExerciseSelector",
    props: ["modelValue", "options", "optionDetails"],
    emits: ["update:modelValue"],
    setup(props, { emit }) {
      selectedExerciseUpdater = (val: string) => emit("update:modelValue", val);
      return () => h("div", { "data-testid": "exercise-selector" }, props.modelValue);
    },
  }),
}));

import LogExerciseSheet from "./LogExerciseSheet.vue";

describe("LogExerciseSheet", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    selectedExerciseUpdater = null;
    addExerciseLogMock.mockImplementation(() => okAsync("synced"));
    updateExerciseLogMock.mockImplementation(() => okAsync("synced"));
    removeExerciseLogMock.mockImplementation(() => okAsync("synced"));
  });

  it("does not start rest timer when saving an edited log", async () => {
    const container = document.createElement("div");
    const app = createApp(LogExerciseSheet, {
      open: true,
      logToEdit: mockLogs[0],
    });
    app.mount(container);
    await nextTick();

    const saveButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save Changes"),
    );
    saveButton?.click();
    await nextTick();

    expect(updateExerciseLogMock).toHaveBeenCalledOnce();
    expect(startRestTimerMock).not.toHaveBeenCalled();
    app.unmount();
  });

  it("clears stale fields from previous exercise when switching to an exercise without those metrics", async () => {
    const container = document.createElement("div");
    const app = createApp(LogExerciseSheet, {
      open: true,
    });
    app.mount(container);
    await nextTick();

    // Select Bench Press (has weight: 80, reps: 8, rpe: 9)
    selectedExerciseUpdater?.("Bench Press");
    await nextTick();

    // Switch to Plank (only has duration: 2, no weight, no reps, no rpe)
    selectedExerciseUpdater?.("Plank");
    await nextTick();

    const saveButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save Set"),
    );
    saveButton?.click();
    await nextTick();

    expect(addExerciseLogMock).toHaveBeenCalledOnce();
    const savedLog = addExerciseLogMock.mock.calls[0]?.[0] as ExerciseLog;
    expect(savedLog.exerciseName).toBe("Plank");
    expect(savedLog.duration).toBe(2);
    expect(savedLog.weight).toBeUndefined();
    expect(savedLog.reps).toBeUndefined();
    expect(savedLog.rpe).toBeUndefined();
    app.unmount();
  });

  it("auto-fills history when switching exercises after reopening with prefill for the same exercise", async () => {
    const isOpen = ref(true);
    const prefillData = ref<{ exerciseName: string; reps?: number; weight?: number } | null>({
      exerciseName: "Bench Press",
      reps: 10,
      weight: 75,
    });

    const Host = defineComponent({
      setup() {
        return () =>
          h(LogExerciseSheet, {
            open: isOpen.value,
            prefillData: prefillData.value,
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    // Close sheet (formExerciseName was "Bench Press")
    isOpen.value = false;
    await nextTick();

    // Reopen sheet with prefill for the SAME exercise ("Bench Press")
    isOpen.value = true;
    prefillData.value = {
      exerciseName: "Bench Press",
      reps: 10,
      weight: 75,
    };
    await nextTick();

    // Now user switches selector to "Plank" — it MUST auto-fill Plank's history (duration: 2)
    selectedExerciseUpdater?.("Plank");
    await nextTick();

    const saveButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save Set"),
    );
    saveButton?.click();
    await nextTick();

    const savedLog = addExerciseLogMock.mock.calls[0]?.[0] as ExerciseLog;
    expect(savedLog.exerciseName).toBe("Plank");
    expect(savedLog.duration).toBe(2);
    app.unmount();
  });

  it("renders progression container collapsed by default and expands on click", async () => {
    const container = document.createElement("div");
    const app = createApp(LogExerciseSheet, {
      open: true,
      prefillData: {
        exerciseName: "Bench Press",
        weight: 80,
        reps: 8,
      },
    });
    app.mount(container);
    await nextTick();

    const progressionButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Progression"),
    );
    expect(progressionButton).toBeDefined();
    expect(progressionButton?.getAttribute("aria-expanded")).toBe("false");
    expect(progressionButton?.getAttribute("aria-controls")).toBe("exercise-progression-history");
    expect(container.querySelector("#exercise-progression-history")).toBeDefined();
    expect(progressionButton?.textContent).toContain("PR: 85 kg × 6");
    expect(progressionButton?.textContent).toContain("History");

    // Click to expand
    progressionButton?.click();
    await nextTick();

    expect(progressionButton?.getAttribute("aria-expanded")).toBe("true");
    expect(progressionButton?.textContent).toContain("History");

    // Switching exercise to another multi-log exercise (Squat) resets collapsed state to false
    selectedExerciseUpdater?.("Squat");
    await nextTick();

    const squatProgressionButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Progression"),
    );
    expect(squatProgressionButton).toBeDefined();
    expect(squatProgressionButton?.getAttribute("aria-expanded")).toBe("false");
    expect(squatProgressionButton?.textContent).toContain("PR: 105 kg × 5");

    // Switching to Plank (only 1 log) unmounts progression container completely
    selectedExerciseUpdater?.("Plank");
    await nextTick();

    const plankProgressionButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Progression"),
    );
    expect(plankProgressionButton).toBeUndefined();

    app.unmount();
  });

  it("hides Distance and Duration by default for weight/rep exercises and expands via toggle or duration history", async () => {
    const container = document.createElement("div");
    const app = createApp(LogExerciseSheet, {
      open: true,
      prefillData: {
        exerciseName: "Bench Press",
        weight: 75,
        reps: 8,
      },
    });
    app.mount(container);
    await nextTick();

    const getLabels = () =>
      Array.from(container.querySelectorAll("label")).map((l) => l.textContent?.trim());

    expect(getLabels()).toContain("Reps");
    expect(getLabels()).toContain("Weight (kg)");
    expect(getLabels()).not.toContain("Distance");
    expect(getLabels()).not.toContain("Duration");

    // Click "+ Distance & Duration" toggle button
    const expandMetricsBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="toggle-extra-metrics"]',
    );
    expect(expandMetricsBtn).not.toBeNull();
    expandMetricsBtn?.click();
    await nextTick();

    expect(getLabels()).toContain("Distance");
    expect(getLabels()).toContain("Duration");

    // Switching to Squat (weight/reps only) hides Distance & Duration again
    selectedExerciseUpdater?.("Squat");
    await nextTick();
    expect(getLabels()).not.toContain("Distance");
    expect(getLabels()).not.toContain("Duration");

    // Switching to Plank (duration history) auto-expands Distance & Duration
    selectedExerciseUpdater?.("Plank");
    await nextTick();
    expect(getLabels()).toContain("Distance");
    expect(getLabels()).toContain("Duration");

    app.unmount();
  });

  it("defaults weight step to 1 with inline [0.5, 1, 2.5] pills, resets on exercise switch, and preserves for same exercise", async () => {
    const isOpen = ref(true);
    const prefillData = ref<{ exerciseName: string; reps?: number; weight?: number } | null>({
      exerciseName: "Bench Press",
      weight: 75,
      reps: 8,
    });

    const Host = defineComponent({
      setup() {
        return () =>
          h(LogExerciseSheet, {
            open: isOpen.value,
            prefillData: prefillData.value,
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    const getWeightPills = () =>
      Array.from(
        container.querySelectorAll<HTMLButtonElement>('[data-testid="weight-step-option"]'),
      );
    const getWeightStepperButtons = () => {
      const increments = container.querySelectorAll<HTMLButtonElement>(
        '[data-testid="number-field-increment"]',
      );
      const decrements = container.querySelectorAll<HTMLButtonElement>(
        '[data-testid="number-field-decrement"]',
      );
      return {
        increment: increments[1],
        decrement: decrements[1],
      };
    };

    const initialPills = getWeightPills();
    expect(initialPills.map((b) => b.dataset.step)).toEqual(["0.5", "1", "2.5"]);
    expect(initialPills.find((b) => b.dataset.step === "1")?.getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(getWeightStepperButtons().increment?.textContent?.trim()).toBe("+1");
    expect(getWeightStepperButtons().decrement?.textContent?.trim()).toBe("-1");

    // Select 2.5 in one tap
    initialPills.find((b) => b.dataset.step === "2.5")?.click();
    await nextTick();
    expect(
      getWeightPills()
        .find((b) => b.dataset.step === "2.5")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(getWeightStepperButtons().increment?.textContent?.trim()).toBe("+2.5");
    expect(getWeightStepperButtons().decrement?.textContent?.trim()).toBe("-2.5");

    // Select 0.5 in one tap
    getWeightPills()
      .find((b) => b.dataset.step === "0.5")
      ?.click();
    await nextTick();
    expect(
      getWeightPills()
        .find((b) => b.dataset.step === "0.5")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(getWeightStepperButtons().increment?.textContent?.trim()).toBe("+0.5");

    // Reopen for the SAME exercise preserves selected step (0.5)
    isOpen.value = false;
    await nextTick();
    isOpen.value = true;
    await nextTick();
    expect(
      getWeightPills()
        .find((b) => b.dataset.step === "0.5")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");

    // Switching to a different exercise resets weight step deterministically to 1
    selectedExerciseUpdater?.("Squat");
    await nextTick();
    expect(
      getWeightPills()
        .find((b) => b.dataset.step === "1")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(getWeightStepperButtons().increment?.textContent?.trim()).toBe("+1");

    app.unmount();
  });

  it("supports contextual rounding and exact +step increments on off-grid weights", async () => {
    const container = document.createElement("div");
    const app = createApp(LogExerciseSheet, {
      open: true,
      prefillData: {
        exerciseName: "Bench Press",
        weight: 42.5,
        reps: 8,
      },
    });
    app.mount(container);
    await nextTick();

    const roundDownBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="number-field-round-down"]',
    );
    const roundUpBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="number-field-round-up"]',
    );

    expect(roundDownBtn?.textContent?.trim()).toBe("↓42");
    expect(roundUpBtn?.textContent?.trim()).toBe("↑43");

    // Exact +1 increments from 42.5 -> 43.5 without silent snapping
    const weightIncrement = container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="number-field-increment"]',
    )[1];
    weightIncrement?.dispatchEvent(
      Object.assign(new MouseEvent("pointerdown", { bubbles: true, button: 0 }), {
        pointerType: "mouse",
        pointerId: 1,
      }),
    );
    window.dispatchEvent(
      Object.assign(new MouseEvent("pointerup", { bubbles: true, button: 0 }), {
        pointerType: "mouse",
        pointerId: 1,
      }),
    );
    await nextTick();

    expect(
      container
        .querySelector<HTMLButtonElement>('[data-testid="number-field-round-down"]')
        ?.textContent?.trim(),
    ).toBe("↓43");
    expect(
      container
        .querySelector<HTMLButtonElement>('[data-testid="number-field-round-up"]')
        ?.textContent?.trim(),
    ).toBe("↑44");

    // Tap round-down to snap cleanly to 43 and verify persisted log
    container.querySelector<HTMLButtonElement>('[data-testid="number-field-round-down"]')?.click();
    await nextTick();

    expect(container.querySelector('[data-testid="number-field-round-down"]')).toBeNull();

    const saveButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save Set"),
    );
    saveButton?.click();
    await nextTick();

    expect(addExerciseLogMock).toHaveBeenCalledOnce();
    const savedLog = addExerciseLogMock.mock.calls[0]?.[0] as ExerciseLog;
    expect(savedLog.weight).toBe(43);

    app.unmount();
  });

  it("preserves chosen weightStep across reopening a blank sheet when re-selecting the same exercise", async () => {
    const isOpen = ref(true);
    const Host = defineComponent({
      setup() {
        return () => h(LogExerciseSheet, { open: isOpen.value, prefillData: null });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    selectedExerciseUpdater?.("Bench Press");
    await nextTick();

    container
      .querySelector<HTMLButtonElement>('[data-testid="weight-step-option"][data-step="2.5"]')
      ?.click();
    await nextTick();
    expect(
      container
        .querySelector('[data-testid="weight-step-option"][data-step="2.5"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");

    // Close and reopen blank sheet, then re-select Bench Press
    isOpen.value = false;
    await nextTick();
    isOpen.value = true;
    await nextTick();

    selectedExerciseUpdater?.("Bench Press");
    await nextTick();

    expect(
      container
        .querySelector('[data-testid="weight-step-option"][data-step="2.5"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");

    app.unmount();
  });

  it("never renders rounding buttons on Reps even with fractional prefill", async () => {
    const container = document.createElement("div");
    const app = createApp(LogExerciseSheet, {
      open: true,
      prefillData: {
        exerciseName: "Bench Press",
        reps: 8.5,
        weight: 80,
      },
    });
    app.mount(container);
    await nextTick();

    expect(container.querySelector('[data-testid="number-field-round-down"]')).toBeNull();
    expect(container.querySelector('[data-testid="number-field-round-up"]')).toBeNull();

    app.unmount();
  });

  it("switches Distance (m <-> km) and Duration (min <-> sec) units with tailored step pills and saves canonical values", async () => {
    const container = document.createElement("div");
    const app = createApp(LogExerciseSheet, {
      open: true,
      prefillData: {
        exerciseName: "Running",
        distance: 500, // < 1000m -> starts in m mode
        duration: 0.75, // < 1 min (45 sec) -> auto-starts in sec mode
      },
    });
    app.mount(container);
    await nextTick();

    const getUnitButton = (metric: "distance" | "duration", unit: string) =>
      container.querySelector<HTMLButtonElement>(
        `[data-testid="${metric}-unit-option"][data-unit="${unit}"]`,
      );
    const getStepButtons = (metric: "distance" | "duration") =>
      Array.from(
        container.querySelectorAll<HTMLButtonElement>(`[data-testid="${metric}-step-option"]`),
      );

    expect(getUnitButton("distance", "m")?.getAttribute("aria-pressed")).toBe("true");
    expect(getStepButtons("distance").map((b) => b.dataset.step)).toEqual(["10", "50", "100"]);
    expect(
      getStepButtons("distance")
        .find((b) => b.dataset.step === "50")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");

    expect(getUnitButton("duration", "sec")?.getAttribute("aria-pressed")).toBe("true");
    expect(getStepButtons("duration").map((b) => b.dataset.step)).toEqual(["5", "15", "30"]);
    expect(
      getStepButtons("duration")
        .find((b) => b.dataset.step === "5")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");

    // Select 100m step first, then switch m -> km and verify step resets to 0.5
    getStepButtons("distance")
      .find((b) => b.dataset.step === "100")
      ?.click();
    await nextTick();
    expect(
      container
        .querySelectorAll<HTMLButtonElement>('[data-testid="number-field-increment"]')[2]
        ?.textContent?.trim(),
    ).toBe("+100");

    getUnitButton("distance", "km")?.click();
    await nextTick();
    expect(getUnitButton("distance", "km")?.getAttribute("aria-pressed")).toBe("true");
    expect(getStepButtons("distance").map((b) => b.dataset.step)).toEqual(["0.1", "0.5", "1"]);
    expect(
      getStepButtons("distance")
        .find((b) => b.dataset.step === "0.5")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      container
        .querySelectorAll<HTMLButtonElement>('[data-testid="number-field-increment"]')[2]
        ?.textContent?.trim(),
    ).toBe("+0.5");

    // Switch duration sec -> min and back to sec
    getUnitButton("duration", "min")?.click();
    await nextTick();
    expect(getUnitButton("duration", "min")?.getAttribute("aria-pressed")).toBe("true");
    expect(getStepButtons("duration").map((b) => b.dataset.step)).toEqual(["1", "5", "10"]);
    expect(
      getStepButtons("duration")
        .find((b) => b.dataset.step === "1")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");

    getUnitButton("duration", "sec")?.click();
    await nextTick();
    expect(getUnitButton("duration", "sec")?.getAttribute("aria-pressed")).toBe("true");
    expect(
      getStepButtons("duration")
        .find((b) => b.dataset.step === "5")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");

    // Save set and verify canonical units (m and min) are persisted
    const saveButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save Set"),
    );
    saveButton?.click();
    await nextTick();

    expect(addExerciseLogMock).toHaveBeenCalledOnce();
    const savedLog = addExerciseLogMock.mock.calls[0]?.[0] as ExerciseLog;
    expect(savedLog.distance).toBe(500);
    expect(savedLog.duration).toBe(0.75);

    app.unmount();
  });

  it("keeps multi-minute fractional durations in min mode and auto-infers km for >= 1000m distances", async () => {
    const container = document.createElement("div");
    const app = createApp(LogExerciseSheet, {
      open: true,
      prefillData: {
        exerciseName: "Cycling",
        distance: 1500,
        duration: 12.5,
      },
    });
    app.mount(container);
    await nextTick();

    expect(
      container
        .querySelector('[data-testid="distance-unit-option"][data-unit="km"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      container
        .querySelector('[data-testid="distance-step-option"][data-step="0.5"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      container
        .querySelector('[data-testid="duration-unit-option"][data-unit="min"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      container
        .querySelector('[data-testid="duration-step-option"][data-step="1"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");

    app.unmount();
  });

  it("renders contextual rounding buttons for off-grid Distance (1230 m) and Duration (42 s)", async () => {
    const container = document.createElement("div");
    const app = createApp(LogExerciseSheet, {
      open: true,
      prefillData: {
        exerciseName: "Sled Push",
        distance: 1230, // not divisible by 100 -> stays in m mode with default step 50
        duration: 0.7, // 42 sec -> sec mode with default step 5
      },
    });
    app.mount(container);
    await nextTick();

    const roundDownTexts = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-testid="number-field-round-down"]'),
    ).map((el) => el.textContent?.trim());
    const roundUpTexts = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-testid="number-field-round-up"]'),
    ).map((el) => el.textContent?.trim());

    expect(roundDownTexts).toEqual(["↓1200", "↓40"]);
    expect(roundUpTexts).toEqual(["↑1250", "↑45"]);

    app.unmount();
  });

  it("shows 'Optional' when RPE is disabled and auto-enables RPE when interacting with the slider", async () => {
    const container = document.createElement("div");
    const app = createApp(LogExerciseSheet, {
      open: true,
      prefillData: {
        exerciseName: "Bench Press",
        weight: 75,
        reps: 8,
      },
    });
    app.mount(container);
    await nextTick();

    expect(container.textContent).toContain("Optional");

    const rangeInput = container.querySelector<HTMLInputElement>('input[type="range"]');
    expect(rangeInput).not.toBeNull();
    expect(rangeInput?.disabled).toBe(false);

    if (rangeInput) {
      rangeInput.value = "9";
      rangeInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await nextTick();

    expect(container.textContent).toContain("9 — 1 rep left");

    const saveButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save Set"),
    );
    saveButton?.click();
    await nextTick();

    const savedLog = addExerciseLogMock.mock.calls[0]?.[0] as ExerciseLog;
    expect(savedLog.rpe).toBe(9);

    app.unmount();
  });

  it("preserves offline-first UX with pending-sync feedback when addExerciseLog queues offline", async () => {
    addExerciseLogMock.mockReturnValueOnce(okAsync("queued-offline"));
    const onUpdateOpen = vi.fn();
    const onSaved = vi.fn();

    const container = document.createElement("div");
    const app = createApp(LogExerciseSheet, {
      open: true,
      prefillData: { exerciseName: "Bench Press", weight: 80, reps: 8 },
      "onUpdate:open": onUpdateOpen,
      onSaved,
    });
    app.mount(container);
    await nextTick();

    const saveButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save Set"),
    );
    saveButton?.click();
    await nextTick();
    await vi.waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });

    expect(startRestTimerMock).toHaveBeenCalledOnce();
    expect(onUpdateOpen).toHaveBeenCalledWith(false);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Saved Offline",
      }),
    );

    app.unmount();
  });

  it("keeps sheet open, does not start rest timer, and shows destructive error toast on non-retryable save failure", async () => {
    addExerciseLogMock.mockReturnValueOnce(errAsync("validation-failed"));
    const onUpdateOpen = vi.fn();
    const onSaved = vi.fn();

    const container = document.createElement("div");
    const app = createApp(LogExerciseSheet, {
      open: true,
      prefillData: { exerciseName: "Bench Press", weight: 80, reps: 8 },
      "onUpdate:open": onUpdateOpen,
      onSaved,
    });
    app.mount(container);
    await nextTick();

    const saveButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save Set"),
    );
    saveButton?.click();
    await vi.waitFor(() => {
      expect(toastMock).toHaveBeenCalledOnce();
    });

    expect(startRestTimerMock).not.toHaveBeenCalled();
    expect(onUpdateOpen).not.toHaveBeenCalledWith(false);
    expect(onSaved).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Could Not Save Set",
        variant: "destructive",
      }),
    );

    app.unmount();
  });

  it("keeps sheet open and surfaces destructive toast when editing or deleting fails permanently", async () => {
    updateExerciseLogMock.mockReturnValueOnce(errAsync("auth-failed"));
    removeExerciseLogMock
      .mockReturnValueOnce(errAsync("validation-failed"))
      .mockReturnValueOnce(okAsync("queued-offline"));
    const onUpdateOpen = vi.fn();
    const onSaved = vi.fn();

    const container = document.createElement("div");
    const app = createApp(LogExerciseSheet, {
      open: true,
      logToEdit: mockLogs[0],
      "onUpdate:open": onUpdateOpen,
      onSaved,
    });
    app.mount(container);
    await nextTick();

    const saveButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save Changes"),
    );
    saveButton?.click();
    await vi.waitFor(() => {
      expect(toastMock).toHaveBeenCalledTimes(1);
    });
    expect(onUpdateOpen).not.toHaveBeenCalledWith(false);
    expect(onSaved).not.toHaveBeenCalled();

    const deleteButton = container.querySelector<HTMLButtonElement>('[aria-label="Delete Set"]');
    deleteButton?.click();
    await vi.waitFor(() => {
      expect(toastMock).toHaveBeenCalledTimes(2);
    });
    expect(toastMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "Could Not Delete Set",
        variant: "destructive",
      }),
    );
    expect(onSaved).not.toHaveBeenCalled();

    deleteButton?.click();
    await vi.waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
    expect(toastMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "Deleted Offline",
      }),
    );

    app.unmount();
  });

  it("surfaces missing-row description when update fails with not-found", async () => {
    updateExerciseLogMock.mockReturnValueOnce(errAsync("not-found"));
    const onUpdateOpen = vi.fn();
    const container = document.createElement("div");
    const app = createApp(LogExerciseSheet, {
      open: true,
      logToEdit: mockLogs[0],
      "onUpdate:open": onUpdateOpen,
    });
    app.mount(container);
    await nextTick();

    const saveButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save Changes"),
    );
    saveButton?.click();
    await vi.waitFor(() => {
      expect(toastMock).toHaveBeenCalledOnce();
    });

    expect(onUpdateOpen).not.toHaveBeenCalledWith(false);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Could Not Save Set",
        description: "This set no longer exists in Google Sheets.",
        variant: "destructive",
      }),
    );

    app.unmount();
  });

  it("falls back to default 120s rest timer when switching away from a prefilled planned exercise", async () => {
    const container = document.createElement("div");
    const app = createApp(LogExerciseSheet, {
      open: true,
      prefillData: { exerciseName: "Squat", reps: 5, weight: 100 },
      restSeconds: 180,
    });
    app.mount(container);
    await nextTick();
    await nextTick();

    selectedExerciseUpdater?.("Bicep Curl");
    await nextTick();

    const saveButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save Set"),
    );
    saveButton?.click();
    await vi.waitFor(() => {
      expect(startRestTimerMock).toHaveBeenCalledOnce();
    });

    expect(startRestTimerMock).toHaveBeenCalledWith(120);
    app.unmount();
  });
});
