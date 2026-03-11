<template>
  <ion-page>
    <ion-loading :is-open="exerciseLogsStore.isLoading" message="Loading logs..." />
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
        <ion-menu-toggle>
          <ion-button fill="clear" router-link="/events">
            Events
            <ion-icon slot="start" :icon="calendarOutline" />
          </ion-button>
        </ion-menu-toggle>
        <ion-menu-toggle>
          <ion-button
            fill="clear"
            :href="spreadsheetStore.spreadsheetUrl ?? undefined"
            target="_blank"
            :disabled="!spreadsheetStore.spreadsheetUrl"
          >
            Open Spreadsheet
            <ion-icon slot="start" :icon="openOutline" />
          </ion-button>
        </ion-menu-toggle>
        <ion-menu-toggle>
          <ion-button fill="clear" router-link="/privacy-policy">
            Datenschutzerklärung
            <ion-icon slot="start" :icon="documentTextOutline" />
          </ion-button>
        </ion-menu-toggle>
        <ion-menu-toggle>
          <ion-button fill="clear" router-link="/impressum">
            Impressum
            <ion-icon slot="start" :icon="informationCircleOutline" />
          </ion-button>
        </ion-menu-toggle>
      </ion-content>
    </ion-menu>

    <ion-header translucent>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button />
        </ion-buttons>
        <ion-title>Gainz AI</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content ref="content" id="content">
      <ion-card>
        <ion-card-content>
          <ConsistencyLevel />
          <AiFeedback />
        </ion-card-content>
      </ion-card>
      <ion-accordion-group :value="open" multiple class="logs-accordion-group">
        <ion-accordion v-for="[day, logs] in Object.entries(groupedLogs)" :key="day" :value="day">
          <ion-item slot="header">
            <ion-label color="medium">{{ day }}</ion-label>
          </ion-item>
          <ion-list slot="content">
            <ion-item-sliding v-for="log in logs" :key="log.exerciseName + log.loggedAt.getTime()">
              <ion-item>
                <ion-label>
                  {{ log.exerciseName }}
                </ion-label>
                <ion-note slot="end">
                  <span v-if="log.reps" class="ion-margin-start"> {{ log.reps }} x </span>
                  <span v-if="log.weight" class="ion-margin-start">
                    {{ formatNumberWithUnit(log.weight, "kilogram") }}
                  </span>
                  <span v-if="log.distance" class="ion-margin-start">
                    {{ formatNumberWithUnit(log.distance, "meter") }}
                  </span>
                  <span v-if="log.duration" class="ion-margin-start">
                    {{ formatNumberWithUnit(log.duration, "minute") }}
                  </span>
                </ion-note>
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

      <ion-modal ref="logModalRef" trigger="open-modal" :initial-breakpoint="0.5" :breakpoints="[0, 0.25, 0.5, 0.75]">
        <ion-fab  horizontal="end" vertical="top" class="fab-margin">
          <ion-fab-button color="light" translucent @click="() => logCurrentExercise()">
            <ion-icon :icon="add"></ion-icon>
          </ion-fab-button>
        </ion-fab>

        <ion-list class="ion-margin-top">
          <ion-list-header class="ion-margin-bottom">
            <ion-label>Log Exercise</ion-label>
          </ion-list-header>

          <ion-item>
            <UiCombobox
              v-model="currentExerciseName"
              label="Exercise:"
              :items="exercisesStore.exercises.map((exercise) => exercise.name)"
              @deleted="(exerciseName) => exercisesStore.removeExerciseByName(exerciseName)"
            />
          </ion-item>
          <ion-item>
            <UiNumberStepper
              v-model="currentReps"
              label="Reps:"
              :step="1"
              :min="0"
            />
          </ion-item>
          <ion-item>
            <UiNumberStepper
              v-model="currentWeight"
              :label="formatUnit('kilogram') + ':'"
              :step="0.5"
              :min="0"
            />
          </ion-item>
          <ion-item>
            <UiNumberStepper
              v-model="currentDistance"
              :label="formatUnit('meter') + ':'"
              :step="100"
              :min="0"
            />
          </ion-item>
          <ion-item>
            <UiNumberStepper
              v-model="currentDuration"
              :label="formatUnit('minute') + ':'"
              :step="0.5"
              :min="0"
            />
          </ion-item>
          <StopWatch />
        </ion-list>
      </ion-modal>

      <ion-fab horizontal="end" vertical="bottom" slot="fixed" class="fab-margin">
        <ion-fab-button id="open-modal" color="light" translucent>
          <ion-icon :icon="add"></ion-icon>
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import {
  IonAccordion,
  IonAccordionGroup,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonFab,
  IonFabButton,
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
  IonModal,
  IonNote,
  IonPage,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
import {
  add,
  calendarOutline,
  documentTextOutline,
  informationCircleOutline,
  openOutline,
  settingsOutline,
} from "ionicons/icons";
import { computed, onMounted, ref, useTemplateRef, watchEffect } from "vue";
import AiFeedback from "@/components/AiFeedback.vue";
import ConsistencyLevel from "@/components/ConsistencyLevel.vue";
import StopWatch from "@/components/StopWatch.vue";
import UiCombobox from "@/components/ui/UiCombobox.vue";
import UiNumberStepper from "@/components/ui/UiNumberStepper.vue";
import router from "@/router";
import type { ExerciseLog } from "@/services/exerciseLogs";
import { localeDateString } from "@/services/utils/date";
import { formatNumberWithUnit, formatUnit } from "@/services/utils/units";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";
import { useExercisesStore } from "@/stores/exercises";
import { useSpreadsheetStore } from "@/stores/spreadsheet";

const logModalRef = ref<InstanceType<typeof IonModal> | null>(null);
const contentRef = useTemplateRef("content");
const cacheAiFeedback = ref(false);
const open = ref([localeDateString(new Date())]);

const exercisesStore = useExercisesStore();
const exerciseLogsStore = useExerciseLogsStore();
const spreadsheetStore = useSpreadsheetStore();

const groupedLogs = computed(() =>
  exerciseLogsStore.exerciseLogs.reduce(
    (a, o) => {
      const day = localeDateString(o.loggedAt);
      a[day] = a[day] ? [...a[day], o] : [o];
      return a;
    },
    {} as Record<string, ExerciseLog[]>,
  ),
);

const currentExerciseName = ref<string | null>(null);
const currentReps = ref<number | null>(null);
const currentDistance = ref<number | null>(null);
const currentWeight = ref<number | null>(null);
const currentDuration = ref<number | null>(null);

function scrollBottom() {
  contentRef?.value?.$el.scrollToBottom(500);
}
async function logCurrentExercise() {
  if (!currentExerciseName.value) return;

  exercisesStore.addExercise({ name: currentExerciseName.value.trim() });
  const log = {
    id: crypto.randomUUID(),
    loggedAt: new Date(),
    exerciseName: currentExerciseName.value,
    reps: currentReps.value ?? undefined,
    weight: currentWeight.value ?? undefined,
    distance: currentDistance.value ?? undefined,
    duration: currentDuration.value ?? undefined,
  };
  exerciseLogsStore.addExerciseLog(log);
  cacheAiFeedback.value = false;

  // Haptic feedback for confirmation (wrapped in try-catch for iOS compatibility)
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch (error) {
    console.log("Haptics not available:", error);
  }

  // Close modal and scroll to show new entry
  await logModalRef.value?.$el.dismiss();

  setTimeout(() => scrollBottom(), 200);
}

function deleteLog(log: ExerciseLog) {
  exerciseLogsStore.removeExerciseLog(log);
}

onMounted(() => {
  setTimeout(() => scrollBottom(), 200);
});

watchEffect(() => {
  if (!currentExerciseName.value) return;
  const lastLog = exerciseLogsStore.lastLogForExercise(currentExerciseName.value);
  currentReps.value = lastLog?.reps ?? null;
  currentDistance.value = lastLog?.distance ?? null;
  currentWeight.value = lastLog?.weight ?? null;
  currentDuration.value = lastLog?.duration ?? null;
});

function openWizard() {
  router.push("/wizard/fitness-goal");
}
</script>

<style scoped>
  ion-list {
    --ion-item-background: transparent;
  }
  ion-modal {
    --border-radius: 40px;
  }
  .fab-margin {
    margin: 6px;
  }
  .logs-accordion-group {
    padding-bottom: 100px;
  }
</style>
