<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Gainz AI</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="ion-padding-horizontal">
        <div class="ion-text-center">
          <ion-button fill="clear" @click="authStore.login">Login with Google</ion-button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();
</script>
