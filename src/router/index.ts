import { createRouter, createWebHashHistory } from "vue-router";
import { useAuthStore } from "@/modules/auth/presentation";
import { useSpreadsheetStore } from "@/modules/platform/presentation";
import { useUserProfileStore } from "@/modules/profile/presentation";
import { useLegalConsent } from "@/shared/presentation/composables/useLegalConsent";
import { isPublicRoute, resolveRouteTarget } from "./routePolicy";

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
      path: "/consent",
      name: "consent",
      component: () => import("../views/ConsentView.vue"),
    },
    {
      path: "/wizard/:step?",
      name: "wizard",
      component: () => import("../views/wizard/WizardFlow.vue"),
    },
    {
      path: "/app",
      component: () => import("../shared/presentation/components/AppLayout.vue"),
      redirect: { name: "home" },
      children: [
        {
          path: "home",
          name: "home",
          component: () => import("../views/HomeTab.vue"),
        },
        {
          path: "insights",
          name: "insights",
          component: () => import("../views/InsightsTab.vue"),
        },
        {
          path: "plan",
          name: "plan",
          component: () => import("../views/PlanTab.vue"),
        },
        {
          path: "coach",
          name: "coach",
          component: () => import("../views/CoachTab.vue"),
        },
      ],
    },
    {
      path: "/rest-recovery",
      name: "rest-recovery",
      component: () => import("../views/RestRecovery.vue"),
    },
    {
      path: "/past-sessions",
      name: "past-sessions",
      component: () => import("../views/PastSessions.vue"),
    },
    {
      path: "/privacy",
      name: "privacy",
      component: () => import("../views/PrivacyPolicy.vue"),
    },
    {
      path: "/terms",
      name: "terms",
      component: () => import("../views/TermsOfUse.vue"),
    },
    {
      path: "/impressum",
      name: "impressum",
      component: () => import("../views/Impressum.vue"),
    },
    {
      path: "/exercise-logs",
      redirect: "/app/home",
    },
    {
      path: "/training-insights",
      redirect: "/app/insights",
    },
    {
      path: "/ai-coach",
      redirect: "/app/coach",
    },
  ],
});

router.beforeEach(async (to) => {
  if (isPublicRoute(to.path)) {
    return true;
  }

  const authStore = useAuthStore();
  await authStore.init();
  const hasConsent = useLegalConsent().hasLegalConsent.value;

  if (!authStore.isLoggedIn || !hasConsent) {
    return resolveRouteTarget(to.path, to.query, {
      isLoggedIn: authStore.isLoggedIn,
      hasConsent,
      hasDoc: false,
      isLoading: false,
      setupCompleted: false,
    });
  }

  const userProfileStore = useUserProfileStore();
  const spreadsheetStore = useSpreadsheetStore();

  return resolveRouteTarget(to.path, to.query, {
    isLoggedIn: authStore.isLoggedIn,
    hasConsent,
    hasDoc: !!spreadsheetStore.doc,
    isLoading: userProfileStore.isLoading,
    setupCompleted: userProfileStore.setupCompleted,
  });
});

export default router;
