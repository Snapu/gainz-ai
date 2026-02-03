<template>
  <ion-button class="text-mono" fill="clear" @click="toggleTimer">
    {{ formatedTime }}
    <ion-icon slot="start" :icon="timer ? refresh : playOutline"></ion-icon>
  </ion-button>
</template>

<script setup lang="ts">
import { IonButton, IonIcon } from "@ionic/vue";
import { playOutline, refresh } from "ionicons/icons";
import { computed, ref } from "vue";

const totalMs = ref(0);
const startTimestamp = ref(Date.now());
const timer = ref<ReturnType<typeof setInterval> | null>(null);

const formatedTime = computed(() => {
  const totalSeconds = Math.floor(totalMs.value / 1000);
  const duration = {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
  // @ts-expect-error
  return new Intl.DurationFormat(undefined, {
    style: "digital",
    hoursDisplay: "auto",
  }).format(duration);
});

function toggleTimer() {
  if (timer.value) {
    clearInterval(timer.value);
    timer.value = null;
    totalMs.value = 0;
  } else {
    startTimestamp.value = Date.now();
    timer.value = setInterval(() => {
      totalMs.value = Date.now() - startTimestamp.value;
    }, 1000);
  }
}
</script>

<style scoped>
.text-mono {
  font-family: monospace;
}
</style>
