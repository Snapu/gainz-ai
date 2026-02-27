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
          <GoogleLogin v-if="!authStore.isEmailSet" :callback="handleIdToken"/>
          <ion-button v-else fill="clear" @click="authStore.login">Continue</ion-button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { type CallbackTypes, decodeCredential } from "vue3-google-login";
import { z } from "zod";
import { useAuthStore } from "@/stores/auth";

const claimsSchema = z.object({
  email: z.email(),
});

const authStore = useAuthStore();

const handleIdToken: CallbackTypes.CredentialCallback = (response) => {
  // TODO error handling for invalid credential format or missing email claim
  const userData = claimsSchema.parse(decodeCredential(response.credential));
  authStore.setEmail(userData.email);
};
</script>
