<template>
  <ion-page>
    <WizardHeader title="8/8" />

    <ion-content>
      <div class="ion-padding">
        <h1>Finally, I need your Google Gemini API Key.</h1>
        <p>(You can also do it later)</p>
        <p>
          Get it from
          <a target="_blank" href="https://aistudio.google.com/apikey">
            https://aistudio.google.com/apikey
          </a>
        </p>
      </div>
      <ion-list>
        <ion-item>
          <ion-textarea
            v-model="apiKey"
            label="API key:"
            :rows="3"
            autofocus
            label-placement="floating"
          />
        </ion-item>
      </ion-list>
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="secondary">
          <ion-button fill="clear" @click="() => $router.back()">Previous</ion-button>
        </ion-buttons>
        <ion-buttons slot="primary">
          <ion-button fill="clear" @click="handleSave">Save</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonItem,
  IonList,
  IonPage,
  IonTextarea,
  IonToolbar,
  toastController,
} from "@ionic/vue";
import { computed } from "vue";
import { useRouter } from "vue-router";
import WizardHeader from "@/components/WizardHeader.vue";
import { useUserProfileStore } from "@/stores/userProfile";

const router = useRouter();
const userProfileStore = useUserProfileStore();
const apiKey = computed({
  get: () => userProfileStore.apiKey,
  set: (v) => {
    userProfileStore.apiKey = v;
  },
});

async function handleSave(): Promise<void> {
  const result = await userProfileStore.completeSetup();

  if (result.isOk()) {
    router.push("/exercise-logs");
  } else {
    const toast = await toastController.create({
      message: "Failed to save profile. Please try again.",
      duration: 3000,
      color: "danger",
    });
    await toast.present();
  }
}
</script>
