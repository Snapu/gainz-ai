<script setup lang="ts">
import { useElementSize, usePointerSwipe } from "@vueuse/core";
import { haptic } from "ios-haptics";
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    thresholdPercent?: number;
    maxSwipePercent?: number;
    /** 'card' (default) — standalone rounded card; 'inset' — flat row for use inside a card container */
    variant?: "card" | "inset";
  }>(),
  {
    thresholdPercent: 60,
    maxSwipePercent: 80,
    variant: "card",
  },
);

const emit = defineEmits<(e: "action") => void>();

const containerRef = ref<HTMLElement | null>(null);
const itemRef = ref<HTMLElement | null>(null);
const { width } = useElementSize(containerRef);

const thresholdPx = computed(() => (width.value * props.thresholdPercent) / 100);
const maxSwipePx = computed(() => (width.value * props.maxSwipePercent) / 100);

const cancelledByScroll = ref(false);
const isSnappingBack = ref(false);
const hasTriggeredHaptic = ref(false);
let snapBackTimer: number | null = null;

const SWIPE_INTENT_PX = 8;
const ACTION_ICON_SHOW_PX = 40;
const VERTICAL_CANCEL_MIN_PX = 14;
const VERTICAL_CANCEL_RATIO = 1.35;
const NON_CANCELABLE_SCROLL_MIN_PX = 10;
const NON_CANCELABLE_SCROLL_RATIO = 1.15;
const SNAPBACK_TRANSITION_MS = 200;
const SNAPBACK_TIMER_MS = 260;
const SNAPBACK_EASING = "cubic-bezier(0.16,1,0.3,1)";

const { distanceX, distanceY, isSwiping } = usePointerSwipe(itemRef, {
  threshold: 0,
  onSwipeStart() {
    cancelledByScroll.value = false;
    isSnappingBack.value = false;
    hasTriggeredHaptic.value = false;
  },
  onSwipe() {
    if (!hasTriggeredHaptic.value && isThresholdReached.value && !cancelledByScroll.value) {
      haptic();
      hasTriggeredHaptic.value = true;
    }
  },
  onSwipeEnd(_e, direction) {
    if (direction === "left" && isThresholdReached.value && !cancelledByScroll.value) {
      haptic();
      emit("action");
    }
    snapBack();
  },
});

const visualOffset = computed(() => {
  if (cancelledByScroll.value || isSnappingBack.value) return 0;
  if (isSwiping.value && distanceX.value > SWIPE_INTENT_PX) {
    return Math.min(distanceX.value, maxSwipePx.value);
  }
  return 0;
});

const isThresholdReached = computed(() => visualOffset.value > thresholdPx.value);

const isHorizontalSwipe = computed(
  () => !isSnappingBack.value && isSwiping.value && Math.abs(distanceX.value) > SWIPE_INTENT_PX,
);
const isSwipeVisualActive = computed(() => visualOffset.value > 0);
const isStrongSwipeVisual = computed(() => isSwipeVisualActive.value && isThresholdReached.value);
const isSoftSwipeVisual = computed(() => isSwipeVisualActive.value && !isThresholdReached.value);
const isBackgroundActionVisible = computed(() => visualOffset.value > ACTION_ICON_SHOW_PX);

// Cancel swipe when vertical movement dominates
watch([distanceX, distanceY], ([x, y]) => {
  if (!isSwiping.value || cancelledByScroll.value) return;
  const absX = Math.abs(x);
  const absY = Math.abs(y);
  if (absY > VERTICAL_CANCEL_MIN_PX && absY > absX * VERTICAL_CANCEL_RATIO) {
    cancelledByScroll.value = true;
    snapBack();
  }
});

// Block native scroll while swiping horizontally
watch(isHorizontalSwipe, (prevent) => {
  const el = itemRef.value;
  if (!el) return;
  if (prevent) {
    el.addEventListener("touchmove", preventTouch, { passive: false });
  } else {
    el.removeEventListener("touchmove", preventTouch);
  }
});

