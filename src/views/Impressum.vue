<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/exercise-logs" />
        </ion-buttons>
        <ion-title>Impressum</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="impressum-content">
        <h1>Impressum</h1>

        <p><strong>Angaben gemäß § 5 TMG</strong></p>

        <pre>
Sabahattin Giritli
Am Kesselhaus 28
80999 München
Deutschland

E-Mail: app.gainz.ai@gmail.com
        </pre>

        <p><strong>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV:</strong></p>
        <p>Sabahattin Giritli, Am Kesselhaus 28, 80999 München</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from "@ionic/vue";
</script>

<style scoped>
.impressum-content {
  max-width: 800px;
  margin: 0 auto;
}
</style>
