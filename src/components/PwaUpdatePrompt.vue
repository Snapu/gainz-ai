<template>
  <ion-toast
    :is-open="needRefresh"
    message="New version available!"
    position="bottom"
    :buttons="[
      {
        text: 'Update',
        role: 'info',
        handler: () => updateServiceWorker(),
      },
      {
        text: 'Later',
        role: 'cancel',
      },
    ]"
  />
</template>

<script setup lang="ts">
import { useRegisterSW } from "virtual:pwa-register/vue";
import { IonToast } from "@ionic/vue";

const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegistered(r) {
    console.log("SW Registered:", r);
  },
  onRegisterError(error) {
    console.log("SW registration error", error);
  },
});
</script>
