import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import type { ExerciseLog } from "@/modules/trainingLogs/presentation";

const startRestTimerMock = vi.fn();
const resetRestTimerMock = vi.fn();
const addExerciseLogMock = vi.fn();
const updateExerciseLogMock = vi.fn();
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

vi.mock("@/modules/trainingLogs/presentation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/trainingLogs/presentation")>();
  return {
    ...actual,
    useExerciseLogsStore: () => ({
      exerciseLogs: ref(mockLogs),
      addExerciseLog: addExerciseLogMock,
      updateExerciseLog: updateExerciseLogMock,
      removeExerciseLog: vi.fn(),
      lastLogForExercise: (name: string) => mockLogs.find((l) => l.exerciseName === name),
    }),
  };
});

vi.mock("@/shared/presentation/components/ui/UiBottomSheet.vue", () => ({
  default: defineComponent({
    props: ["open", "title"],
    emits: ["update:open"],
    setup(_props, { slots }) {
      return () => h("div", slots.default?.());
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

  it("cycles weight step size between 2.5, 5, and 0.5 via the header badge", async () => {
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

    const stepBadge = container.querySelector<HTMLButtonElement>(
      '[data-testid="weight-step-toggle"]',
    );
    expect(stepBadge).not.toBeNull();
    expect(stepBadge?.textContent?.trim()).toBe("±2.5");

    stepBadge?.click();
    await nextTick();
    expect(stepBadge?.textContent?.trim()).toBe("±5");

    stepBadge?.click();
    await nextTick();
    expect(stepBadge?.textContent?.trim()).toBe("±0.5");

    stepBadge?.click();
    await nextTick();
    expect(stepBadge?.textContent?.trim()).toBe("±2.5");

    app.unmount();
  });

  it("toggles Distance (m <-> km) and Duration (min <-> sec) units and saves canonical values", async () => {
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

    const distanceToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="distance-unit-toggle"]',
    );
    const durationToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="duration-unit-toggle"]',
    );

    expect(distanceToggle?.textContent?.trim()).toBe("m · ±50");
    expect(durationToggle?.textContent?.trim()).toBe("sec · ±5");

    // Toggle distance from m (500) to km (0.5)
    distanceToggle?.click();
    await nextTick();
    expect(distanceToggle?.textContent?.trim()).toBe("km · ±0.5");

    // Toggle duration from sec (45) to min (0.75) and back to sec (45)
    durationToggle?.click();
    await nextTick();
    expect(durationToggle?.textContent?.trim()).toBe("min · ±1");

    durationToggle?.click();
    await nextTick();
    expect(durationToggle?.textContent?.trim()).toBe("sec · ±5");

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

    const distanceToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="distance-unit-toggle"]',
    );
    const durationToggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="duration-unit-toggle"]',
    );

    expect(distanceToggle?.textContent?.trim()).toBe("km · ±0.5");
    expect(durationToggle?.textContent?.trim()).toBe("min · ±1");

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

    expect(container.textContent).toContain("9 - 1 Rep Left (1 RIR)");

    const saveButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Save Set"),
    );
    saveButton?.click();
    await nextTick();

    const savedLog = addExerciseLogMock.mock.calls[0]?.[0] as ExerciseLog;
    expect(savedLog.rpe).toBe(9);

    app.unmount();
  });
});
