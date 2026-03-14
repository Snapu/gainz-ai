<script setup lang="ts">
import { useElementSize, useEventListener, usePointerSwipe } from "@vueuse/core";
import { computed, ref, watch } from "vue";

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

const { distanceX, isSwiping } = usePointerSwipe(itemRef, {
  threshold: 0, // Catch everything, we handle locking manually
  onSwipeEnd(e, direction) {
    if (direction === "left" && isThresholdReached.value) {
      emit("action");
    }
    reset();
  },
});

const manualOffset = ref(0);
const isLockingScroll = ref(false);
const touchStartPos = ref({ x: 0, y: 0 });

const visualOffset = computed(() => {
  if (isSwiping.value && distanceX.value > 0) {
    return Math.min(distanceX.value, maxSwipePx.value);
  }
  return manualOffset.value;
});

function reset() {
  manualOffset.value = 0;
  isLockingScroll.value = false;
}

function handlePointerCancel() {
  reset();
}

// Manual touch handling for robust scroll locking
function onTouchStart(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return;
  touchStartPos.value = {
    x: touch.clientX,
    y: touch.clientY,
  };
  isLockingScroll.value = false;
}

function onTouchMove(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return;

  if (isLockingScroll.value) {
    if (e.cancelable) e.preventDefault();
    return;
  }

  const deltaX = Math.abs(touch.clientX - touchStartPos.value.x);
  const deltaY = Math.abs(touch.clientY - touchStartPos.value.y);

  // Capture horizontal swipe earlier (5px)
  if (deltaX > 5 || deltaY > 5) {
    if (deltaX > deltaY) {
      isLockingScroll.value = true;
      if (e.cancelable) e.preventDefault();
    }
    // If vertical wins, we don't lock, browser handles scroll
  }
}

function onTouchEnd() {
  if (!isSwiping.value) {
    reset();
  }
}

// Register non-passive listeners for reliable e.preventDefault() on iOS
useEventListener(itemRef, "touchstart", onTouchStart, { passive: true });
useEventListener(itemRef, "touchmove", onTouchMove, { passive: false });
useEventListener(itemRef, "touchend", onTouchEnd, { passive: true });
useEventListener(itemRef, "touchcancel", reset, { passive: true });

// Ensure manual state cleanup when swipe state changes unexpectedly
watch(isSwiping, (swiping) => {
  if (!swiping) {
    isLockingScroll.value = false;
  }
});
</script>

<template>
  <div 
    ref="containerRef"
    class="relative w-full overflow-hidden rounded-xl transition-colors duration-200"
    :class="[
      isThresholdReached && isSwiping 
        ? 'bg-destructive/30 border-destructive/40 border-solid' 
        : 'bg-destructive/10 border-destructive/20 border-dashed'
    ]"
    @pointercancel="handlePointerCancel"
  >
    <!-- Background delete action -->
    <div 
      class="absolute inset-y-0 right-0 flex items-center justify-end px-6 text-destructive transition-all duration-200"
      :class="{ 
        'opacity-100 scale-110': isThresholdReached && isSwiping,
        'opacity-60 scale-100': !isThresholdReached && isSwiping && distanceX > 40,
        'opacity-0': !isSwiping || distanceX <= 40 
      }"
    >
      <slot name="background" />
    </div>
    
    <!-- Foreground content -->
    <div 
      ref="itemRef"
      class="relative w-full bg-card/95 backdrop-blur-md p-3 px-4 rounded-xl border border-white/5 shadow-sm select-none"
      :class="{ 'transition-transform duration-150 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]': !isSwiping }"
      :style="{ 
        transform: `translateX(-${visualOffset}px)`,
        touchAction: 'pan-y'
      }"
    >
      <slot />
    </div>
  </div>
</template>
