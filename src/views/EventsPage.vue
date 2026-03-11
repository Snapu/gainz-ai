<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/exercise-logs" />
        </ion-buttons>
        <ion-title>Events</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="calendar-container ion-margin-bottom">
        <Calendar :attributes="attributes" expanded />
      </div>

      <ion-list>
        <ion-item-sliding v-for="event in eventsStore.events" :key="event.id">
          <ion-item>
            <ion-label>
              <h2>{{ event.type }}</h2>
              <p>
                {{ new Date(event.startDate).toLocaleDateString() }} -
                {{ new Date(event.endDate).toLocaleDateString() }}
              </p>
            </ion-label>
          </ion-item>
          <ion-item-options side="end">
            <ion-item-option color="danger" @click="handleDelete(event.id)">
              Delete
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </ion-list>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button @click="openAddModal">
          <ion-icon :icon="addOutline" />
        </ion-fab-button>
      </ion-fab>

      <AddEventModal ref="addModalRef" @saved="handleSaved" />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import AddEventModal from "@/components/AddEventModal.vue";
import { useEventsStore } from "@/stores/events";
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonPage,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
import { addOutline } from "ionicons/icons";
import { Calendar } from "v-calendar";
import "v-calendar/style.css";
import { computed, ref } from "vue";

const eventsStore = useEventsStore();
const addModalRef = ref<InstanceType<typeof AddEventModal> | null>(null);

const attributes = computed(() =>
  eventsStore.events.map((event) => ({
    key: event.id,
    highlight: {
      color: "blue",
      fillMode: "light" as const,
    },
    dates: [
      {
        start: new Date(event.startDate),
        end: new Date(event.endDate),
      },
    ],
    popover: {
      label: event.type,
    },
  })),
);

function openAddModal() {
  addModalRef.value?.open();
}

function handleSaved(event: {
  id: string;
  type: string;
  startDate: Date;
  endDate: Date;
}) {
  eventsStore.addEvent({
    ...event,
    startDate: event.startDate.toISOString(),
    endDate: event.endDate.toISOString(),
  });
}

function handleDelete(id: string) {
  eventsStore.removeEvent(id);
}
</script>

<style scoped>
.calendar-container {
  display: flex;
  justify-content: center;
}
</style>
