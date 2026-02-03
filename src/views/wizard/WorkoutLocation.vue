<template>
  <ion-page>
    <WizardHeader title="4/8" />

    <ion-content>
      <div class="ion-padding-horizontal">
        <h1>Where do you work out most?</h1>
      </div>
      <ion-list inset>
        <ion-item v-for="[label, value] in workoutLocationLabels" :key="value">
          <UiCheckbox v-model="form.workoutLocation" :value="value">{{ label }}</UiCheckbox>
        </ion-item>
      </ion-list>
    </ion-content>

    <WizardFooter next-route="/wizard/equipment-option" />
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonItem, IonList, IonPage } from "@ionic/vue";
import { reactive, watchEffect } from "vue";
import UiCheckbox from "@/components/ui/UiCheckbox.vue";
import WizardFooter from "@/components/WizardFooter.vue";
import WizardHeader from "@/components/WizardHeader.vue";
import { type UserProfile, useUserProfileStore, type WorkoutLocation } from "@/stores/userProfile";

const userProfileStore = useUserProfileStore();

const workoutLocationLabels: [string, WorkoutLocation][] = [
  ["🏋️ Gym", "gym"],
  ["🏠 Home", "home"],
  ["🌍 Both", "both"],
];

const form = reactive<UserProfile>({ ...userProfileStore.userProfile });

watchEffect(() => userProfileStore.saveUserProfile(form));
</script>
