import type { PluginListenerHandle } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import {
  type DeepReadonly,
  getCurrentInstance,
  onMounted,
  onUnmounted,
  type Ref,
  readonly,
  ref,
} from "vue";

const isKeyboardVisible = ref(false);
let activeSubscribers = 0;
let listenerHandles: Promise<PluginListenerHandle>[] = [];
let visualViewportHandler: (() => void) | null = null;

function handleViewportResize(): void {
  if (typeof window === "undefined" || !window.visualViewport) return;
  const viewport = window.visualViewport;
  const heightDiff = window.innerHeight - viewport.height;
  // Ignore pinch-zoom (scale > 1.05) and detect virtual keyboard height (> 150px)
  if (viewport.scale <= 1.05 && heightDiff > 150) {
    isKeyboardVisible.value = true;
  } else if (heightDiff <= 50) {
    isKeyboardVisible.value = false;
  }
}

export function useKeyboard(): {
  isKeyboardVisible: DeepReadonly<Ref<boolean>>;
} {
  if (getCurrentInstance()) {
    onMounted(() => {
      activeSubscribers++;
      if (activeSubscribers === 1) {
        // 1. Mobile Web / PWA Virtual Viewport fallback
        if (typeof window !== "undefined" && window.visualViewport) {
          visualViewportHandler = handleViewportResize;
          window.visualViewport.addEventListener("resize", visualViewportHandler);
        }

        // 2. Capacitor native keyboard plugin
        try {
          const show = () => {
            isKeyboardVisible.value = true;
          };
          const hide = () => {
            isKeyboardVisible.value = false;
          };

          const p1 = Keyboard.addListener("keyboardWillShow", show);
          const p2 = Keyboard.addListener("keyboardDidShow", show);
          const p3 = Keyboard.addListener("keyboardWillHide", hide);
          const p4 = Keyboard.addListener("keyboardDidHide", hide);

          p1.catch(() => {});
          p2.catch(() => {});
          p3.catch(() => {});
          p4.catch(() => {});

          listenerHandles = [p1, p2, p3, p4];
        } catch {
          // Keyboard plugin not supported on web
        }
      }
    });

    onUnmounted(() => {
      activeSubscribers--;
      if (activeSubscribers <= 0) {
        activeSubscribers = 0;
        isKeyboardVisible.value = false;

        if (typeof window !== "undefined" && window.visualViewport && visualViewportHandler) {
          window.visualViewport.removeEventListener("resize", visualViewportHandler);
          visualViewportHandler = null;
        }

        for (const promise of listenerHandles) {
          promise.then((handle) => handle.remove()).catch(() => {});
        }
        listenerHandles = [];
      }
    });
  }

  return {
    isKeyboardVisible: readonly(isKeyboardVisible),
  };
}

export function _resetKeyboardStateForTesting(): void {
  activeSubscribers = 0;
  isKeyboardVisible.value = false;
  if (typeof window !== "undefined" && window.visualViewport && visualViewportHandler) {
    window.visualViewport.removeEventListener("resize", visualViewportHandler);
    visualViewportHandler = null;
  }
  listenerHandles = [];
}
