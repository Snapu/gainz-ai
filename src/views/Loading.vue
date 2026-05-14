<script setup lang="ts">
import { computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/modules/auth/presentation";
import { useSpreadsheetStore } from "@/modules/platform/presentation";
import { useUserProfileStore } from "@/modules/profile/presentation";
import { resolveRouteTarget } from "@/router/routePolicy";

const router = useRouter();
const authStore = useAuthStore();
const profileStore = useUserProfileStore();
const spreadsheetStore = useSpreadsheetStore();

const loadingMessage = computed(() => {
  return profileStore.isLoading ? "Loading profile..." : "Loading spreadsheet...";
});

// Re-evaluate routing when the loading-relevant state changes.
// The beforeEach guard only fires on route transitions, so we need
// an explicit watcher to push the user forward once loading finishes.
watch(
  () => ({
    isLoggedIn: authStore.isLoggedIn,
    hasDoc: !!spreadsheetStore.doc,
    isLoading: profileStore.isLoading,
    setupCompleted: profileStore.setupCompleted,
  }),
  (state) => {
    const target = resolveRouteTarget("/loading", undefined, state);
    if (target !== true) {
      router.push(target);
    }
  },
);
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-background p-6">
    <div class="relative flex items-center justify-center mb-8">
      <div class="w-16 h-16 rounded-full border-4 border-white/5 animate-pulse"></div>
      <div class="absolute w-16 h-16 rounded-full border-t-4 border-primary animate-spin"></div>
    </div>
    <h2 class="text-xl font-bold tracking-tight text-foreground transition-all duration-300">{{ loadingMessage }}</h2>
  </div>
</template>
