import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { MuscleGroup, MuscleGroupInsight } from "@/modules/trainingInsights/presentation";
import MuscleActivationMap from "./MuscleActivationMap.vue";

function createTouch(target: Element, identifier: number, x: number, y: number): Touch {
  return {
    identifier,
    target,
    clientX: x,
    clientY: y,
    pageX: x,
    pageY: y,
    screenX: x,
    screenY: y,
    radiusX: 1,
    radiusY: 1,
    rotationAngle: 0,
    force: 1,
  };
}

function simulateSwipe(
  element: HTMLElement,
  startX: number,
  endX: number,
  startY = 200,
  endY = 200,
) {
  const touchStart = createTouch(element, 1, startX, startY);
  const touchEnd = createTouch(element, 1, endX, endY);

  element.dispatchEvent(
    new TouchEvent("touchstart", {
      bubbles: true,
      cancelable: true,
      touches: [touchStart],
      targetTouches: [touchStart],
      changedTouches: [touchStart],
    }),
  );

  element.dispatchEvent(
    new TouchEvent("touchmove", {
      bubbles: true,
      cancelable: true,
      touches: [touchEnd],
      targetTouches: [touchEnd],
      changedTouches: [touchEnd],
    }),
  );

  element.dispatchEvent(
    new TouchEvent("touchend", {
      bubbles: true,
      cancelable: true,
      touches: [],
      targetTouches: [],
      changedTouches: [touchEnd],
    }),
  );
}

function getMapContainer(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>(".touch-pan-y");
  if (!el) {
    throw new Error("Map container (.touch-pan-y) not found");
  }
  return el;
}

function mountMap(muscleGroups: Partial<Record<MuscleGroup, MuscleGroupInsight>> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const container = document.createElement("div");
  document.body.appendChild(container);

  const Host = defineComponent({
    setup() {
      return () => h(MuscleActivationMap, { muscleGroups });
    },
  });

  const app = createApp(Host);
  app.use(pinia);
  app.mount(container);

  return {
    container,
    unmount: () => {
      app.unmount();
      container.remove();
    },
  };
}

describe("MuscleActivationMap.vue", () => {
  let unmountMap: (() => void) | undefined;

  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    unmountMap?.();
    unmountMap = undefined;
  });

  it("renders anterior view by default with anterior muscles", async () => {
    const mounted = mountMap();
    unmountMap = mounted.unmount;
    await nextTick();

    expect(mounted.container.textContent).toContain("Chest");
    expect(mounted.container.textContent).toContain("Abs");
    expect(mounted.container.textContent).not.toContain("Lats");
    expect(mounted.container.textContent).not.toContain("Glutes");
  });

  it("flips view to posterior and back when swiping horizontally", async () => {
    const mounted = mountMap();
    unmountMap = mounted.unmount;
    await nextTick();

    const mapContainer = getMapContainer(mounted.container);

    // Swipe left (startX=250, endX=50) to flip to posterior
    simulateSwipe(mapContainer, 250, 50);
    await nextTick();

    expect(mounted.container.textContent).toContain("Lats");
    expect(mounted.container.textContent).toContain("Upper Back");
    expect(mounted.container.textContent).not.toContain("Chest");

    // Swipe right (startX=50, endX=250) to flip back to anterior
    simulateSwipe(mapContainer, 50, 250);
    await nextTick();

    expect(mounted.container.textContent).toContain("Chest");
    expect(mounted.container.textContent).toContain("Abs");
    expect(mounted.container.textContent).not.toContain("Lats");
  });

  it("does not flip view on vertical swipe", async () => {
    const mounted = mountMap();
    unmountMap = mounted.unmount;
    await nextTick();

    const mapContainer = getMapContainer(mounted.container);

    // Swipe up (startY=300, endY=100) — should not flip
    simulateSwipe(mapContainer, 150, 150, 300, 100);
    await nextTick();

    expect(mounted.container.textContent).toContain("Chest");
    expect(mounted.container.textContent).not.toContain("Lats");

    // Swipe down (startY=100, endY=300) — should not flip
    simulateSwipe(mapContainer, 150, 150, 100, 300);
    await nextTick();

    expect(mounted.container.textContent).toContain("Chest");
    expect(mounted.container.textContent).not.toContain("Lats");
  });

  it("closes an open muscle selection when flipping views via swipe or toggle", async () => {
    const mounted = mountMap();
    unmountMap = mounted.unmount;
    await nextTick();

    const mapContainer = getMapContainer(mounted.container);

    // Click the Chest callout label to select it
    const chestLabel = Array.from(mounted.container.querySelectorAll("span")).find(
      (el) => el.textContent?.trim() === "Chest",
    );
    if (!chestLabel) throw new Error("Chest label not found");
    chestLabel.click();
    await nextTick();

    // Selected muscle dims unselected callouts (opacity-40)
    expect(mounted.container.querySelector(".opacity-40")).not.toBeNull();

    // Horizontal swipe flips view and clears selection
    simulateSwipe(mapContainer, 250, 50);
    await nextTick();

    expect(mounted.container.textContent).toContain("Lats");
    expect(mounted.container.querySelector(".opacity-40")).toBeNull();

    // Select Lats, then switch back via segmented control button
    const latsLabel = Array.from(mounted.container.querySelectorAll("span")).find(
      (el) => el.textContent?.trim() === "Lats",
    );
    if (!latsLabel) throw new Error("Lats label not found");
    latsLabel.click();
    await nextTick();
    expect(mounted.container.querySelector(".opacity-40")).not.toBeNull();

    const anteriorBtn = Array.from(mounted.container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.trim() === "Front",
    );
    if (!anteriorBtn) throw new Error("Front toggle button not found");
    anteriorBtn.click();
    await nextTick();

    expect(mounted.container.textContent).toContain("Chest");
    expect(mounted.container.querySelector(".opacity-40")).toBeNull();
  });
});
