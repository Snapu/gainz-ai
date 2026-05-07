import { createRouter, createWebHashHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useSpreadsheetStore } from "@/stores/spreadsheet";
import { useUserProfileStore } from "@/stores/userProfile";

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
  ],
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  const userProfileStore = useUserProfileStore();
  const spreadsheetStore = useSpreadsheetStore();

  console.log("[router] Guard triggered:", {
    to: to.path,
    isLoggedIn: authStore.isLoggedIn,
    hasDoc: !!spreadsheetStore.doc,
    isLoading: userProfileStore.isLoading,
    setupCompleted: userProfileStore.setupCompleted,
  });

  // 1. Public pages
  if (to.path === "/privacy" || to.path === "/impressum") {
    return true;
  }

  // 2. Auth check
  if (!authStore.isLoggedIn) {
    return to.path === "/" ? true : "/";
  }

  // 3. Loading check
  if (!spreadsheetStore.doc || userProfileStore.isLoading) {
    return to.path === "/loading" ? true : "/loading";
  }

  // 4. Setup check
  if (!userProfileStore.setupCompleted) {
    return to.path.startsWith("/wizard") ? true : "/wizard/fitness-goal";
  }

  // 5. Normal operation (logged in & setup completed)
  // If user tries to go to login, loading, or wizard (without edit mode), redirect to logs
  const isExcluded = ["/", "/loading"].includes(to.path);
  const isWizardWithoutEdit = to.path.startsWith("/wizard") && to.query.mode !== "edit";

  if (isExcluded || isWizardWithoutEdit) {
    return "/exercise-logs";
  }

  return true;
});

export default router;
