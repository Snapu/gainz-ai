<template>
  <ion-page>
    <ion-loading :is-open="!spreadsheetStore.doc" message="Loading spreadsheet..." />
  </ion-page>
</template>

<script setup lang="ts">
import { IonLoading, IonPage } from "@ionic/vue";
import { useSpreadsheetStore } from "@/stores/spreadsheet";

const spreadsheetStore = useSpreadsheetStore();
</script>
