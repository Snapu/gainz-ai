<template>
  <ion-page>
    <WizardHeader title="7/8" />

    <ion-content>
      <div class="ion-padding-horizontal">
        <h1>Anything else that you want to tell me?</h1>
      </div>
      <ion-list inset>
        <ion-item>
          <ion-textarea
            v-model="form.freeUserInput"
            label="Free input:"
            label-placement="floating"
            :rows="10"
            autofocus
          />
        </ion-item>
      </ion-list>
    </ion-content>

    <WizardFooter next-route="/wizard/api-key" />
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonItem, IonList, IonPage, IonTextarea } from "@ionic/vue";
import { reactive, watchEffect } from "vue";
import WizardFooter from "@/components/WizardFooter.vue";

import WizardHeader from "@/components/WizardHeader.vue";
import { type UserProfile, useUserProfileStore } from "@/stores/userProfile";

const userProfileStore = useUserProfileStore();

const form = reactive<UserProfile>({ ...userProfileStore.userProfile });

watchEffect(() => userProfileStore.saveUserProfile(form));
</script>
