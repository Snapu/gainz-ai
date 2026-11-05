import { type ComputedRef, computed, onBeforeUnmount, type Ref, ref } from "vue";

/**
 * Tracks the on-screen keyboard offset for `position: fixed` bottom sheets by
 * comparing `window.innerHeight` (layout viewport) with `visualViewport.height`
 * and `visualViewport.offsetTop` (which shifts when iOS WebKit pans the visual
 * viewport upon focusing an input in the lower half of the screen).
 *
 * Returns:
 *  - `keyboardHeight`: CSS `bottom` offset in px to anchor a fixed element to the visual viewport bottom
 *  - `visibleHeight`:  visible viewport height (shrinks when keyboard opens)
 *  - `startTracking`: begin listening for viewport changes
 *  - `stopTracking`:  stop listening and reset to full window height
 */
export function useKeyboardHeight(): {
  visibleHeight: Ref<number>;
  keyboardHeight: ComputedRef<number>;
  startTracking: () => void;
  stopTracking: () => void;
} {
  const layoutHeight = ref(window.innerHeight);
  const visibleHeight = ref(window.visualViewport?.height ?? window.innerHeight);
  const offsetTop = ref(window.visualViewport?.offsetTop ?? 0);

  function update(): void {
    layoutHeight.value = window.innerHeight;
    visibleHeight.value = window.visualViewport?.height ?? window.innerHeight;
    offsetTop.value = window.visualViewport?.offsetTop ?? 0;
  }

  function startTracking(): void {
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
  }

  function stopTracking(): void {
    window.removeEventListener("resize", update);
    window.visualViewport?.removeEventListener("resize", update);
    window.visualViewport?.removeEventListener("scroll", update);
    layoutHeight.value = window.innerHeight;
    visibleHeight.value = window.innerHeight;
    offsetTop.value = 0;
  }

  const keyboardHeight = computed(() =>
    Math.max(0, layoutHeight.value - visibleHeight.value - offsetTop.value),
  );

  onBeforeUnmount(stopTracking);

  return { visibleHeight, keyboardHeight, startTracking, stopTracking };
}
