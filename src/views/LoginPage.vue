<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Login</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="ion-padding-horizontal">
        <h1>AI Personal Trainer</h1>
        <p>Sign in via magic link with your email below</p>
      </div>
      <ion-list inset>
        <form @submit.prevent="handleLogin">
          <ion-item>
            <ion-input
              v-model="email"
              label="Email"
              label-placement="floating"
              autocomplete="email"
              type="email"
              autofocus
            ></ion-input>
          </ion-item>
          <div class="ion-text-center">
            <ion-button type="submit" fill="clear">Login</ion-button>
          </div>
        </form>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue'

import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonPage,
  IonTitle,
  IonToolbar,
  loadingController,
  toastController,
} from '@ionic/vue'

import { supabase } from '../supabase'

export default defineComponent({
  name: 'LoginPage',
  components: {
    IonContent,
    IonHeader,
    IonPage,
    IonTitle,
    IonToolbar,
    IonList,
    IonItem,
    IonInput,
    IonButton,
  },
  setup() {
    const email = ref('')
    const handleLogin = async () => {
      const loader = await loadingController.create({})
      const toast = await toastController.create({ duration: 5000 })

      try {
        await loader.present()
        const { error } = await supabase.auth.signInWithOtp({ email: email.value })

        if (error) throw error

        toast.message = 'Check your email for the login link!'
        await toast.present()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        toast.message = error.error_description || error.message
        await toast.present()
      } finally {
        await loader.dismiss()
      }
    }
    return { handleLogin, email }
  },
})
</script>
