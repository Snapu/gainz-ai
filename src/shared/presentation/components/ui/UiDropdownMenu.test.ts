import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import UiDropdownMenu from "./UiDropdownMenu.vue";

function mountMenu(slots = {}, props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const Host = defineComponent({
    setup() {
      return () => h(UiDropdownMenu, props, slots);
    },
  });
  const app = createApp(Host);
  app.mount(container);
  return {
    container,
    unmount: () => {
      app.unmount();
      container.remove();
    },
  };
}

describe("UiDropdownMenu", () => {
  it("renders scrollable dropdown content when opened", async () => {
    const { container, unmount } = mountMenu({
      trigger: () => h("button", { id: "menu-trigger" }, "Open Menu"),
      default: () => [h("div", { class: "item" }, "Item 1"), h("div", { class: "item" }, "Item 2")],
    });

    try {
      const trigger = container.querySelector("#menu-trigger") as HTMLButtonElement | null;
      expect(trigger).not.toBeNull();
      trigger?.click();
      await nextTick();
      await nextTick();

      const content = document.querySelector("[role='menu']");
      expect(content).not.toBeNull();
      expect(content?.className).toContain("overflow-y-auto");
      expect(content?.className).toContain("overflow-x-hidden");
      expect(content?.className).toContain("overscroll-y-contain");
      expect(content?.className).toContain("no-scrollbar");
      expect(content?.className).not.toContain("overflow-hidden");
      expect(content?.className).toContain("max-h-");
    } finally {
      unmount();
    }
  });

  it("merges and overrides classes via props.class", async () => {
    const { container, unmount } = mountMenu(
      {
        trigger: () => h("button", { id: "menu-trigger" }, "Open Menu"),
        default: () => [h("div", "Item 1")],
      },
      { class: "max-h-64 custom-menu" },
    );

    try {
      const trigger = container.querySelector("#menu-trigger") as HTMLButtonElement | null;
      trigger?.click();
      await nextTick();
      await nextTick();

      const content = document.querySelector("[role='menu']");
      expect(content).not.toBeNull();
      expect(content?.className).toContain("max-h-64");
      expect(content?.className).toContain("custom-menu");
      expect(content?.className).not.toContain(
        "max-h-[var(--reka-dropdown-menu-content-available-height,calc(100dvh-2rem))]",
      );
    } finally {
      unmount();
    }
  });
});
