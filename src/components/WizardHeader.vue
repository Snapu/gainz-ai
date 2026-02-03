<template>
  <ion-header>
    <ion-toolbar>
      <ion-title>{{ props.title }}</ion-title>
      <ion-buttons slot="end">
        <ion-button @click="() => $router.push('/exercise-logs')">
          <ion-icon slot="icon-only" :icon="closeOutline"></ion-icon>
        </ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonHeader, IonIcon, IonTitle, IonToolbar } from "@ionic/vue";
import { closeOutline } from "ionicons/icons";

interface Props {
  title?: string;
}
const props = withDefaults(defineProps<Props>(), { title: "Setup Wizard" });
</script>
