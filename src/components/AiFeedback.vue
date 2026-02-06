<template>
  <ion-button fill="clear" @click="() => askAi()">
    <ion-icon slot="start" :icon="sparklesOutline" />
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

<script setup lang="ts">
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
} from "@ionic/vue";

import { closeOutline, sparklesOutline } from "ionicons/icons";
import { ref } from "vue";
import { useAiStore } from "@/stores/ai";
import AiMarkdownContainer from "./AiMarkdownContainer.vue";

const modalRef = ref<InstanceType<typeof IonModal> | null>(null);

const aiStore = useAiStore();

function close() {
  modalRef.value?.$el.dismiss();
}

function askAi() {
  modalRef.value?.$el.present().then(() => aiStore.askAi());
}
</script>
