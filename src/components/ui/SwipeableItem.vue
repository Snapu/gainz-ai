<script setup lang="ts">
import { useElementSize, usePointerSwipe } from "@vueuse/core";
import { haptic } from "ios-haptics";
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    thresholdPercent?: number;
    maxSwipePercent?: number;
  }>(),
  {
    thresholdPercent: 60,
    maxSwipePercent: 80,
  },
);

const emit = defineEmits<(e: "action") => void>();

const containerRef = ref<HTMLElement | null>(null);
const itemRef = ref<HTMLElement | null>(null);
const { width } = useElementSize(containerRef);

const thresholdPx = computed(() => (width.value * props.thresholdPercent) / 100);
const maxSwipePx = computed(() => (width.value * props.maxSwipePercent) / 100);

const cancelledByScroll = ref(false);
const hasTriggeredHaptic = ref(false);
let snapBackTimer: number | null = null;

const { distanceX, distanceY, isSwiping } = usePointerSwipe(itemRef, {
  threshold: 0,
  onSwipeStart() {
    cancelledByScroll.value = false;
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

const isThresholdReached = computed(() => distanceX.value > thresholdPx.value);

const visualOffset = computed(() => {
  if (cancelledByScroll.value) return 0;
  if (isSwiping.value && distanceX.value > 10) {
    return Math.min(distanceX.value, maxSwipePx.value);
  }
  return 0;
});

const isHorizontalSwipe = computed(() => isSwiping.value && Math.abs(distanceX.value) > 10);

// Cancel swipe when vertical movement dominates
watch([distanceX, distanceY], ([x, y]) => {
  if (!isSwiping.value || cancelledByScroll.value) return;
  const absX = Math.abs(x);
  const absY = Math.abs(y);
  if (absY > 8 && (absY > absX || absX < 10)) {
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
  if (isHorizontalSwipe.value) e.preventDefault();
}

function snapBack() {
  cancelledByScroll.value = false;
  const el = itemRef.value;
  if (!el) return;

  el.style.transition = "transform 200ms cubic-bezier(0.16,1,0.3,1)";
  el.style.transform = "translateX(0px)";

  try {
    el.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
  } catch {
    el.dispatchEvent(new Event("pointercancel", { bubbles: true }));
  }

  if (snapBackTimer) window.clearTimeout(snapBackTimer);
  snapBackTimer = window.setTimeout(() => {
    if (el) el.style.transition = "";
    snapBackTimer = null;
  }, 260);
}

onBeforeUnmount(() => {
  if (snapBackTimer) window.clearTimeout(snapBackTimer);
});
</script>

<template>
  <div
    ref="containerRef"
    class="relative w-full overflow-hidden rounded-2xl transition-colors duration-200"
    :class="[
      isThresholdReached && isSwiping && !cancelledByScroll
        ? 'bg-destructive/30 border-destructive/40 border-solid'
        : isSwiping && !cancelledByScroll && distanceX > 0
        ? 'bg-destructive/10 border-destructive/20 border-dashed'
        : 'bg-transparent border-transparent'
    ]"
    @pointercancel="snapBack"
  >
    <!-- Background action -->
    <div
      class="absolute inset-y-0 right-0 flex items-center justify-end px-6 text-destructive transition-all duration-200"
      :class="{
        'opacity-100 scale-110': isThresholdReached && isSwiping && !cancelledByScroll,
        'opacity-60 scale-100': !isThresholdReached && isSwiping && distanceX > 40 && !cancelledByScroll,
        'opacity-0': !isSwiping || distanceX <= 40 || cancelledByScroll
      }"
    >
      <slot name="background" />
    </div>

    <!-- Foreground content -->
    <div
      ref="itemRef"
      class="group relative w-full p-4 rounded-2xl border border-white/5 shadow-sm select-none transition-colors duration-300 isolate"
      :class="[
        {
          'transition-transform duration-200 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]': !isSwiping || cancelledByScroll || distanceX < 10
        },
        !isSwiping && 'hover:border-primary/20'
      ]"
      :style="{
        transform: `translateX(-${visualOffset}px)`,
        touchAction: isHorizontalSwipe ? 'none' : 'pan-y'
      }"
    >
      <!-- Base opaque layer to block red from bleeding through -->
      <div class="absolute inset-0 bg-background rounded-2xl pointer-events-none -z-10"></div>
      
      <!-- Gradient styling -->
      <div 
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
