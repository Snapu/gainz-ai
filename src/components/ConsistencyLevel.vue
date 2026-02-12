<template>
  <ion-grid>
    <ion-row class="ion-align-items-center ">
      <ion-col size="auto">
        <ion-text color="dark"><strong>LVL {{ userProgress.level }}</strong></ion-text>
      </ion-col>
      <ion-col size="3" >
        <ion-progress-bar :value="userProgress.progressPercent / 100"></ion-progress-bar>
      </ion-col>
      <ion-col size="auto">
        <span v-for="i in flameCount" :key="i">🔥</span>
      </ion-col>
    </ion-row>
    <ion-row>
      <ion-col>
        <ion-text color="dark">{{ userProgress.title }}</ion-text>
      </ion-col>
    </ion-row>
  </ion-grid>
</template>

<script setup lang="ts">
import { IonCol, IonGrid, IonProgressBar, IonRow, IonText } from "@ionic/vue";
import { computed } from "vue";
import { calculateUserProgress } from "@/services/leveling";
import { summaryToWorkoutDates } from "@/services/trainingSummary";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";
import { useTrainingSummaryStore } from "@/stores/trainingSummary";
import { useUserProfileStore } from "@/stores/userProfile";

const exerciseLogsStore = useExerciseLogsStore();
const userProfileStore = useUserProfileStore();
const trainingSummaryStore = useTrainingSummaryStore();

const userProgress = computed(() => {
  const aimedWorkoutsPerWeek = userProfileStore.userProfile.workoutDaysPerWeek ?? 3;

  const historicalDates = summaryToWorkoutDates(trainingSummaryStore.summaries);
  const currentYearDates = exerciseLogsStore.exerciseLogs.map((log) => log.loggedAt);
  const allWorkoutDates = [...historicalDates, ...currentYearDates];

  return calculateUserProgress(allWorkoutDates, aimedWorkoutsPerWeek);
});

const flameCount = computed(() => {
  const momentum = userProgress.value.momentum;
  const totalXP = userProgress.value.totalXP;

  if (totalXP === 0) return 0;

  if (momentum < 0.75) return 1;
  if (momentum < 1) return 2;
  return 3;
});
</script>
