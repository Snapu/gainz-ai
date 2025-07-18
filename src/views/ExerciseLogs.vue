<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef, watchEffect } from 'vue'

import { add, settingsOutline } from 'ionicons/icons'
import {
  IonAccordion,
  IonAccordionGroup,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonListHeader,
  IonLoading,
  IonMenu,
  IonMenuButton,
  IonMenuToggle,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'

import router from '@/router'

import { localeDateString } from '@/services/utils/date'
import { formatNumberWithUnit, formatUnit } from '@/services/utils/units'

import { useExercisesStore } from '@/stores/exercises'
import { type ExerciseLogState, useExerciseLogsStore } from '@/stores/exerciseLogs'

import StopWatch from '@/components/StopWatch.vue'
import AiFeedback from '@/components/AiFeedback.vue'
import UiCombobox from '@/components/ui/UiCombobox.vue'

const contentRef = useTemplateRef('content')
const cacheAiFeedback = ref(false)
const open = ref([localeDateString(new Date())])

const exercisesStore = useExercisesStore()
const exerciseLogsStore = useExerciseLogsStore()

const groupedLogs = computed(() =>
  exerciseLogsStore.exerciseLogs.reduce(
    (a, o) => {
      const day = localeDateString(o.logged_at)
      a[day] = a[day] ? [...a[day], o] : [o]
      return a
    },
    {} as Record<string, ExerciseLogState[]>,
  ),
)

const currentExerciseName = ref<string | null>(null)
const currentReps = ref<number | null>(null)
const currentDistance = ref<number | null>(null)
const currentWeight = ref<number | null>(null)
const currentDuration = ref<number | null>(null)

function scrollBottom() {
  contentRef?.value?.$el.scrollToBottom(500)
}

function logCurrentExercise() {
  if (!currentExerciseName.value) return
  exercisesStore.addExercise({ name: currentExerciseName.value.trim() })
  exerciseLogsStore.addExerciseLog({
    logged_at: new Date(),
    exercise_name: currentExerciseName.value,
    reps: currentReps.value,
    weight: currentWeight.value,
    distance: currentDistance.value,
    duration: currentDuration.value,
  })
  cacheAiFeedback.value = false
  setTimeout(() => scrollBottom(), 200)
}

function deleteLog(log: ExerciseLogState) {
  exerciseLogsStore.removeExerciseLog(log)
}

onMounted(() => {
  setTimeout(() => scrollBottom(), 200)
})

watchEffect(() => {
  if (!currentExerciseName.value) return
  const lastLog = exerciseLogsStore.lastLogForExercise(currentExerciseName.value)
  currentReps.value = lastLog?.reps ?? null
  currentDistance.value = lastLog?.distance ?? null
  currentWeight.value = lastLog?.weight ?? null
  currentDuration.value = lastLog?.duration ?? null
})

function openWizard() {
  router.push('/wizard/fitness-goal')
}
</script>

<template>
  <ion-page>
    <ion-loading v-if="exerciseLogsStore.isLoading" is-open></ion-loading>
    <ion-menu content-id="content">
      <ion-header>
        <ion-toolbar>
          <ion-title>Menu</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-menu-toggle>
          <ion-button fill="clear" @click="() => openWizard()">
            Settings
            <ion-icon slot="start" :icon="settingsOutline" />
          </ion-button>
        </ion-menu-toggle>
      </ion-content>
    </ion-menu>

    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>Exercise Logs</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content ref="content" id="content">
      <ion-accordion-group :value="open" multiple>
        <ion-accordion v-for="[day, logs] in Object.entries(groupedLogs)" :key="day" :value="day">
          <ion-item slot="header">
            <ion-label>{{ day }}</ion-label>
          </ion-item>
          <ion-list slot="content" inset>
            <ion-item-sliding
              v-for="log in logs"
              :key="log.exercise_name + log.logged_at.getTime()"
            >
              <ion-item>
                <span slot="start">
                  <b>{{ log.exercise_name }}</b>
                </span>
                <span slot="end">
                  <ion-badge v-if="log.reps" class="ion-margin-end"> {{ log.reps }} x </ion-badge>
                  <ion-badge v-if="log.weight" class="ion-margin-end">
                    {{ formatNumberWithUnit(log.weight, 'kilogram') }}
                  </ion-badge>
                  <ion-badge v-if="log.distance" class="ion-margin-end">
                    {{ formatNumberWithUnit(log.distance, 'meter') }}
                  </ion-badge>
                  <ion-badge v-if="log.duration" class="ion-margin-end">
                    {{ formatNumberWithUnit(log.duration, 'minute') }}
                  </ion-badge>
                </span>
              </ion-item>
              <ion-item-options>
                <ion-item-option color="danger" @click="() => deleteLog(log)">
                  Delete
                </ion-item-option>
              </ion-item-options>
            </ion-item-sliding>
          </ion-list>
        </ion-accordion>
      </ion-accordion-group>
    </ion-content>

    <ion-footer>
      <ion-list inset class="ion-no-padding">
        <ion-list-header>
          <ion-label>Log Exercise</ion-label>
          <ion-button @click="() => logCurrentExercise()">
            Log
            <ion-icon slot="start" :icon="add"></ion-icon>
          </ion-button>
        </ion-list-header>

        <ion-item>
          <UiCombobox
            v-model="currentExerciseName"
            label="Exercise"
            :items="exercisesStore.exercises.map((exercise) => exercise.name)"
            @deleted="(exerciseName) => exercisesStore.removeExerciseByName(exerciseName)"
          />
        </ion-item>
        <ion-item>
          <ion-input
            v-model="currentReps"
            type="number"
            label="Reps"
            label-placement="fixed"
            clearInput
          />
        </ion-item>
        <ion-item>
          <ion-input
            v-model="currentWeight"
            type="number"
            :label="formatUnit('kilogram')"
            label-placement="fixed"
            clearInput
          />
        </ion-item>
        <ion-item>
          <ion-input
            v-model="currentDistance"
            type="number"
            :label="formatUnit('meter')"
            label-placement="fixed"
            clearInput
          />
        </ion-item>
        <ion-item>
          <ion-input
            v-model="currentDuration"
            type="number"
            :label="formatUnit('minute')"
            label-placement="fixed"
            clearInput
          />
        </ion-item>
      </ion-list>

      <ion-toolbar>
        <ion-buttons slot="start">
          <StopWatch />
        </ion-buttons>
        <ion-buttons slot="end">
          <AiFeedback />
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>
