import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import WorkoutExerciseList from "./WorkoutExerciseList.vue";

describe("WorkoutExerciseList", () => {
  it("formats duration targets consistently and uses text-sm for exercise names", async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(WorkoutExerciseList, {
            showRest: true,
            exercises: [
              {
                exerciseName: "Plank",
                targetSets: 3,
                targetDurationSeconds: 60,
                restSeconds: 60,
              },
              {
                exerciseName: "Hollow Hold",
                targetSets: 3,
                targetDurationSeconds: 45,
              },
              {
                exerciseName: "Dead Hang",
                targetSets: 3,
                targetDurationSeconds: 90,
              },
            ],
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    expect(container.textContent).toContain("3 × 1 min");
    expect(container.textContent).toContain("3 × 45 s");
    expect(container.textContent).toContain("3 × 1:30 min");
    expect(container.textContent).toContain("· 60 s");

    const nameSpan = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent?.trim() === "Plank",
    );
    expect(nameSpan?.className).toContain("text-sm");

    app.unmount();
  });

  it("prioritizes distance then duration over legacy targetReps and keeps text-primary on Superset badge", async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(WorkoutExerciseList, {
            exercises: [
              {
                exerciseName: "Farmer's Walk",
                targetSets: 3,
                targetDistanceMeters: 40,
                targetDurationSeconds: 60,
                targetReps: "60s",
                supersetId: "ss-1",
              },
              {
                exerciseName: "Plank",
                targetSets: 3,
                targetDurationSeconds: 60,
                targetReps: "60s",
                supersetId: "ss-1",
              },
            ],
          });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    expect(container.textContent).toContain("3 × 40 m");
    expect(container.textContent).toContain("3 × 1 min");
    expect(container.textContent).not.toContain("3 × 60s");

    const badgeEl = Array.from(container.querySelectorAll("div")).find(
      (el) => el.textContent?.trim() === "Superset",
    );
    expect(badgeEl?.className).toContain("text-primary");

    app.unmount();
  });
});
