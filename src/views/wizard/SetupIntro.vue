<script setup lang="ts">
import { IonButton, IonContent, IonPage } from '@ionic/vue'

import WizardHeader from '@/components/WizardHeader.vue'
</script>

<template>
  <ion-page>
    <WizardHeader />

    <ion-content>
      <div class="ion-padding-horizontal">
        <h1>Hello! 👋</h1>
        <p>I'm your <strong>AI Personal Trainer</strong>!</p>
        <p>
          Before we begin, tell me a bit about you and your goals so I can give you personalized
          feedback.
        </p>
      </div>
      <div class="ion-text-center">
        <ion-button fill="clear" @click="() => $router.push('/wizard/fitness-goal')">
          Start
        </ion-button>
      </div>
    </ion-content>
  </ion-page>
</template>
