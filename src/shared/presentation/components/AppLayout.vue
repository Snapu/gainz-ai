<script setup lang="ts">
import { Keyboard } from "@capacitor/keyboard";
import { Plus } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { onMounted, ref } from "vue";
import { useRestTimerStore } from "@/modules/platform/presentation";
import { LogExerciseSheet } from "@/modules/trainingLogs/presentation";
import RestTimerToast from "@/shared/presentation/components/RestTimerToast.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import { useLogSheet } from "../composables/useLogSheet";
import BottomTabBar from "./BottomTabBar.vue";

const restTimerStore = useRestTimerStore();
const { isResting, formattedTime: formattedRestTime } = storeToRefs(restTimerStore);
const logSheet = useLogSheet();

const isKeyboardVisible = ref(false);

onMounted(() => {
  try {
    Keyboard.addListener("keyboardWillShow", () => {
      isKeyboardVisible.value = true;
    });
    Keyboard.addListener("keyboardWillHide", () => {
      isKeyboardVisible.value = false;
    });
  } catch (e) {
    console.warn("Keyboard plugin not available", e);
  }
});

function handleFabClick() {
  if (isResting.value) {
    restTimerStore.reset();
  }
  logSheet.openNewLog();
}
</script>

<template>
  <div class="h-screen w-full relative overflow-hidden bg-background">
    <!-- Main content area -->
    <div class="absolute inset-0 pb-16">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <keep-alive>
            <component :is="Component" />
          </keep-alive>
        </transition>
      </router-view>
    </div>

    <!-- FAB & Timer Container -->
    <div v-show="!isKeyboardVisible" class="fixed bottom-20 right-6 z-50 pointer-events-none flex flex-col items-end gap-4">
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

      <!-- Primary FAB -->
      <UiButton 
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
