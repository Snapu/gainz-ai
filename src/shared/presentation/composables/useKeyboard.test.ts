import { Keyboard } from "@capacitor/keyboard";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent } from "vue";
import { _resetKeyboardStateForTesting, useKeyboard } from "./useKeyboard";

vi.mock("@capacitor/keyboard", () => ({
  Keyboard: {
    addListener: vi.fn().mockImplementation(() => {
      return Promise.resolve({
        remove: vi.fn(),
      });
    }),
  },
}));

describe("useKeyboard", () => {
  beforeEach(() => {
    _resetKeyboardStateForTesting();
  });

  afterEach(() => {
    _resetKeyboardStateForTesting();
  });

  it("provides reactive readonly isKeyboardVisible", () => {
    const { isKeyboardVisible } = useKeyboard();
    expect(isKeyboardVisible.value).toBe(false);
  });

  it("subscribes and unsubscribes to keyboard events on component mount/unmount", async () => {
    const callbacks: Record<string, () => void> = {};
    const mockRemove = vi.fn();

    vi.mocked(Keyboard.addListener).mockImplementation((event: string, cb: () => void) => {
      callbacks[event] = cb;
      return Promise.resolve({ remove: mockRemove });
    });

    let vmInstance: { isKeyboardVisible: { value: boolean } } | undefined;
    const TestComponent = defineComponent({
      setup() {
        const { isKeyboardVisible } = useKeyboard();
        vmInstance = { isKeyboardVisible };
        return { isKeyboardVisible };
      },
      template: `<div></div>`,
    });

    const el = document.createElement("div");
    const app = createApp(TestComponent);
    app.mount(el);

    expect(vmInstance?.isKeyboardVisible.value).toBe(false);

    // iOS willShow
    callbacks.keyboardWillShow?.();
    expect(vmInstance?.isKeyboardVisible.value).toBe(true);

    // iOS willHide
    callbacks.keyboardWillHide?.();
    expect(vmInstance?.isKeyboardVisible.value).toBe(false);

    // Android didShow
    callbacks.keyboardDidShow?.();
    expect(vmInstance?.isKeyboardVisible.value).toBe(true);

    // Android didHide
    callbacks.keyboardDidHide?.();
    expect(vmInstance?.isKeyboardVisible.value).toBe(false);

    app.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockRemove).toHaveBeenCalledTimes(4);
  });

  it("resets isKeyboardVisible to false when all subscribers unmount while keyboard was visible", async () => {
    const callbacks: Record<string, () => void> = {};
    vi.mocked(Keyboard.addListener).mockImplementation((event: string, cb: () => void) => {
      callbacks[event] = cb;
      return Promise.resolve({ remove: vi.fn() });
    });

    let vmInstance: { isKeyboardVisible: { value: boolean } } | undefined;
    const TestComponent = defineComponent({
      setup() {
        const { isKeyboardVisible } = useKeyboard();
        vmInstance = { isKeyboardVisible };
        return { isKeyboardVisible };
      },
      template: `<div></div>`,
    });

    const el = document.createElement("div");
    const app = createApp(TestComponent);
    app.mount(el);

    callbacks.keyboardWillShow?.();
    expect(vmInstance?.isKeyboardVisible.value).toBe(true);

    app.unmount();
    expect(vmInstance?.isKeyboardVisible.value).toBe(false);
  });

  it("safely handles rejected listener promises on web without unhandled errors", async () => {
    vi.mocked(Keyboard.addListener).mockReturnValue(
      Promise.reject(new Error('"Keyboard" plugin is not implemented on web')),
    );

    const TestComponent = defineComponent({
      setup() {
        const { isKeyboardVisible } = useKeyboard();
        return { isKeyboardVisible };
      },
      template: `<div></div>`,
    });

    const el = document.createElement("div");
    const app = createApp(TestComponent);

    // Should not throw an unhandled rejection
    expect(() => app.mount(el)).not.toThrow();
    app.unmount();
  });

  it("detects keyboard via window.visualViewport in mobile PWA mode", async () => {
    let triggerResize = () => {};
    const mockViewport = {
      height: 800,
      scale: 1,
      addEventListener: vi.fn((event: string, cb: () => void) => {
        if (event === "resize") triggerResize = cb;
      }),
      removeEventListener: vi.fn(),
    };

    Object.defineProperty(window, "visualViewport", {
      value: mockViewport,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      writable: true,
      configurable: true,
    });

    let vmInstance: { isKeyboardVisible: { value: boolean } } | undefined;
    const TestComponent = defineComponent({
      setup() {
        const { isKeyboardVisible } = useKeyboard();
        vmInstance = { isKeyboardVisible };
        return { isKeyboardVisible };
      },
      template: `<div></div>`,
    });

    const el = document.createElement("div");
    const app = createApp(TestComponent);
    app.mount(el);

    expect(mockViewport.addEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(vmInstance?.isKeyboardVisible.value).toBe(false);

    // Virtual keyboard opens (takes 300px, viewport shrinks from 800 to 500)
    mockViewport.height = 500;
    triggerResize();
    expect(vmInstance?.isKeyboardVisible.value).toBe(true);

    // Virtual keyboard closes (restores to 800)
    mockViewport.height = 800;
    triggerResize();
    expect(vmInstance?.isKeyboardVisible.value).toBe(false);

    app.unmount();
    expect(mockViewport.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
  });
});
