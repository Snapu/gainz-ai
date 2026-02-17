<template>
  <ion-page>
    <WizardHeader title="6/8" />

    <ion-content>
      <div class="ion-padding">
        <h1>What's your age, height, and weight?</h1>
      </div>
      <ion-list>
        <ion-item>
          <ion-input
            v-model="userProfile.age"
            label="Age:"
            type="number"
            autofocus
          />
        </ion-item>
        <ion-item>
          <ion-input
            v-model="userProfile.heightCm"
            label="Height in cm:"
            type="number"
          />
        </ion-item>
        <ion-item>
          <ion-input
            v-model="userProfile.weightKg"
            label="Weight in kg:"
            type="number"
          />
        </ion-item>
      </ion-list>
    </ion-content>

    <WizardFooter next-route="/wizard/free-input" />
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonInput, IonItem, IonList, IonPage } from "@ionic/vue";
import { storeToRefs } from "pinia";
import WizardFooter from "@/components/WizardFooter.vue";
import WizardHeader from "@/components/WizardHeader.vue";
import { useUserProfileStore } from "@/stores/userProfile";

const userProfileStore = useUserProfileStore();
const { userProfile } = storeToRefs(userProfileStore);
</script>
