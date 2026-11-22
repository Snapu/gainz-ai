import * as Sentry from "@sentry/vue";

import { createPinia } from "pinia";
import { createApp } from "vue";
import vue3GoogleLogin from "vue3-google-login";

import App from "@/App.vue";

import router from "@/router";

/* Theme variables */
import "@/theme/variables.css";
import { CLIENT_ID } from "@/modules/auth/presentation";
import { purgeLegacyApiKeys } from "@/modules/profile/presentation";
import { scrubSentryEvent } from "@/sentryScrubber";
import { i18n } from "@/shared/presentation/i18n";

const PRELOAD_RELOAD_KEY = "gainz-preload-reload";
window.addEventListener("vite:preloadError", (event) => {
  try {
    if (!sessionStorage.getItem(PRELOAD_RELOAD_KEY)) {
      sessionStorage.setItem(PRELOAD_RELOAD_KEY, "1");
      event.preventDefault();
      window.location.reload();
    }
  } catch {
    // Ignore restricted sessionStorage; let Vite's error propagate
  }
});

purgeLegacyApiKeys();

const app = createApp(App).use(createPinia()).use(router).use(i18n).use(vue3GoogleLogin, {
  clientId: CLIENT_ID,
});

Sentry.init({
  app,
  dsn: "https://4d5bd61bc9b2ac0bdefc804ffe8abf31@o4510880320978944.ingest.de.sentry.io/4510880322617424",
  environment: import.meta.env.VITE_APP_ENV || import.meta.env.MODE,
  beforeSend(event) {
    return scrubSentryEvent(event);
  },
});

router.isReady().then(() => {
  app.mount("#app");
  try {
    sessionStorage.removeItem(PRELOAD_RELOAD_KEY);
  } catch {
    // Ignore restricted sessionStorage
  }
});
