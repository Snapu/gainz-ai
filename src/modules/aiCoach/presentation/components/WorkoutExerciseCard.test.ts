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
});
