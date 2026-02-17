<template>
  <ion-page>
    <WizardHeader title="5/8" />

    <ion-content>
      <div class="ion-padding">
        <h1>What equipment do you have access to?</h1>
      </div>
      <ion-list>
        <ion-item v-for="[label, value] in equipmentOptionLabels" :key="value">
          <UiCheckbox v-model="userProfile.equipmentAccess" :value="value" multiple>
            {{ label }}
          </UiCheckbox>
        </ion-item>
      </ion-list>
    </ion-content>

    <WizardFooter next-route="/wizard/body-stats" />
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonItem, IonList, IonPage } from "@ionic/vue";
import { storeToRefs } from "pinia";
import UiCheckbox from "@/components/ui/UiCheckbox.vue";
import WizardFooter from "@/components/WizardFooter.vue";
import WizardHeader from "@/components/WizardHeader.vue";
import { type EquipmentOption, type UserProfile, useUserProfileStore } from "@/stores/userProfile";

const userProfileStore = useUserProfileStore();
const { userProfile } = storeToRefs(userProfileStore);

const equipmentOptionLabels: [string, EquipmentOption][] = [
  // 🔹 Minimal / No Equipment
  ["Bodyweight only", "bodyweight"],

  // 🔸 Lightweight / Portable Equipment
  ["Resistance bands", "resistance_bands"],
  ["Suspension trainer (e.g. TRX)", "suspension_trainer"],
  ["Gymnastic rings", "gymnastic_rings"],

  // 🔹 Calisthenics / Fixed Bars
  ["Pull-up bar", "pull_up_bar"],
  ["Dip bar", "dip_bar"],

  // 🔸 Free Weights
  ["Dumbbells", "dumbbells"],
  ["Kettlebells", "kettlebells"],
  ["Barbell & rack", "barbell_rack"],
  ["Bench", "bench"],

  // 🔹 Machines
  ["Cable machine", "cable_machine"],
  ["Cardio machines", "cardio_machine"],

  // 🔸 Functional Tools
  ["Medicine ball", "medicine_ball"],
];
</script>
