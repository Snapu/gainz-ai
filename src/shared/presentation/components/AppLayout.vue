<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import { useRestTimerStore } from "@/modules/platform/presentation";
import { LogExerciseSheet } from "@/modules/trainingLogs/presentation";
import RestTimerToast from "@/shared/presentation/components/RestTimerToast.vue";
import { useKeyboard } from "../composables/useKeyboard";
import { useLogSheet } from "../composables/useLogSheet";
import BottomTabBar from "./BottomTabBar.vue";

const restTimerStore = useRestTimerStore();
const { isResting, formattedTime: formattedRestTime } = storeToRefs(restTimerStore);
const logSheet = useLogSheet();
const route = useRoute();
const { isKeyboardVisible } = useKeyboard();
</script>

<template>
  <div class="h-full w-full flex flex-col overflow-hidden bg-background">
    <!-- Main content area -->
    <div class="flex-1 min-h-0 w-full relative overflow-hidden">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <keep-alive :max="4">
            <component :is="Component" />
          </keep-alive>
        </transition>
      </router-view>
    </div>

    <!-- Rest Timer Toast (outside Train tab, which has its own docked interaction deck) -->
    <div
      v-show="!isKeyboardVisible"
      class="fixed right-5 z-50 pointer-events-none flex flex-col items-end gap-3 transition-all duration-200"
      :style="{
        bottom: 'calc(4.75rem + env(safe-area-inset-bottom, 0px))'
      }"
    >
      <Transition name="fade-slide">
        <RestTimerToast
          v-if="isResting && route.name !== 'home'"
          class="pointer-events-auto"
          :formatted-time="formattedRestTime"
          :is-overtime="restTimerStore.isOvertime"
          :target-rest-seconds="restTimerStore.targetRestSeconds"
          :rest-elapsed="restTimerStore.restElapsed"
          @dismiss="restTimerStore.reset()"
        />
      </Transition>
    </div>

    <!-- Reusable Bottom Sheet Form -->
    <LogExerciseSheet 
      v-model:open="logSheet.isOpen.value" 
      :log-to-edit="logSheet.logToEdit.value"
      :prefill-data="logSheet.prefillData.value"
      :rest-seconds="logSheet.restSeconds.value"
    />

    <!-- Bottom Navigation Bar -->
    <BottomTabBar v-show="!isKeyboardVisible" class="shrink-0" />
  </div>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  transform: translateY(10px);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
