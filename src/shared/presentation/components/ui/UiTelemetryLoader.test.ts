import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import UiTelemetryLoader from "./UiTelemetryLoader.vue";

describe("UiTelemetryLoader", () => {
  it("renders text and sets accessibility role", async () => {
    const container = document.createElement("div");
    const Host = defineComponent({
      setup() {
        return () => h(UiTelemetryLoader, { text: "Calibrating session..." });
      },
    });
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    const loader = container.querySelector("[role='status']");
    expect(loader).not.toBeNull();
    expect(loader?.getAttribute("aria-live")).toBe("polite");
    expect(container.textContent).toContain("Calibrating session...");

    app.unmount();
  });

  it("renders optional subtitle when provided", async () => {
    const container = document.createElement("div");
    const Host = defineComponent({
      setup() {
        return () =>
          h(UiTelemetryLoader, {
            text: "Loading data...",
            subtitle: "Syncing storage",
          });
      },
    });
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    expect(container.textContent).toContain("Loading data...");
    expect(container.textContent).toContain("Syncing storage");

    app.unmount();
  });

  it("applies fullscreen styling when fullscreen prop is true", async () => {
    const container = document.createElement("div");
    const Host = defineComponent({
      setup() {
        return () => h(UiTelemetryLoader, { text: "Starting...", fullscreen: true });
      },
    });
    const app = createApp(Host);
    app.mount(container);
    await nextTick();

    const loader = container.querySelector("[role='status']");
    expect(loader?.classList.contains("min-h-screen")).toBe(true);

    app.unmount();
  });
});
