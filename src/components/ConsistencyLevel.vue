<template>
  <ion-grid>
    <ion-row class="ion-align-items-center ">
      <ion-col size="auto">
        <ion-text>Lvl {{ userProgress.level }}</ion-text>
      </ion-col>
      <ion-col size="3" >
        <ion-progress-bar :value="userProgress.progressPercent / 100"></ion-progress-bar>
      </ion-col>
      <ion-col size="auto">
        <span v-for="i in flameCount" :key="i">🔥</span>
      </ion-col>
    </ion-row>
  </ion-grid>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { calculateUserProgress } from "@/services/leveling";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";
import { useUserProfileStore } from "@/stores/userProfile";
import { IonProgressBar, IonGrid, IonCol, IonRow, IonText } from "@ionic/vue";

const exerciseLogsStore = useExerciseLogsStore();
const userProfileStore = useUserProfileStore();

const userProgress = computed(() => {
  const aimedWorkoutsPerWeek = userProfileStore.userProfile.workoutDaysPerWeek ?? 3;
  const workoutDates = exerciseLogsStore.exerciseLogs.map((log) => log.loggedAt);
  return calculateUserProgress(workoutDates, aimedWorkoutsPerWeek);
});

// Compute flames directly from raw momentum (0.5–1.25)
const flameCount = computed(() => {
  const momentum = userProgress.value.momentum;
  const totalXP = userProgress.value.totalXP;

  if (totalXP === 0) return 0;

  if (momentum < 0.65) return 1;
  if (momentum < 0.8) return 2;
  if (momentum < 0.95) return 3;
  if (momentum < 1.1) return 4;
  return 5;
});
</script>
