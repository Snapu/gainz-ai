<template>
  <ion-fab  horizontal="end" vertical="center" class="ion-margin-horizontal">
    <ion-fab-button color="light"  @click="() => askAi()">
      <ion-icon :icon="sparklesSharp"></ion-icon>
    </ion-fab-button>
  </ion-fab>

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
      <div v-if="aiStore.isLoading" class="skeleton-feedback">
        <div class="skeleton-timestamp">
          <ion-skeleton-text animated style="width: 80px; height: 14px;" />
        </div>
        <div class="skeleton-content">
          <ion-skeleton-text animated style="width: 100%; height: 20px;" />
          <ion-skeleton-text animated style="width: 95%; height: 16px;" />
          <ion-skeleton-text animated style="width: 98%; height: 16px;" />
          <ion-skeleton-text animated style="width: 90%; height: 16px;" />
          <ion-skeleton-text animated style="width: 85%; height: 16px;" />
          <ion-skeleton-text animated style="width: 92%; height: 16px;" />
        </div>
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
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonModal,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";

import { closeOutline, sparklesSharp } from "ionicons/icons";
import { ref } from "vue";
import { useAiStore } from "@/stores/ai";
import AiMarkdownContainer from "./AiMarkdownContainer.vue";

const modalRef = ref<InstanceType<typeof IonModal> | null>(null);

const aiStore = useAiStore();

function close() {
  modalRef.value?.$el.dismiss();
}

async function askAi() {
  await modalRef.value?.$el.present();

  // If we have cached messages, show them immediately
  if (aiStore.messages.length > 0) {
    console.debug("Showing cached messages");
  }

  // Then try to get new AI response (will be skipped if no new logs)
  await aiStore.askAi();
}
</script>

<style scoped>
.skeleton-feedback {
  margin-bottom: 2rem;
}

.skeleton-timestamp {
  margin-bottom: 0.5rem;
}

.skeleton-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
