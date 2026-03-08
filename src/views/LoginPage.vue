<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Gainz AI</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="ion-padding">
        <div class="ion-text-center">
          <ion-button @click="login">
            Sign in with Google
          </ion-button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  toastController,
} from "@ionic/vue";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();

async function login() {
  const result = await authStore.login();
  if (result.isErr()) {
    const message =
      result.error === "missing-scopes"
        ? "Login failed. Please grant the required permissions and try again."
        : "Login failed. Please try again.";
    const toast = await toastController.create({
      message,
      duration: 3000,
      color: "danger",
    });
    await toast.present();
  }
}
</script>
