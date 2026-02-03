<template>
  <ion-page>
    <ion-loading v-if="!spreadsheetStore.doc" is-open></ion-loading>
  </ion-page>
</template>

<script setup lang="ts">
import { IonLoading, IonPage } from "@ionic/vue";
import { useSpreadsheetStore } from "@/stores/spreadsheet";

const spreadsheetStore = useSpreadsheetStore();
</script>
