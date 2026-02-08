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
  immediate: true,
  onRegistered(r) {
    console.log("SW Registered:", r);
    // Check for updates every 60 seconds
    if (r) {
      setInterval(
        () => {
          console.log("Checking for SW updates...");
          r.update();
        },
        60 * 1000,
      );
    }
  },
  onRegisterError(error) {
    console.log("SW registration error", error);
  },
  onNeedRefresh() {
    console.log("New SW version available - auto-reloading...");
    // Auto-reload on iOS for better update experience
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      window.location.reload();
    }
  },
});
</script>
