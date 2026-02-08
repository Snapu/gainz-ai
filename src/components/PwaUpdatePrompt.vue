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
import { onMounted } from "vue";

const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegistered(r) {
    console.log("SW Registered:", r);
    // Check for updates every 60 seconds
    if (r) {
      setInterval(() => {
        console.log("Checking for SW updates...");
        r.update();
      }, 60000);
    }
  },
  onRegisterError(error) {
    console.log("SW registration error", error);
  },
});

// Check for updates when component mounts
onMounted(() => {
  if (navigator.serviceWorker) {
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration) {
        console.log("Checking for SW updates on mount...");
        registration.update();
      }
    });
  }
});
</script>
