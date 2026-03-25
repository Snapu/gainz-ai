import { computed, onBeforeUnmount, ref } from "vue";

/**
 * Tracks the on-screen keyboard height by comparing `window.innerHeight`
 * (layout viewport, unchanged by keyboard) with `visualViewport.height`
 * (visual viewport, which shrinks when the keyboard opens on iOS/Android).
 *
 * Returns:
 *  - `keyboardHeight`: pixels occupied by the keyboard (0 when closed)
 *  - `visibleHeight`:  visible viewport height (shrinks when keyboard opens)
 *  - `startTracking`: begin listening for viewport changes
 *  - `stopTracking`:  stop listening and reset to full window height
 */
export function useKeyboardHeight() {
  const visibleHeight = ref(window.visualViewport?.height ?? window.innerHeight);

  function update() {
    visibleHeight.value = window.visualViewport?.height ?? window.innerHeight;
  }

  function startTracking() {
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
  }

  function stopTracking() {
    window.visualViewport?.removeEventListener("resize", update);
    window.visualViewport?.removeEventListener("scroll", update);
    visibleHeight.value = window.innerHeight;
  }

  const keyboardHeight = computed(() => Math.max(0, window.innerHeight - visibleHeight.value));

  onBeforeUnmount(stopTracking);

  return { visibleHeight, keyboardHeight, startTracking, stopTracking };
}
