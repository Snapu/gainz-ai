<template>
  <ion-page>
    <WizardHeader title="3/8" />

    <ion-content>
      <div class="ion-padding-horizontal">
        <h1>How many days per week do you want to train?</h1>
      </div>
      <ion-list inset>
        <ion-item v-for="[label, value] in workoutDaysPerWeekLabels" :key="value">
          <UiCheckbox v-model="form.workoutDaysPerWeek" :value="value">{{ label }}</UiCheckbox>
        </ion-item>
      </ion-list>
    </ion-content>

    <WizardFooter next-route="/wizard/workout-location" />
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonItem, IonList, IonPage } from "@ionic/vue";
import { reactive, watchEffect } from "vue";
import UiCheckbox from "@/components/ui/UiCheckbox.vue";
import WizardFooter from "@/components/WizardFooter.vue";
import WizardHeader from "@/components/WizardHeader.vue";
import { type UserProfile, useUserProfileStore } from "@/stores/userProfile";

const userProfileStore = useUserProfileStore();

const workoutDaysPerWeekLabels: [string, number][] = [
  ["2", 2],
  ["3", 3],
  ["4", 4],
  ["5+", 5],
];

const form = reactive<UserProfile>({ ...userProfileStore.userProfile });

watchEffect(() => userProfileStore.saveUserProfile(form));
</script>
