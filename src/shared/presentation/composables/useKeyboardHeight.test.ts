import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent } from "vue";
import { useKeyboardHeight } from "./useKeyboardHeight";

describe("useKeyboardHeight", () => {
  let resizeListeners: Array<() => void> = [];
  let scrollListeners: Array<() => void> = [];
  let mockViewport: {
    height: number;
    offsetTop: number;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    resizeListeners = [];
    scrollListeners = [];
    mockViewport = {
      height: 852,
      offsetTop: 0,
      addEventListener: vi.fn((event: string, cb: () => void) => {
        if (event === "resize") resizeListeners.push(cb);
        if (event === "scroll") scrollListeners.push(cb);
      }),
      removeEventListener: vi.fn((event: string, cb: () => void) => {
        if (event === "resize") resizeListeners = resizeListeners.filter((l) => l !== cb);
        if (event === "scroll") scrollListeners = scrollListeners.filter((l) => l !== cb);
      }),
    };

    Object.defineProperty(window, "visualViewport", {
      value: mockViewport,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 852,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes keyboardHeight when visualViewport shrinks without offsetTop panning (e.g. ExerciseSelector top search input)", () => {
    let api: ReturnType<typeof useKeyboardHeight> | undefined;
    const Host = defineComponent({
      setup() {
        api = useKeyboardHeight();
        return () => null;
      },
    });
    const app = createApp(Host);
    app.mount(document.createElement("div"));

    api?.startTracking();
    expect(api?.visibleHeight.value).toBe(852);
    expect(api?.keyboardHeight.value).toBe(0);

    // Keyboard opens (394px tall), offsetTop stays 0
    mockViewport.height = 458;
    for (const cb of resizeListeners) cb();

    expect(api?.visibleHeight.value).toBe(458);
    expect(api?.keyboardHeight.value).toBe(394);

    app.unmount();
  });

  it("subtracts visualViewport.offsetTop on iOS so fixed bottom sheets are not double-shifted above the keyboard", () => {
    let api: ReturnType<typeof useKeyboardHeight> | undefined;
    const Host = defineComponent({
      setup() {
        api = useKeyboardHeight();
        return () => null;
      },
    });
    const app = createApp(Host);
    app.mount(document.createElement("div"));

    api?.startTracking();

    // iOS opens 394px keyboard AND pans visualViewport down by 394px (offsetTop = 394)
    mockViewport.height = 458;
    mockViewport.offsetTop = 394;
    for (const cb of resizeListeners) cb();
    for (const cb of scrollListeners) cb();

    expect(api?.visibleHeight.value).toBe(458);
    // In layout viewport coordinates, bottom of visual viewport is at 394 + 458 = 852 (bottom: 0px)
    expect(api?.keyboardHeight.value).toBe(0);

    // Partial visualViewport pan (offsetTop = 150)
    mockViewport.offsetTop = 150;
    for (const cb of scrollListeners) cb();
    expect(api?.keyboardHeight.value).toBe(244);

    // Stop tracking resets values
    api?.stopTracking();
    expect(api?.visibleHeight.value).toBe(852);
    expect(api?.keyboardHeight.value).toBe(0);

    app.unmount();
  });
});
