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

vi.mock("@/modules/trainingLogs/presentation", () => ({
  useExerciseLogsStore: () => ({
    exerciseLogs: ref(mockLogs),
    addExerciseLog: addExerciseLogMock,
    updateExerciseLog: updateExerciseLogMock,
    removeExerciseLog: vi.fn(),
    lastLogForExercise: (name: string) => mockLogs.find((l) => l.exerciseName === name),
  }),
}));

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
});
