import * as Sentry from "@sentry/vue";

import { createPinia } from "pinia";
import { createApp } from "vue";
import vue3GoogleLogin from "vue3-google-login";

import App from "@/App.vue";

import router from "@/router";

/* Theme variables */
import "@/theme/variables.css";
import { CLIENT_ID } from "./stores/auth";

const app = createApp(App).use(createPinia()).use(router).use(vue3GoogleLogin, {
  clientId: CLIENT_ID,
});

Sentry.init({
  app,
  dsn: "https://4d5bd61bc9b2ac0bdefc804ffe8abf31@o4510880320978944.ingest.de.sentry.io/4510880322617424",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: false,
});

router.isReady().then(() => {
  app.mount("#app");
});
