<script setup lang="ts">
import { useElementSize, useEventListener, usePointerSwipe } from "@vueuse/core";
import { computed, ref } from "vue";

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

const thresholdPx = computed(() => (width.value * props.thresholdPercent) / 100);
const maxSwipePx = computed(() => (width.value * props.maxSwipePercent) / 100);

const isThresholdReached = computed(() => distanceX.value > thresholdPx.value);

const wasResetByScroll = ref(false);

const { distanceX, isSwiping } = usePointerSwipe(itemRef, {
  threshold: 15,
  onSwipeStart() {
    wasResetByScroll.value = false;
  },
  onSwipeEnd(e, direction) {
    if (direction === "left" && isThresholdReached.value && !wasResetByScroll.value) {
      emit("action");
    }
    reset();
  },
});

const touchStartPos = ref({ x: 0, y: 0 });

const visualOffset = computed(() => {
  if (wasResetByScroll.value) return 0;
  if (isSwiping.value && distanceX.value > 0) {
    return Math.min(distanceX.value, maxSwipePx.value);
  }
  return 0;
});

function reset() {
  wasResetByScroll.value = false;
}

// Manual touch handling for snap-back on scroll
function onTouchStart(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return;
  touchStartPos.value = {
    x: touch.clientX,
    y: touch.clientY,
  };
  wasResetByScroll.value = false;
}

function onTouchMove(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return;

  const deltaY = Math.abs(touch.clientY - touchStartPos.value.y);

  // If user starts scrolling vertically, snap back immediately
  if (deltaY > 10 && isSwiping.value) {
    wasResetByScroll.value = true;
  }
}

// Passive listeners are fine now since we want to allow scrolling
useEventListener(itemRef, "touchstart", onTouchStart, { passive: true });
useEventListener(itemRef, "touchmove", onTouchMove, { passive: true });
useEventListener(itemRef, "touchend", reset, { passive: true });
useEventListener(itemRef, "touchcancel", reset, { passive: true });
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
        'transition-transform duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]': !isSwiping || wasResetByScroll 
      }"
      :style="{ 
        transform: `translateX(-${visualOffset}px)`,
        touchAction: 'pan-y'
      }"
    >
      <slot />
    </div>
  </div>
</template>
