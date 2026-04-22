<script setup lang="ts">
import type { TrainingInsights } from "@/services/trainingScience";
import BottomSheet from "./ui/BottomSheet.vue";
import MuscleActivationMap from "./ui/MuscleActivationMap.vue";

const props = defineProps<{
  insights: TrainingInsights;
}>();

const modelValue = defineModel<boolean>("open");
</script>

<template>
  <BottomSheet v-model:open="modelValue" title="Muscle Activation Map">
    <div class="flex flex-col pt-2 pb-6 overflow-x-hidden">
       <div class="-mx-4 sm:-mx-0">
          <MuscleActivationMap :muscle-groups="insights.muscleGroups" />
       </div>
    </div>
  </BottomSheet>
</template>
