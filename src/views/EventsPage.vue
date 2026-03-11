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
        <IonDatetime
          :highlighted-dates="highlightedDates"
          presentation="date"
          :prefer-wheel="false"
          readonly
        />
      </div>

      <ion-list>
        <ion-item-sliding v-for="event in eventsStore.events" :key="event.id">
          <ion-item>
            <ion-label>
              <h2>{{ event.type }}</h2>
              <p>{{ formatDates(event.dates) }}</p>
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
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonDatetime,
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
import { computed, ref } from "vue";
import AddEventModal from "@/components/AddEventModal.vue";
import { useEventsStore } from "@/stores/events";

const eventsStore = useEventsStore();
const addModalRef = ref<InstanceType<typeof AddEventModal> | null>(null);

const highlightedDates = computed(() => {
  const dates: { date: string; textColor: string; backgroundColor: string }[] = [];
  for (const event of eventsStore.events) {
    if (!Array.isArray(event.dates)) {
      console.warn("Event has invalid dates array:", event);
      continue;
    }
    for (const date of event.dates) {
      dates.push({
        date,
        textColor: "#fff",
        backgroundColor: "var(--ion-color-primary)",
      });
    }
  }
  return dates;
});

function formatDates(dates: string[]): string {
  if (!Array.isArray(dates) || dates.length === 0) return "";
  if (dates.length === 1) {
    const date = dates[0];
    if (!date) return "";
    return new Date(date).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  if (dates.length <= 3) {
    return dates
      .filter((d): d is string => !!d)
      .map((d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }))
      .join(", ");
  }
  return `${dates.length} days`;
}

function openAddModal() {
  addModalRef.value?.open();
}

function handleSaved(event: { id: string; type: string; dates: string[] }) {
  eventsStore.addEvent(event);
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
