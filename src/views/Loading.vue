<script setup lang="ts">
import { useOnline } from "@vueuse/core";
import { computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/modules/auth/presentation";
import { useSpreadsheetStore } from "@/modules/platform/presentation";
import { useUserProfileStore } from "@/modules/profile/presentation";
import { resolveRouteTarget } from "@/router/routePolicy";
import UiTelemetryLoader from "@/shared/presentation/components/ui/UiTelemetryLoader.vue";

const router = useRouter();
const authStore = useAuthStore();
const profileStore = useUserProfileStore();
const spreadsheetStore = useSpreadsheetStore();
const isOnline = useOnline();

const loadingMessage = computed(() => {
  if (!isOnline.value && !spreadsheetStore.doc) {
    return "Waiting for network connection...";
  }
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
  { immediate: true },
);
</script>

<template>
  <UiTelemetryLoader 
    fullscreen 
    :text="loadingMessage" 
    subtitle="Gainz AI Engine"
  />
</template>
