<script setup lang="ts">
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-vue-next";
import { computed, ref } from "vue";
import AppHeader from "@/components/ui/AppHeader.vue";
import Button from "@/components/ui/Button.vue";
import UiCard from "@/components/ui/UiCard.vue";
import { clearLearnedMap, getLearnedMuscleMap } from "@/services/exerciseMuscleMap";
import type { MuscleGroup } from "@/services/trainingScience";
import { calculateTrainingInsights } from "@/services/trainingScience";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";

const logsStore = useExerciseLogsStore();
const refreshKey = ref(0);

const learnedMap = computed(() => {
  refreshKey.value; // reactivity trigger
  return getLearnedMuscleMap();
});

const learnedEntries = computed(() =>
  Object.entries(learnedMap.value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([exercise, group]) => ({ exercise, group })),
);

const insights = computed(() => {
  refreshKey.value;
  return calculateTrainingInsights(logsStore.exerciseLogs, new Date(), learnedMap.value);
});

const muscleGroupEntries = computed(() =>
  Object.entries(insights.value.muscleGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, data]) => ({ group: group as MuscleGroup, ...data })),
);

const e1rmEntries = computed(() =>
  Object.entries(insights.value.e1rm)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([exercise, data]) => ({ exercise, ...data })),
);

function handleClear() {
  if (confirm("Clear all learned muscle group mappings?")) {
    clearLearnedMap();
    refreshKey.value++;
  }
}

function handleRefresh() {
  refreshKey.value++;
}

function landmarkColor(landmark: string): string {
  switch (landmark) {
    case "below_MEV":
      return "text-red-400";
    case "at_MEV":
      return "text-yellow-400";
    case "at_MAV":
      return "text-green-400";
    case "approaching_MRV":
      return "text-orange-400";
    case "above_MRV":
      return "text-red-400";
    default:
      return "text-muted-foreground";
  }
}
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col pt-safe">
    <AppHeader>
      <Button variant="ghost" size="icon" @click="$router.back()">
        <ArrowLeft class="w-5 h-5" />
      </Button>
      <h1 class="text-lg font-black tracking-tight">Debug: Training Science</h1>
      <div class="flex gap-1">
        <Button variant="ghost" size="icon" @click="handleRefresh">
          <RotateCcw class="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" @click="handleClear">
          <Trash2 class="w-4 h-4 text-red-400" />
        </Button>
      </div>
    </AppHeader>

    <main class="flex-1 px-4 pb-12 overflow-y-auto no-scrollbar space-y-6 mt-4">

      <!-- Fatigue / Deload -->
      <section>
        <h2 class="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mb-2 ml-1">Fatigue & Deload</h2>
        <UiCard class="p-4 space-y-2">
          <div class="flex justify-between text-sm">
            <span class="text-muted-foreground">Should Deload</span>
            <span :class="insights.fatigue.shouldDeload ? 'text-red-400 font-bold' : 'text-green-400'">
              {{ insights.fatigue.shouldDeload ? "YES" : "No" }}
            </span>
          </div>
          <div v-if="insights.fatigue.reason" class="text-xs text-red-400/80 italic">
            {{ insights.fatigue.reason }}
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-muted-foreground">Weekly Sets (4wk)</span>
            <span class="font-mono text-xs">{{ insights.fatigue.weeklyTotalSets.join(" → ") }}</span>
          </div>
        </UiCard>
      </section>

      <!-- Volume Landmarks -->
      <section>
        <h2 class="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mb-2 ml-1">
          Volume Landmarks ({{ muscleGroupEntries.length }} groups)
        </h2>
        <UiCard v-if="muscleGroupEntries.length > 0" class="divide-y divide-white/5 overflow-hidden">
          <div
            v-for="mg in muscleGroupEntries"
            :key="mg.group"
            class="flex items-center justify-between px-4 py-3"
          >
            <div class="flex flex-col">
              <span class="text-sm font-bold">{{ mg.group }}</span>
              <span class="text-[10px] text-muted-foreground">
                {{ mg.frequencyPerWeek }}x/wk
                <template v-if="mg.hoursSinceLastTrained !== null">
                  · {{ mg.hoursSinceLastTrained }}h ago
                </template>
              </span>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs font-bold">{{ mg.sets }} sets</span>
              <span class="text-[10px] font-black uppercase tracking-wider" :class="landmarkColor(mg.landmark)">
                {{ mg.landmark.replace("_", " ") }}
              </span>
            </div>
          </div>
        </UiCard>
        <p v-else class="text-sm text-muted-foreground/50 ml-1">No data yet</p>
      </section>

      <!-- e1RM -->
      <section>
        <h2 class="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mb-2 ml-1">
          Estimated 1RM ({{ e1rmEntries.length }} exercises)
        </h2>
        <UiCard v-if="e1rmEntries.length > 0" class="divide-y divide-white/5 overflow-hidden">
          <div
            v-for="ex in e1rmEntries"
            :key="ex.exercise"
            class="flex items-center justify-between px-4 py-3"
          >
            <div class="flex flex-col">
              <span class="text-sm font-bold">{{ ex.exercise }}</span>
              <span class="text-[10px] text-muted-foreground font-mono">
                trend: {{ ex.trend.join(" → ") }}
              </span>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-sm font-black text-primary">{{ ex.e1rm }}<span class="text-[10px] opacity-60 ml-0.5">kg</span></span>
              <span
                v-if="ex.plateau"
                class="text-[9px] font-black uppercase tracking-wider text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded"
              >plateau</span>
            </div>
          </div>
        </UiCard>
        <p v-else class="text-sm text-muted-foreground/50 ml-1">No data yet</p>
      </section>

      <!-- Learned Map -->
      <section>
        <h2 class="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mb-2 ml-1">
          Learned Muscle Map ({{ learnedEntries.length }} entries)
        </h2>
        <UiCard v-if="learnedEntries.length > 0" class="divide-y divide-white/5 overflow-hidden">
          <div
            v-for="entry in learnedEntries"
            :key="entry.exercise"
            class="flex items-center justify-between px-4 py-2.5"
          >
            <span class="text-sm text-foreground/80">{{ entry.exercise }}</span>
            <span class="text-xs font-bold text-primary">{{ entry.group }}</span>
          </div>
        </UiCard>
        <p v-else class="text-sm text-muted-foreground/50 ml-1">No learned mappings yet — the AI will populate this after its first response.</p>
      </section>
    </main>
  </div>
</template>
