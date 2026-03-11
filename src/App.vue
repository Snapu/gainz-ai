<template>
  <ion-app>
    <ion-router-outlet />
    <ion-loading
      :is-open="!spreadsheetStore.doc || userProfileStore.isLoading"
      :message="!spreadsheetStore.doc ? 'Loading spreadsheet...' : 'Loading profile...'"
    />
    <PwaInstallButton />
    <PwaUpdatePrompt />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonLoading, IonRouterOutlet } from "@ionic/vue";
import PwaInstallButton from "@/components/PwaInstallButton.vue";
import PwaUpdatePrompt from "@/components/PwaUpdatePrompt.vue";
import { useSpreadsheetStore } from "@/stores/spreadsheet";
import { useUserProfileStore } from "@/stores/userProfile";

const spreadsheetStore = useSpreadsheetStore();
const userProfileStore = useUserProfileStore();
</script>
