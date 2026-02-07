<template>
  <ion-page>
    <WizardHeader title="2/8" />

    <ion-content>
      <div class="ion-padding">
        <h1>What’s your current fitness level?</h1>
      </div>
      <ion-list>
        <ion-item v-for="[label, value] in fitnessLevelLabels" :key="value">
          <UiCheckbox v-model="form.fitnessLevel" :value="value"> {{ label }}</UiCheckbox>
        </ion-item>
      </ion-list>
    </ion-content>

    <WizardFooter next-route="/wizard/workout-days-per-week" />
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonItem, IonList, IonPage } from "@ionic/vue";
import { reactive, watchEffect } from "vue";
import UiCheckbox from "@/components/ui/UiCheckbox.vue";
import WizardFooter from "@/components/WizardFooter.vue";
import WizardHeader from "@/components/WizardHeader.vue";
import { type FitnessLevel, type UserProfile, useUserProfileStore } from "@/stores/userProfile";

const userProfileStore = useUserProfileStore();

const fitnessLevelLabels: [string, FitnessLevel][] = [
  ["🟢 Beginner", "beginner"],
  ["🟡 Intermediate", "intermediate"],
  ["🔴 Advanced", "advanced"],
];

const form = reactive<UserProfile>({ ...userProfileStore.userProfile });

watchEffect(() => userProfileStore.saveUserProfile(form));
</script>
