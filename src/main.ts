import { createApp, watch } from 'vue'

import { createPinia } from 'pinia'

import { IonicVue } from '@ionic/vue'

import App from '@/App.vue'

import router from '@/router'

/* Core CSS required for Ionic components to work properly */
import '@ionic/vue/css/core.css'

/* Basic CSS for apps built with Ionic */
import '@ionic/vue/css/normalize.css'
import '@ionic/vue/css/structure.css'
import '@ionic/vue/css/typography.css'

/* Optional CSS utils that can be commented out */
import '@ionic/vue/css/padding.css'
import '@ionic/vue/css/float-elements.css'
import '@ionic/vue/css/text-alignment.css'
import '@ionic/vue/css/text-transformation.css'
import '@ionic/vue/css/flex-utils.css'
import '@ionic/vue/css/display.css'

/**
 * Ionic Dark Mode
 * -----------------------------------------------------
 * For more info, please see:
 * https://ionicframework.com/docs/theming/dark-mode
 */

/* @import '@ionic/vue/css/palettes/dark.always.css'; */
/* @import '@ionic/vue/css/palettes/dark.class.css'; */
import '@ionic/vue/css/palettes/dark.system.css'

/* Theme variables */
import '@/theme/variables.css'
import { useAuthStore } from './stores/auth'
import { useUserProfileStore } from './stores/userProfile'
import { useSpreadsheetStore } from './stores/spreadsheet'

const app = createApp(App).use(IonicVue).use(createPinia()).use(router)

router.isReady().then(() => {
  app.mount('#app')
})

const authStore = useAuthStore()
const userProfileStore = useUserProfileStore()
const spreadsheetStore = useSpreadsheetStore()

watch(
  [() => authStore.isLoggedIn, () => spreadsheetStore.doc],
  ([isLoggedIn, doc]) => {
    if (!isLoggedIn) {
      router.push('/')
    } else if (!userProfileStore.setupCompleted) {
      router.push('/wizard/fitness-goal')
    } else if (!doc) {
      router.push('/spreadsheet-init')
    } else {
      router.push('/exercise-logs')
    }
  },
  { immediate: true },
)
