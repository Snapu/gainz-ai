<script setup lang="ts">
import { useElementSize, usePointerSwipe } from "@vueuse/core";
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

const wasResetByScroll = ref(false);

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

const visualOffset = computed(() => {
  if (wasResetByScroll.value) return 0;
  // Only show visual swipe after 10px horizontal movement to avoid jitter on small taps
  if (isSwiping.value && distanceX.value > 10) {
    return Math.min(distanceX.value, maxSwipePx.value);
  }
  return 0;
});

function reset() {
  wasResetByScroll.value = false;
}

// Coordinate horizontal vs vertical intent
watch([distanceX, distanceY], ([x, y]) => {
  if (!isSwiping.value || wasResetByScroll.value) return;

  const absX = Math.abs(x);
  const absY = Math.abs(y);

  // If vertical movement is significant or dominant early on, snap back
  if (absY > 8 && (absY > absX || absX < 10)) {
    wasResetByScroll.value = true;
  }
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
        touchAction: 'pan-y'
      }"
    >
      <slot />
    </div>
  </div>
</template>
