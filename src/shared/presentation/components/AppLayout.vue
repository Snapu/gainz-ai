<script setup lang="ts">
import { Plus } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { useRoute } from "vue-router";
import { useRestTimerStore } from "@/modules/platform/presentation";
import { LogExerciseSheet } from "@/modules/trainingLogs/presentation";
import RestTimerToast from "@/shared/presentation/components/RestTimerToast.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import { useKeyboard } from "../composables/useKeyboard";
import { useLogSheet } from "../composables/useLogSheet";
import BottomTabBar from "./BottomTabBar.vue";

const restTimerStore = useRestTimerStore();
const { isResting, formattedTime: formattedRestTime } = storeToRefs(restTimerStore);
const logSheet = useLogSheet();
const route = useRoute();
const { isKeyboardVisible } = useKeyboard();

function handleFabClick() {
  if (isResting.value) {
    restTimerStore.reset();
  }
  logSheet.openNewLog();
}
</script>

<template>
  <div class="h-screen h-[100dvh] w-full relative overflow-hidden bg-background">
    <!-- Main content area -->
    <div :class="['absolute inset-0', !isKeyboardVisible ? 'pb-tab-bar' : 'pb-0']">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <keep-alive :max="4">
            <component :is="Component" />
          </keep-alive>
        </transition>
      </router-view>
    </div>

    <!-- FAB & Timer Container -->
    <div
      v-show="!isKeyboardVisible && (route.name === 'home' || isResting)"
      class="fixed bottom-20 right-6 z-50 pointer-events-none flex flex-col items-end gap-4 transition-all duration-200"
    >
      <!-- Rest Timer Toast -->
      <Transition name="fade-slide">
        <RestTimerToast
          v-if="isResting"
          class="pointer-events-auto"
          :formatted-time="formattedRestTime"
          :is-overtime="restTimerStore.isOvertime"
          :target-rest-seconds="restTimerStore.targetRestSeconds"
          :rest-elapsed="restTimerStore.restElapsed"
          @dismiss="restTimerStore.reset()"
        />
      </Transition>

      <!-- Primary FAB (Train tab only) -->
      <UiButton 
        v-if="route.name === 'home'"
        class="relative w-14 h-14 shrink-0 rounded-full shadow-lg active:scale-95 transition-all pointer-events-auto" 
        size="icon" 
        @click="handleFabClick"
      >
        <Plus class="w-7 h-7" />
      </UiButton>
    </div>

    <!-- Reusable Bottom Sheet Form -->
    <LogExerciseSheet 
      v-model:open="logSheet.isOpen.value" 
      :log-to-edit="logSheet.logToEdit.value"
      :prefill-data="logSheet.prefillData.value"
      :rest-seconds="logSheet.restSeconds.value"
    />

    <!-- Bottom Navigation Bar -->
    <BottomTabBar v-show="!isKeyboardVisible" />
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
