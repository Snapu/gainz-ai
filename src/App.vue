<template>
  <ion-app>
    <ion-router-outlet />
    <ion-loading :is-open="userProfileStore.isLoading" message="Loading profile..." />
    <PwaInstallButton />
    <PwaUpdatePrompt />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonLoading, IonRouterOutlet } from "@ionic/vue";
import PwaInstallButton from "@/components/PwaInstallButton.vue";
import PwaUpdatePrompt from "@/components/PwaUpdatePrompt.vue";
import { useUserProfileStore } from "@/stores/userProfile";

const userProfileStore = useUserProfileStore();
</script>
