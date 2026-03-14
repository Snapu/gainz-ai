<script setup lang="ts">
import { usePointerSwipe } from "@vueuse/core";
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    threshold?: number;
    maxSwipe?: number;
  }>(),
  {
    threshold: 100,
    maxSwipe: 140,
  },
);

const emit = defineEmits<(e: "action") => void>();

const itemRef = ref<HTMLElement | null>(null);
const { distanceX, isSwiping } = usePointerSwipe(itemRef, {
  threshold: 20,
  onSwipeEnd(e, direction) {
    if (direction === "left" && distanceX.value > props.threshold) {
      emit("action");
    }
  },
});
</script>

<template>
  <div class="relative w-full overflow-hidden rounded-xl bg-destructive/10 border border-destructive/20 border-dashed">
    <!-- Background delete action -->
    <div 
      class="absolute inset-y-0 right-0 flex items-center justify-end px-6 text-destructive transition-opacity duration-200"
      :class="{ 'opacity-100': isSwiping && distanceX > 40, 'opacity-0': !isSwiping || distanceX <= 40 }"
    >
      <slot name="background" />
    </div>
    
    <!-- Foreground content -->
    <div 
      ref="itemRef"
      class="relative w-full bg-card/95 backdrop-blur-md p-3 px-4 rounded-xl border border-white/5 shadow-sm transition-transform duration-200 ease-out touch-pan-y"
      :style="{ 
        transform: isSwiping && distanceX > 0 
          ? `translateX(-${Math.min(distanceX, props.maxSwipe)}px)` 
          : 'translateX(0px)' 
      }"
    >
      <slot />
    </div>
  </div>
</template>
