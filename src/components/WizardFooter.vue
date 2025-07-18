<script setup lang="ts">
import { IonButton, IonButtons, IonFooter, IonToolbar } from '@ionic/vue'

interface Props {
  nextRoute: string
  nextLabel?: string
  first?: boolean
}
const props = withDefaults(defineProps<Props>(), { nextLabel: 'Next', first: false })
</script>

<template>
  <ion-footer>
    <ion-toolbar>
      <ion-buttons slot="secondary" v-if="!first">
        <ion-button fill="clear" @click="() => $router.back()">Previous</ion-button>
      </ion-buttons>
      <ion-buttons slot="primary">
        <ion-button fill="clear" @click="() => $router.push(props.nextRoute)">
          {{ props.nextLabel }}
        </ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-footer>
</template>
