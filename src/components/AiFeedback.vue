<script setup lang="ts">
import { ref } from 'vue'

import { chatboxEllipsesOutline, closeOutline } from 'ionicons/icons'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'

import AiMarkdownContainer from './AiMarkdownContainer.vue'

import { useAiStore } from '@/stores/ai'

const modalRef = ref<InstanceType<typeof IonModal> | null>(null)

const aiStore = useAiStore()

function close() {
  modalRef.value?.$el.dismiss()
}

function askAi() {
  modalRef.value?.$el.present().then(() => aiStore.askAi())
}
</script>

<template>
  <ion-button fill="clear" @click="() => askAi()">
    AI Feedback
    <ion-icon slot="start" :icon="chatboxEllipsesOutline" />
  </ion-button>

  <ion-modal ref="modalRef">
    <ion-header>
      <ion-toolbar>
        <ion-title>AI Feedback</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="() => close()">
            <ion-icon slot="icon-only" :icon="closeOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div v-if="aiStore.isLoading">
        <h3>
          <ion-skeleton-text animated style="width: 80%" />
        </h3>
        <p>
          <ion-skeleton-text animated style="width: 60%" />
        </p>
        <p>
          <ion-skeleton-text animated style="width: 30%" />
        </p>
      </div>

      <AiMarkdownContainer />
    </ion-content>
  </ion-modal>
</template>
