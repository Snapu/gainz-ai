<template>
  <!-- Chrome/Android install button -->
  <ion-fab
    v-if="showInstallButton && !isIos"
    vertical="bottom"
    horizontal="center"
    slot="fixed"
  >
    <ion-fab-button @click="installPwa" color="primary">
      <ion-icon :icon="downloadOutline" />
    </ion-fab-button>
  </ion-fab>

  <!-- iOS instructions alert -->
  <ion-alert
    v-if="showIosInstructions && isIos"
    is-open
    header="Add to Home Screen"
    message="Tap the Share button and select 'Add to Home Screen' to install this app."
    :buttons="[
      {
        text: 'Got it',
        handler: dismissIosPrompt,
      },
    ]"
  />
</template>

<script setup lang="ts">
import { IonAlert, IonFab, IonFabButton, IonIcon } from "@ionic/vue";
import { downloadOutline } from "ionicons/icons";
import { onMounted, ref } from "vue";

const showInstallButton = ref(false);
const showIosInstructions = ref(false);
const isIos = ref(false);
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const isIosDevice = (): boolean => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
};

onMounted(() => {
  isIos.value = isIosDevice();

  // Check if app is already installed
  if (window.matchMedia("(display-mode: standalone)").matches) {
    showInstallButton.value = false;
    showIosInstructions.value = false;
    return;
  }

  if (isIos.value) {
    // Only show iOS instructions if not previously dismissed
    const dismissed = localStorage.getItem("pwa-ios-prompt-dismissed");
    if (!dismissed) {
      showIosInstructions.value = true;
    }
  } else {
    // Listen for the beforeinstallprompt event on Android/Chrome
    window.addEventListener("beforeinstallprompt", (e) => {
      // Prevent the default mini-infobar
      e.preventDefault();
      // Save the event for later use
      deferredPrompt.value = e as BeforeInstallPromptEvent;
      // Show install button
      showInstallButton.value = true;
    });

    // Hide button if app gets installed
    window.addEventListener("appinstalled", () => {
      showInstallButton.value = false;
      deferredPrompt.value = null;
    });
  }
});

const installPwa = async () => {
  if (!deferredPrompt.value) {
    return;
  }

  // Show the install prompt
  await deferredPrompt.value.prompt();

  // Wait for the user's response
  await deferredPrompt.value.userChoice;

  // Clear the deferred prompt
  deferredPrompt.value = null;
};

const dismissIosPrompt = () => {
  showIosInstructions.value = false;
  localStorage.setItem("pwa-ios-prompt-dismissed", "true");
};
</script>
