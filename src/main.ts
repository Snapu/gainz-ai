import { createApp } from 'vue'

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

import { supabase } from '@/supabase'
import { useUserProfileStore } from '@/stores/userProfile'

const app = createApp(App).use(IonicVue).use(createPinia()).use(router)

router.isReady().then(() => {
  app.mount('#app')
})

supabase.auth.onAuthStateChange((event, session) => {
  console.debug(event, session)
  if (session === null || event === 'SIGNED_OUT') {
    router.push('/')
  } else if (event === 'INITIAL_SESSION') {
    const { setupCompleted } = useUserProfileStore()
    if (!setupCompleted) {
      router.push('/wizard/fitness-goal')
    } else {
      router.push('/exercise-logs')
    }
  }
})
