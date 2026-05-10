<script setup lang="ts">
import { computed } from "vue";
import { useUserProfileStore } from "@/modules/profile/presentation";

const profileStore = useUserProfileStore();

const loadingMessage = computed(() => {
  return profileStore.isLoading ? "Loading profile..." : "Loading spreadsheet...";
});
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
