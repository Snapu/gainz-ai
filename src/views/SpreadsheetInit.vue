<script setup lang="ts">
import { useSpreadsheetStore } from '@/stores/spreadsheet'
import { IonLoading, IonPage } from '@ionic/vue'

const spreadsheetStore = useSpreadsheetStore()
</script>

<template>
  <ion-page>
    <ion-loading v-if="!spreadsheetStore.doc" is-open></ion-loading>
  </ion-page>
</template>
