<template>
  <ion-page>
    <WizardHeader title="4/8" />

    <ion-content>
      <div class="ion-padding">
        <h1>Where do you work out most?</h1>
      </div>
      <ion-list>
        <ion-item v-for="[label, value] in workoutLocationLabels" :key="value">
          <UiCheckbox v-model="userProfile.workoutLocation" :value="value">{{ label }}</UiCheckbox>
        </ion-item>
      </ion-list>
    </ion-content>

    <WizardFooter next-route="/wizard/equipment-option" />
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonItem, IonList, IonPage } from "@ionic/vue";
import { storeToRefs } from "pinia";
import UiCheckbox from "@/components/ui/UiCheckbox.vue";
import WizardFooter from "@/components/WizardFooter.vue";
import WizardHeader from "@/components/WizardHeader.vue";
import { useUserProfileStore, type WorkoutLocation } from "@/stores/userProfile";

const userProfileStore = useUserProfileStore();
const { userProfile } = storeToRefs(userProfileStore);

const workoutLocationLabels: [string, WorkoutLocation][] = [
  ["🏋️ Gym", "gym"],
  ["🏠 Home", "home"],
  ["🌍 Both", "both"],
];
</script>
