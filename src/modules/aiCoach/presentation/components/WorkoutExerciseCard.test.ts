import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import WorkoutExerciseCard from "./WorkoutExerciseCard.vue";

describe("WorkoutExerciseCard", () => {
  it("updates timerRemaining when targetDurationSeconds prop changes while timer is not running", async () => {
    const targetDurationSeconds = ref(60);

    const Host = defineComponent({
      setup() {
        return () =>
          h(WorkoutExerciseCard, {
            exercise: {
              exerciseName: "Plank",
              targetSets: 3,
              targetReps: `${targetDurationSeconds.value}s`,
              targetDurationSeconds: targetDurationSeconds.value,
            },
            isCompleted: false,
            isHighlighted: true,
            progress: { done: 0, isCompleted: false },
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    expect(container.textContent).toContain("1:00");

    targetDurationSeconds.value = 45;
    await nextTick();

    expect(container.textContent).toContain("0:45");
    app.unmount();
  });

  it("renders progression data and target today tiles", async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(WorkoutExerciseCard, {
            exercise: {
              exerciseName: "Bench Press",
              targetSets: 3,
              targetReps: "6-8",
              targetWeight: "56 kg",
              targetRpe: 9,
            },
            isCompleted: false,
            isHighlighted: true,
            progress: { done: 0, isCompleted: false },
            progressionData: [
              {
                key: "s-1",
                dateLabel: "24. Okt",
                sets: [{ weight: 56, reps: 8 }],
              },
            ],
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    expect(container.textContent).toContain("Target Today");
    expect(container.textContent).toContain("56");
    expect(container.textContent).toContain("Progression");
    expect(container.textContent).toContain("24. Okt");

    const guideBtn = container.querySelector("button[aria-label='Exercise guide']");
    expect(guideBtn).not.toBeNull();
    app.unmount();
  });

  it("renders BW when targetWeight is bodyweight or BW", async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(WorkoutExerciseCard, {
            exercise: {
              exerciseName: "Pull Up",
              targetSets: 3,
              targetReps: "8",
              targetWeight: "BW",
            },
            isCompleted: false,
            isHighlighted: true,
            progress: { done: 0, isCompleted: false },
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    expect(container.textContent).toContain("BW");
    app.unmount();
  });

  it("renders 0 kg when logged set weight is 0", async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(WorkoutExerciseCard, {
            exercise: {
              exerciseName: "Dip",
              targetSets: 3,
              targetReps: "10",
            },
            isCompleted: false,
            isHighlighted: true,
            progress: { done: 1, isCompleted: false },
            loggedSets: [
              {
                id: "set-1",
                exerciseName: "Dip",
                loggedAt: new Date(),
                reps: 10,
                weight: 0,
              },
            ],
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    expect(container.textContent).toContain("0");
    expect(container.textContent).toContain("kg");
    app.unmount();
  });

  it("renders 0 reps when logged set reps is 0", async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(WorkoutExerciseCard, {
            exercise: {
              exerciseName: "Bench Press",
              targetSets: 3,
              targetReps: "5",
            },
            isCompleted: false,
            isHighlighted: true,
            progress: { done: 1, isCompleted: false },
            loggedSets: [
              {
                id: "set-failed",
                exerciseName: "Bench Press",
                loggedAt: new Date(),
                reps: 0,
                weight: 100,
              },
            ],
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    expect(container.textContent).toContain("0");
    expect(container.textContent).toContain("reps");
    app.unmount();
  });
});
