import { createRouter, createWebHashHistory } from "vue-router";

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "login",
      component: () => import("../views/Login.vue"),
    },
    {
      path: "/loading",
      name: "loading",
      component: () => import("../views/Loading.vue"),
    },
    {
      path: "/wizard/:step?",
      name: "wizard",
      component: () => import("../views/wizard/WizardFlow.vue"),
    },
    {
      path: "/exercise-logs",
      name: "exercise-logs",
      component: () => import("../views/ExerciseLogs.vue"),
    },
    {
      path: "/rest-recovery",
      name: "rest-recovery",
      component: () => import("../views/RestRecovery.vue"),
    },
    {
      path: "/privacy",
      name: "privacy",
      component: () => import("../views/Legal.vue"),
      props: { type: "privacy" },
    },
    {
      path: "/impressum",
      name: "impressum",
      component: () => import("../views/Legal.vue"),
      props: { type: "impressum" },
    },
  ],
});

export default router;