function preventTouch(e: Event) {
  if (!isHorizontalSwipe.value) return;
  if (!e.cancelable) {
    const absX = Math.abs(distanceX.value);
    const absY = Math.abs(distanceY.value);
    const isLikelyScrolling =
      absY > NON_CANCELABLE_SCROLL_MIN_PX && absY > absX * NON_CANCELABLE_SCROLL_RATIO;
    if (isLikelyScrolling && !cancelledByScroll.value) {
      cancelledByScroll.value = true;
      snapBack(false);
    }
    return;
  }
  e.preventDefault();
}

function snapBack(shouldDispatchCancel = true) {
  const el = itemRef.value;
  if (!el) return;
  isSnappingBack.value = true;

  el.style.transition = `transform ${SNAPBACK_TRANSITION_MS}ms ${SNAPBACK_EASING}`;
  el.style.transform = "translateX(0px)";

  if (shouldDispatchCancel) {
    try {
      el.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
    } catch {
      el.dispatchEvent(new Event("pointercancel", { bubbles: true }));
    }
  }

  if (snapBackTimer) window.clearTimeout(snapBackTimer);
  snapBackTimer = window.setTimeout(() => {
    el.style.transition = "";
    isSnappingBack.value = false;
    snapBackTimer = null;
  }, SNAPBACK_TIMER_MS);
}

onBeforeUnmount(() => {
  itemRef.value?.removeEventListener("touchmove", preventTouch);
  if (snapBackTimer) window.clearTimeout(snapBackTimer);
});
</script>

<template>
  <div
    ref="containerRef"
    class="relative w-full overflow-hidden rounded-2xl transition-colors duration-200"
    :class="[
      isStrongSwipeVisual
        ? 'bg-destructive/30'
        : isSoftSwipeVisual
        ? 'bg-destructive/10'
        : 'bg-transparent'
    ]"
    @pointercancel="snapBack(false)"
  >
    <!-- Background action -->
    <div
      class="absolute inset-y-0 right-0 flex items-center justify-end px-6 text-destructive transition-all duration-200"
      :class="{
        'opacity-100 scale-110': isStrongSwipeVisual,
        'opacity-60 scale-100': isBackgroundActionVisible && !isStrongSwipeVisual,
        'opacity-0': !isBackgroundActionVisible
      }"
    >
      <slot name="background" />
    </div>

    <!-- Foreground content -->
    <div
      ref="itemRef"
      class="group relative w-full select-none transition-colors duration-300 isolate"
      :class="[
        props.variant === 'card'
          ? 'p-4 rounded-2xl border border-white/5 bg-background shadow-sm'
          : 'px-4 py-3',
        {
          'transition-transform duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]': !isSwiping || cancelledByScroll || isSnappingBack || visualOffset < SWIPE_INTENT_PX
        },
        !isSwiping && props.variant === 'card' && 'hover:border-primary/20',
        !isSwiping && props.variant === 'inset' && 'hover:bg-white/[0.04] active:bg-white/[0.06]',
      ]"
      :style="{
        transform: `translateX(-${visualOffset}px)`,
        touchAction: isHorizontalSwipe ? 'none' : 'pan-y'
      }"
    >
      <!-- Gradient styling (card variant only) -->
      <div 
        v-if="props.variant === 'card'"
        class="absolute inset-0 bg-linear-to-r from-card/60 to-card/20 rounded-2xl pointer-events-none -z-10 transition-colors duration-300"
        :class="{ 'group-hover:from-card/80': !isSwiping }"
      ></div>

      <!-- Subtle Glow effect on hover -->
      <div 
        class="absolute inset-0 bg-primary/5 opacity-0 transition-opacity rounded-2xl pointer-events-none -z-10"
        :class="{ 'group-hover:opacity-100': !isSwiping }"
      ></div>
      
      <div class="relative z-10 w-full">
        <slot />
      </div>
    </div>
  </div>
</template>
