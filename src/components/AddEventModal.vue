<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonInput,
  IonItem,
  IonModal,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
import { usePreferredDark } from "@vueuse/core";
import { DatePicker } from "v-calendar";
import { EVENT_PRESETS } from "@/types/event";
import "v-calendar/style.css";
import { ref } from "vue";

const modalRef = ref<InstanceType<typeof IonModal> | null>(null);
const isDark = usePreferredDark();

const selectedType = ref<string>(EVENT_PRESETS[0] || "Rest Day");
const customType = ref("");
const dateRange = ref({
  start: new Date(),
  end: new Date(),
});

const emit =
  defineEmits<
    (e: "saved", event: { id: string; type: string; startDate: Date; endDate: Date }) => void
  >();

function open() {
  modalRef.value?.$el.present();
  // Reset fields
  selectedType.value = EVENT_PRESETS[0] || "Rest Day";
  customType.value = "";
  dateRange.value = {
    start: new Date(),
    end: new Date(),
  };
}

function close() {
  modalRef.value?.$el.dismiss();
}

function handleSave() {
  const type = selectedType.value === "Other" ? customType.value : selectedType.value;
  if (!type) return; // Basic validation

  emit("saved", {
    id: crypto.randomUUID(),
    type,
    startDate: dateRange.value.start,
    endDate: dateRange.value.end,
  });
  close();
}

defineExpose({ open });
</script>

<template>
  <ion-modal ref="modalRef">
    <ion-header>
      <ion-toolbar>
        <ion-title>Add Event</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="close">Cancel</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-item>
        <ion-select label="Event Type" label-placement="floating" v-model="selectedType">
          <ion-select-option v-for="preset in EVENT_PRESETS" :key="preset" :value="preset">
            {{ preset }}
          </ion-select-option>
          <ion-select-option value="Other">Other</ion-select-option>
        </ion-select>
      </ion-item>

      <ion-item v-if="selectedType === 'Other'">
        <ion-input label="Custom Type" label-placement="floating" v-model="customType" placeholder="Enter event type"></ion-input>
      </ion-item>

      <div class="calendar-container ion-margin-top">
        <DatePicker v-model.range="dateRange" mode="date" :is-dark="isDark" expanded />
      </div>
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-button expand="block" @click="handleSave" class="ion-margin">Save</ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-modal>
</template>

<style scoped>
.calendar-container {
  display: flex;
  justify-content: center;
}
</style>
