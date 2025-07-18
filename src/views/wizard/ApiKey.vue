<script setup lang="ts">
import { reactive, watchEffect } from 'vue'

import { IonContent, IonInput, IonItem, IonList, IonPage } from '@ionic/vue'

import { type UserProfile, useUserProfileStore } from '@/stores/userProfile'

import WizardHeader from '@/components/WizardHeader.vue'
import WizardFooter from '@/components/WizardFooter.vue'

const userProfileStore = useUserProfileStore()

const form = reactive<UserProfile>({ ...userProfileStore.userProfile })

watchEffect(() => userProfileStore.saveUserProfile(form))
</script>

<template>
  <ion-page>
    <WizardHeader title="8/8" />

    <ion-content>
      <div class="ion-padding-horizontal">
        <h1>Finally, I need your Google Gemini API Key.</h1>
        <p>(You can also do it later)</p>
        <p>
          Get it from:
          <a target="_blank" href="https://aistudio.google.com/apikey">
            https://aistudio.google.com/apikey
          </a>
        </p>
      </div>
      <ion-list inset>
        <ion-item>
          <ion-input v-model="form.apiKey" label="API key" label-placement="floating" autofocus />
        </ion-item>
      </ion-list>
    </ion-content>

    <WizardFooter next-route="/exercise-logs" next-label="Save" />
  </ion-page>
</template>
