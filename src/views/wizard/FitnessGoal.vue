<template>
  <ion-page>
    <WizardHeader title="1/8" />

    <ion-content>
      <div class="ion-padding-horizontal">
        <h1>What's your main fitness goal?</h1>
        <p>(Pick one or two)</p>
      </div>
      <ion-list inset>
        <ion-item v-for="[label, value] in fitnessGoalLabels" :key="value">
          <UiCheckbox v-model="form.fitnessGoal" :value="value" multiple> {{ label }}</UiCheckbox>
        </ion-item>
      </ion-list>
    </ion-content>

    <WizardFooter next-route="/wizard/fitness-level" first />
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonItem, IonList, IonPage } from "@ionic/vue";
import { reactive, watchEffect } from "vue";
import UiCheckbox from "@/components/ui/UiCheckbox.vue";
import WizardFooter from "@/components/WizardFooter.vue";
import WizardHeader from "@/components/WizardHeader.vue";
import { type FitnessGoal, type UserProfile, useUserProfileStore } from "@/stores/userProfile";

const userProfileStore = useUserProfileStore();

const fitnessGoalLabels: [string, FitnessGoal][] = [
  ["🏋️ Build muscle", "build_muscle"],
  ["🏃 Lose fat", "lose_fat"],
  ["❤️ Improve endurance", "improve_endurance"],
  ["🧘 Increase mobility", "increase_mobility"],
  ["✅ General fitness", "general_fitness"],
];

const form = reactive<UserProfile>({ ...userProfileStore.userProfile });

watchEffect(() => userProfileStore.saveUserProfile(form));
</script>
