import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h } from "vue";
import AppHeader from "./AppHeader.vue";

function mountHeader(slots = {}, props = {}) {
  const container = document.createElement("div");
  const Host = defineComponent({
    setup() {
      return () => h(AppHeader, props, slots);
    },
  });
  const app = createApp(Host);
  app.mount(container);
  return { container, unmount: () => app.unmount() };
}

describe("AppHeader", () => {
  it("renders default and actions slots correctly", () => {
    const { container, unmount } = mountHeader({
      default: () => h("span", { id: "title" }, "GainzAI"),
      actions: () => h("button", { id: "action" }, "Action"),
    });

    expect(container.querySelector("#title")?.textContent).toBe("GainzAI");
    expect(container.querySelector("#action")?.textContent).toBe("Action");
    unmount();
  });

  it("applies compact height and padding styling", () => {
    const { container, unmount } = mountHeader({
      default: () => h("span", "Title"),
    });

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header?.className).toContain("h-13");
    expect(header?.className).toContain("px-4");
    expect(header?.className).not.toContain("p-4");
    unmount();
  });

  it("merges custom classes via props", () => {
    const { container, unmount } = mountHeader(
      { default: () => h("span", "Title") },
      { class: "shrink-0 custom-class" },
    );

    const header = container.querySelector("header");
    expect(header?.className).toContain("shrink-0");
    expect(header?.className).toContain("custom-class");
    unmount();
  });

  it("renders back button, title, and subtitle props and emits back on click", () => {
    let emittedBack = false;
    const { container, unmount } = mountHeader(
      {},
      {
        showBack: true,
        title: "Past Sessions",
        subtitle: "12 reviewed",
        onBack: () => {
          emittedBack = true;
        },
      },
    );

    expect(container.querySelector("h1")?.textContent).toBe("Past Sessions");
    expect(container.querySelector("p")?.textContent).toBe("12 reviewed");
    const backBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Go Back"]');
    expect(backBtn).not.toBeNull();
    backBtn?.click();
    expect(emittedBack).toBe(true);
    unmount();
  });
});
