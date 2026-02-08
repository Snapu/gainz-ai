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
import { useDocumentVisibility } from "@vueuse/core";
import { watch } from "vue";

const { needRefresh, updateServiceWorker } = useRegisterSW({
  immediate: true,
  onRegistered(r) {
    // Check for updates every 60 seconds
    if (r) {
      setInterval(() => r.update(), 60 * 1000);
    }
  },
});

// Check for updates when app becomes visible
const visibility = useDocumentVisibility();
watch(visibility, (current) => {
  if (current === "visible") {
    navigator.serviceWorker?.getRegistration().then((r) => r?.update());
  }
});
</script>
