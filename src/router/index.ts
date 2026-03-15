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
  ],
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  const userProfileStore = useUserProfileStore();
  const spreadsheetStore = useSpreadsheetStore();

  const isLoggedIn = authStore.isLoggedIn;
  const hasDoc = !!spreadsheetStore.doc;
  const isLoading = userProfileStore.isLoading;
  const setupCompleted = userProfileStore.setupCompleted;

  console.log("[router] Guard triggered:", {
    to: to.path,
    isLoggedIn,
    hasDoc,
    isLoading,
    setupCompleted,
  });

  // Public pages
  if (to.path === "/privacy" || to.path === "/impressum") {
    return true;
  }

  if (!isLoggedIn) {
    if (to.path !== "/") return "/";
    return true;
  }

  if (!hasDoc || isLoading) {
    if (to.path !== "/loading") return "/loading";
    return true;
  }

  if (!setupCompleted) {
    if (!to.path.startsWith("/wizard")) return "/wizard/fitness-goal";
    return true;
  }

  // If logged in and setup completed, don't allow going back to login or loading or wizard
  if (to.path === "/" || to.path === "/loading" || to.path.startsWith("/wizard")) {
    return "/exercise-logs";
  }

  return true;
});

export default router;
