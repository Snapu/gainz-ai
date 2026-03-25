<script setup lang="ts">
import { useElementSize, usePointerSwipe } from "@vueuse/core";
import { haptic } from "ios-haptics";
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    thresholdPercent?: number; // percentage of width required to trigger (0-100)
    maxSwipePercent?: number; // max visual translation as percentage of width
  }>(),
  {
    thresholdPercent: 50,
    maxSwipePercent: 80,
  },
);

const emit = defineEmits<(e: "action") => void>();

const containerRef = ref<HTMLElement | null>(null);
const itemRef = ref<HTMLElement | null>(null);
const { width } = useElementSize(containerRef);

// Initialize pointer swipe handling before computations that depend on its refs
const { distanceX, distanceY, isSwiping } = usePointerSwipe(itemRef, {
  threshold: 0, // Catch everything for immediate detection
  onSwipeStart() {
    wasResetByScroll.value = false;
  },
  onSwipeEnd(_e, direction) {
    if (direction === "left" && isThresholdReached.value && !wasResetByScroll.value) {
      emit("action");
    }
    reset();
  },
});

const thresholdPx = computed(() => (width.value * props.thresholdPercent) / 100);
const maxSwipePx = computed(() => (width.value * props.maxSwipePercent) / 100);

const isThresholdReached = computed(() => distanceX.value > thresholdPx.value);

watch(isThresholdReached, (reached) => {
  if (reached && isSwiping.value && !wasResetByScroll.value) {
    haptic();
  }
});

const wasResetByScroll = ref(false);

let _resetTimer: number | null = null;

function forceSnapBack() {
  const el = itemRef.value;
  if (!el) return;

  // Ensure a smooth transition back to 0 even if pointer handling is still active
  el.style.transition = "transform 200ms cubic-bezier(0.16,1,0.3,1)";
  el.style.transform = "translateX(0px)";

  // Notify pointer handlers that the gesture has been cancelled so usePointerSwipe can clean up
  try {
    el.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
  } catch (e) {
    el.dispatchEvent(new Event("pointercancel", { bubbles: true }));
  }

  if (_resetTimer) window.clearTimeout(_resetTimer);
  _resetTimer = window.setTimeout(() => {
    // remove our inline transition so original CSS classes control it again
    if (el) el.style.transition = "";
    _resetTimer = null;
  }, 260);
}

/* duplicate usePointerSwipe initialization removed (handled above) */

const visualOffset = computed(() => {
  if (wasResetByScroll.value) return 0;
  // Only show visual swipe after 10px horizontal movement to avoid jitter on small taps
  if (isSwiping.value && distanceX.value > 10) {
    return Math.min(distanceX.value, maxSwipePx.value);
  }
  return 0;
});

const shouldPreventScroll = computed(() => isSwiping.value && Math.abs(distanceX.value) > 10);

const touchAction = computed(() => (shouldPreventScroll.value ? "none" : "pan-y"));

function onTouchMove(e: TouchEvent) {
  if (shouldPreventScroll.value) e.preventDefault();
}

watch(shouldPreventScroll, (prevent) => {
  const el = itemRef.value;
  if (!el) return;
  if (prevent) {
    el.addEventListener("touchmove", onTouchMove as EventListener, { passive: false });
  } else {
    el.removeEventListener("touchmove", onTouchMove as EventListener);
  }
});

function reset() {
  // Reset the flag and force a visual snap-back (and notify pointer handlers)
  wasResetByScroll.value = false;
  forceSnapBack();
}

// Coordinate horizontal vs vertical intent
watch([distanceX, distanceY], ([x, y]) => {
  if (!isSwiping.value || wasResetByScroll.value) return;

  const absX = Math.abs(x);
  const absY = Math.abs(y);

  // If vertical movement is significant or dominant early on, snap back
  if (absY > 8 && (absY > absX || absX < 10)) {
    wasResetByScroll.value = true;
    // Immediately force the item back and inform pointer handlers so it doesn't get stuck
    forceSnapBack();
  }
});

onBeforeUnmount(() => {
  if (_resetTimer) window.clearTimeout(_resetTimer);
});
</script>

<template>
  <div
    ref="containerRef"
    class="relative w-full overflow-hidden rounded-xl transition-colors duration-200"
    :class="[
      isThresholdReached && isSwiping && !wasResetByScroll
        ? 'bg-destructive/30 border-destructive/40 border-solid'
        : 'bg-destructive/10 border-destructive/20 border-dashed'
    ]"
    @pointercancel="reset"
  >
    <!-- Background delete action -->
    <div
      class="absolute inset-y-0 right-0 flex items-center justify-end px-6 text-destructive transition-all duration-200"
      :class="{
        'opacity-100 scale-110': isThresholdReached && isSwiping && !wasResetByScroll,
        'opacity-60 scale-100': !isThresholdReached && isSwiping && distanceX > 40 && !wasResetByScroll,
        'opacity-0': !isSwiping || distanceX <= 40 || wasResetByScroll
      }"
    >
      <slot name="background" />
    </div>

    <!-- Foreground content -->
    <div
      ref="itemRef"
      class="relative w-full bg-card/95 backdrop-blur-md p-3 px-4 rounded-xl border border-white/5 shadow-sm select-none"
      :class="{
        'transition-transform duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]': !isSwiping || wasResetByScroll || distanceX < 10
      }"
      :style="{
        transform: `translateX(-${visualOffset}px)`,
        touchAction: touchAction
      }"
    >
      <slot />
    </div>
  </div>
</template>
