<template>
  <div class="header-progress">
    <!-- Level -->
    <div class="level">
      <strong>L{{ userProgress.level }}</strong>
    </div>

    <!-- XP Bar -->
    <div class="bar-track xp-track">
      <div class="bar-fill xp-bar" :style="{ width: userProgress.progressPercent + '%' }"></div>
    </div>
    <span class="bar-label">{{ userProgress.progressPercent }}%</span>

    <!-- Momentum as Flames -->
    <div class="momentum">
      <span
        v-for="i in flameCount"
        :key="i"
        class="flame"
      >
        🔥
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { calculateUserProgress } from "@/services/leveling";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";
import { useUserProfileStore } from "@/stores/userProfile";

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

<style scoped>
.header-progress {
  display: flex;
  justify-content: center; /* horizontally center everything */
  align-items: center;     /* vertical alignment */
  gap: 8px;
  font-family: Arial, sans-serif;
  font-size: 0.85rem;
}

.level {
  min-width: 36px;
  text-align: center;
  font-weight: bold;
}

.bar-track {
  position: relative;
  flex: 1; /* bars expand to fill space */
  height: 10px;
  background-color: #e0e0e0;
  border-radius: 5px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.5s ease;
}

.xp-bar {
  background-color: #3b82f6;
}

.momentum {
  display: flex;
  gap: 2px;
}

.flame {
  font-size: 1rem;
}
</style>
