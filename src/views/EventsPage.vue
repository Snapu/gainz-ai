<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/exercise-logs" />
        </ion-buttons>
        <ion-title>Events</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="calendar-placeholder">
        <p>Calendar will be added in Task 7</p>
      </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button @click="openAddModal">
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
import { addOutline } from "ionicons/icons";
import { ref } from "vue";

const modalOpen = ref(false);

function openAddModal() {
  modalOpen.value = true;
  // Modal implementation will be added in Task 7
  console.log("Open add modal");
}
</script>

<style scoped>
.calendar-placeholder {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  border: 1px dashed var(--ion-color-medium);
  border-radius: 8px;
  margin-bottom: 16px;
  color: var(--ion-color-medium);
}
</style>
