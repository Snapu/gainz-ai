import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import WorkoutExerciseCard from "./WorkoutExerciseCard.vue";

describe("WorkoutExerciseCard", () => {
  it("renders duration target formatted in Sets × Time", async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(WorkoutExerciseCard, {
            exercise: {
              exerciseName: "Plank",
              targetSets: 3,
              targetDurationSeconds: 60,
            },
            isHighlighted: true,
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    expect(container.textContent).toContain("Sets × Time");
    expect(container.textContent).toContain("3×1");
    expect(container.textContent).toContain("min");
    expect(container.textContent).not.toContain("Log Set 1");
    expect(container.textContent).not.toContain("+ Add Extra Set");

    const card = container.firstElementChild;
    expect(card?.className).toContain("border-primary/40");
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
            isHighlighted: true,
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
            isHighlighted: true,
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
            isHighlighted: true,
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
            isHighlighted: true,
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

  it("renders superset badge when isSuperset is true or exercise has supersetId", async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(WorkoutExerciseCard, {
            exercise: {
              exerciseName: "Incline DB Press",
              targetSets: 3,
              targetReps: "8-10",
              supersetId: "ss-1",
            },
            isHighlighted: true,
            isSuperset: true,
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    expect(container.textContent).toContain("Incline DB Press");
    expect(container.textContent).toContain("Superset");
    app.unmount();
  });
});
