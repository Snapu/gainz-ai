<template>
  <ion-app>
    <ion-router-outlet />
    <PwaInstallButton />
    <PwaUpdatePrompt />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from "@ionic/vue";
import PwaInstallButton from "@/components/PwaInstallButton.vue";
import PwaUpdatePrompt from "@/components/PwaUpdatePrompt.vue";
</script>
