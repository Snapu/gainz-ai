import { createRouter, createWebHashHistory } from "vue-router";
import { useAuthStore } from "@/modules/auth/presentation";
import { useSpreadsheetStore } from "@/modules/platform/presentation";
import { useUserProfileStore } from "@/modules/profile/presentation";
import { resolveRouteTarget } from "./routePolicy";

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
      path: "/exercise-migration",
      name: "exercise-migration",
      component: () => import("../views/ExerciseMigration.vue"),
    },
    {
      path: "/rest-recovery",
      name: "rest-recovery",
      component: () => import("../views/RestRecovery.vue"),
    },
    {
      path: "/privacy",
      name: "privacy",
      component: () => import("../views/PrivacyPolicy.vue"),
    },
    {
      path: "/impressum",
      name: "impressum",
      component: () => import("../views/Impressum.vue"),
    },
    {
      path: "/training-insights",
      name: "training-insights",
      component: () => import("../views/TrainingInsights.vue"),
    },
    {
      path: "/ai-coach",
      name: "ai-coach",
      component: () => import("../views/AICoach.vue"),
    },
  ],
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  const userProfileStore = useUserProfileStore();
  const spreadsheetStore = useSpreadsheetStore();

  return resolveRouteTarget(to.path, to.query, {
    isLoggedIn: authStore.isLoggedIn,
    hasDoc: !!spreadsheetStore.doc,
    isLoading: userProfileStore.isLoading,
    setupCompleted: userProfileStore.setupCompleted,
  });
});

export default router;
