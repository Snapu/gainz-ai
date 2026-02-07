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
            v-model="form.apiKey"
            label="API key:"
            :rows="3"
            autofocus
            label-placement="floating"
          />
        </ion-item>
      </ion-list>
    </ion-content>

    <WizardFooter next-route="/exercise-logs" next-label="Save" />
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
