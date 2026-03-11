<script setup lang="ts">
import {
  type DatetimeCustomEvent,
  IonButton,
  IonButtons,
  IonContent,
  IonDatetime,
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
import { ref } from "vue";
import { EVENT_PRESETS } from "@/types/event";

const modalRef = ref<InstanceType<typeof IonModal> | null>(null);

const selectedType = ref<string>(EVENT_PRESETS[0] ?? "Rest Day");
const customType = ref("");
const today = new Date().toISOString().split("T")[0] ?? "";
const selectedDates = ref<string[]>([today]);

const emit =
  defineEmits<(e: "saved", event: { id: string; type: string; dates: string[] }) => void>();

function handleDateChange(event: DatetimeCustomEvent) {
  const value = event.detail.value;
  if (Array.isArray(value)) {
    selectedDates.value = value;
  }
}

function open() {
  modalRef.value?.$el.present();
  // Reset fields
  selectedType.value = EVENT_PRESETS[0] ?? "Rest Day";
  customType.value = "";
  const resetDate = new Date().toISOString().split("T")[0] ?? "";
  selectedDates.value = [resetDate];
}

function close() {
  modalRef.value?.$el.dismiss();
}

function handleSave() {
  const type = selectedType.value === "Other" ? customType.value : selectedType.value;
  if (!type || selectedDates.value.length === 0) return; // Basic validation

  emit("saved", {
    id: crypto.randomUUID(),
    type,
    dates: selectedDates.value,
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
        <IonDatetime
          :value="selectedDates"
          @ionChange="handleDateChange"
          multiple
          presentation="date"
          :prefer-wheel="false"
        />
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
