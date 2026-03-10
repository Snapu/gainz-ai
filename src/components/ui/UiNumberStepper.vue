<template>
  <div class="stepper-container">
    <ion-label v-if="props.label" class="stepper-label">{{ props.label }}</ion-label>

    <ion-button
      fill="clear"
      size="default"
      class="stepper-btn"
      :disabled="isDecrementDisabled"
      @click="decrement"
    >
      <ion-icon slot="icon-only" :icon="removeOutline" />
    </ion-button>

    <ion-input
      v-model.number="model"
      type="number"
      class="stepper-input"
      :min="props.min?.toString()"
      :max="props.max?.toString()"
      :step="props.step?.toString()"
    />

    <ion-button
      fill="clear"
      size="default"
      class="stepper-btn"
      :disabled="isIncrementDisabled"
      @click="increment"
    >
      <ion-icon slot="icon-only" :icon="addOutline" />
    </ion-button>
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonInput, IonLabel } from "@ionic/vue";
import { addOutline, removeOutline } from "ionicons/icons";
import { computed } from "vue";

interface Props {
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}

const props = withDefaults(defineProps<Props>(), {
  step: 1,
});

const model = defineModel<number | null>();

// Precision helper to avoid float math errors (e.g. 0.1 + 0.2 = 0.300000004)
function roundToStep(val: number): number {
  return Math.round(val / props.step) * props.step;
}

const isDecrementDisabled = computed(() => {
  if (model.value === null || model.value === undefined) return false;
  if (props.min !== undefined && model.value <= props.min) return true;
  return false;
});

const isIncrementDisabled = computed(() => {
  if (model.value === null || model.value === undefined) return false;
  if (props.max !== undefined && model.value >= props.max) return true;
  return false;
});

function decrement() {
  if (model.value === null || model.value === undefined) {
    model.value = props.min !== undefined ? props.min : 0;
    return;
  }

  const nextVal = roundToStep(model.value - props.step);
  if (props.min !== undefined && nextVal < props.min) {
    model.value = props.min;
  } else {
    model.value = nextVal;
  }
}

function increment() {
  if (model.value === null || model.value === undefined) {
    model.value = props.step;
    return;
  }

  const nextVal = roundToStep(model.value + props.step);
  if (props.max !== undefined && nextVal > props.max) {
    model.value = props.max;
  } else {
    model.value = nextVal;
  }
}
</script>

<style scoped>
.stepper-container {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 4px;
}

.stepper-label {
  min-width: 100px;
  flex-shrink: 0;
}

.stepper-btn {
  --padding-start: 0;
  --padding-end: 0;
  min-height: 44px; /* Touch target size */
  min-width: 44px;
  margin: 0;
  flex-shrink: 0;
}

.stepper-input {
  text-align: center;
  --padding-start: 8px;
  --padding-end: 8px;
  flex: 1;
  max-width: 100px;
}

/* 
  Deep selector to target the native input inside shadow DOM 
  to ensure text is centered 
*/
:deep(.native-input) {
  text-align: center;
}
</style>
