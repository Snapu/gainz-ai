<template>
  <ion-input
    v-model="model"
    :label="props.label"
    label-placement="fixed"
    clear-input
    @ion-focus="onFocus"
  />

  <ion-modal ref="modalRef">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ props.label }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="() => close()">
            <ion-icon slot="icon-only" :icon="closeOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar ref="searchbarRef" @ion-input="onSearchInput" @ion-change="onSearchChange" />
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list inset>
        <ion-item-sliding v-for="item in filteredItems" :key="item">
          <ion-item @click="() => selectItem(item)">
            {{ item }}
          </ion-item>
          <ion-item-options>
            <ion-item-option color="danger" @click="() => deleteItem(item)">Delete</ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </ion-list>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonList,
  IonModal,
  IonSearchbar,
  IonTitle,
  IonToolbar,
  type SearchbarCustomEvent,
} from "@ionic/vue";

import { closeOutline } from "ionicons/icons";
import { ref, watchEffect } from "vue";

interface Props {
  items: string[];
  label: string;
}

const props = defineProps<Props>();
const model = defineModel<string | null>();
const emit = defineEmits(["deleted", "selected"]);

const modalRef = ref<InstanceType<typeof IonModal> | null>(null);
const searchbarRef = ref<InstanceType<typeof IonSearchbar> | null>(null);

const searchQuery = ref("");
const filteredItems = ref<string[]>([...props.items]);
const recentlyClosed = ref(false);

watchEffect(() => {
  const normalized = searchQuery.value.trim().toLowerCase();
  const allItems = props.items;

  if (!normalized) {
    filteredItems.value = [...allItems];
  } else {
    const matches = allItems.filter((item) => item.toLowerCase().includes(normalized));

    const hasExactMatch = allItems.some((item) => item.toLowerCase() === normalized);

    filteredItems.value = hasExactMatch ? matches : [...matches, searchQuery.value];
  }
});

function open() {
  modalRef.value?.$el.present();
  searchQuery.value = "";
  recentlyClosed.value = false;
  setTimeout(() => searchbarRef.value?.$el.setFocus(), 200);
}

function close() {
  recentlyClosed.value = true;
  modalRef.value?.$el.dismiss();
}

function selectItem(item: string) {
  model.value = item;
  emit("selected", item);
  close();
}

function deleteItem(item: string) {
  emit("deleted", item);
}

function onSearchInput(event: SearchbarCustomEvent) {
  searchQuery.value = event.target.value ?? "";
}
function onSearchChange(event: SearchbarCustomEvent) {
  if (event.target.value) selectItem(event.target.value);
}
function onFocus(event: CustomEvent) {
  if (recentlyClosed.value) {
    event.detail.target.blur();
    recentlyClosed.value = false;
    return;
  }
  open();
}
</script>

<style scoped>
  ion-list {
    --ion-item-background: transparent;
  }
</style>
