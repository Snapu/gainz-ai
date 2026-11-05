<script setup lang="ts">
import { LogExerciseSheet } from "@/modules/trainingLogs/presentation";
import { useKeyboard } from "../composables/useKeyboard";
import { useLogSheet } from "../composables/useLogSheet";
import BottomTabBar from "./BottomTabBar.vue";

const logSheet = useLogSheet();
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
