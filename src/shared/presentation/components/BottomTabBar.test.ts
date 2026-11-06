import { describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h } from "vue";
import BottomTabBar from "./BottomTabBar.vue";

const mockCurrentRoute = { name: "home" };

vi.mock("vue-router", () => ({
  useRoute: () => mockCurrentRoute,
}));

function mountTabBar() {
  const container = document.createElement("div");
  const Host = defineComponent({
    setup() {
      return () => h(BottomTabBar);
    },
  });
  const app = createApp(Host);
  app.component("router-link", {
    props: ["to"],
    template: '<a :href="to.name"><slot /></a>',
  });
  app.mount(container);
  return { container, unmount: () => app.unmount() };
}

describe("BottomTabBar", () => {
  it("renders all 4 tabs with correct labels", () => {
    const { container, unmount } = mountTabBar();
    const links = container.querySelectorAll("a");
    expect(links.length).toBe(4);

    const labels = Array.from(links).map((l) => l.textContent?.trim());
    expect(labels).toEqual(["Train", "Insights", "Plan", "Coach"]);
    unmount();
  });

  it("applies compact bar container height of h-13", () => {
    const { container, unmount } = mountTabBar();
    const innerContainer = container.querySelector("nav > div");
    expect(innerContainer?.className).toContain("h-13");
    expect(innerContainer?.className).not.toContain("h-16");
    unmount();
  });

  it("uses compact icon and micro-typography styling", () => {
    const { container, unmount } = mountTabBar();
    const icons = container.querySelectorAll("svg");
    expect(icons.length).toBe(4);
    icons.forEach((icon) => {
      expect(icon.getAttribute("class")).toContain("w-5");
      expect(icon.getAttribute("class")).toContain("h-5");
      expect(icon.getAttribute("class")).not.toContain("w-6");
      expect(icon.getAttribute("class")).not.toContain("h-6");
    });

    const labelSpans = container.querySelectorAll("a > span");
    labelSpans.forEach((span) => {
      expect(span.className).toContain("text-[10px]");
      expect(span.className).toContain("tracking-wider");
      expect(span.className).not.toContain("text-xs");
    });
    unmount();
  });
});
