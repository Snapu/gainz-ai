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
    <WizardHeader title="6/8" />

    <ion-content>
      <div class="ion-padding-horizontal">
        <h1>What’s your age, height, and weight?</h1>
      </div>
      <ion-list inset>
        <ion-item>
          <ion-input
            v-model="form.age"
            label="Age"
            type="number"
            label-placement="floating"
            autofocus
          />
        </ion-item>
        <ion-item>
          <ion-input
            v-model="form.heightCm"
            label="Height in cm"
            type="number"
            label-placement="floating"
          />
        </ion-item>
        <ion-item>
          <ion-input
            v-model="form.weightKg"
            label="Weight in kg"
            type="number"
            label-placement="floating"
          />
        </ion-item>
      </ion-list>
    </ion-content>

    <WizardFooter next-route="/wizard/free-input" />
  </ion-page>
</template>
