import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import UiProgressionLine from "./UiProgressionLine.vue";

describe("UiProgressionLine", () => {
  it("renders SVG line and points for session sets", async () => {
    const sessions = [
      {
        key: "session-1",
        dateLabel: "24. Okt",
        sets: [
          { weight: 58, reps: 8 },
          { weight: 58, reps: 8 },
          { weight: 38, reps: 10 },
        ],
      },
      {
        key: "session-2",
        dateLabel: "28. Okt",
        sets: [
          { weight: 64, reps: 8 },
          { weight: 58, reps: 8 },
          { weight: 58, reps: 7 },
        ],
      },
    ];

    const Host = defineComponent({
      setup() {
        return () => h(UiProgressionLine, { sessions });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();

    // Check that points are rendered for each set (3 + 3 = 6 points)
    const circles = container.querySelectorAll("circle.fill-primary");
    expect(circles.length).toBe(6);

    // Check that weights and reps are in text
    expect(container.textContent).toContain("58");
    expect(container.textContent).toContain("64");
    expect(container.textContent).toContain("24. Okt");
    expect(container.textContent).toContain("28. Okt");

    app.unmount();
  });

  it("handles sessions with empty sets without throwing", async () => {
    const sessions = [
      {
        key: "session-empty",
        dateLabel: "10. Okt",
        sets: [],
      },
      {
        key: "session-valid",
        dateLabel: "14. Okt",
        sets: [{ weight: 50, reps: 10 }],
      },
      {
        key: "session-empty-2",
        dateLabel: "18. Okt",
        sets: [],
      },
    ];

    const Host = defineComponent({
      setup() {
        return () => h(UiProgressionLine, { sessions });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    const circles = container.querySelectorAll("circle.fill-primary");
    expect(circles.length).toBe(1);
    expect(container.textContent).toContain("50");
    expect(container.textContent).toContain("14. Okt");

    app.unmount();
  });

  it("formats duration values as m:ss or seconds and gives 28px left margin to avoid edge clipping", async () => {
    const sessions = [
      {
        key: "s-1",
        dateLabel: "Oct 20",
        sets: [{ duration: 1 }, { duration: 1.08 }],
      },
      {
        key: "s-2",
        dateLabel: "Oct 28",
        sets: [{ duration: 0.75 }],
      },
    ];

    const Host = defineComponent({
      setup() {
        return () => h(UiProgressionLine, { sessions });
      },
    });

    const container = document.createElement("div");
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    expect(container.textContent).toContain("1:00");
    expect(container.textContent).toContain("1:05");
    expect(container.textContent).toContain("45s");
    expect(container.textContent).not.toContain("1.08");

    const firstCircle = container.querySelector("circle.fill-primary");
    expect(firstCircle?.getAttribute("cx")).toBe("28");

    app.unmount();
  });
});
