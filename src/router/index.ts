import { createRouter, createWebHashHistory } from "@ionic/vue-router";
import type { RouteRecordRaw } from "vue-router";
import ExerciseLogs from "@/views/ExerciseLogs.vue";
import Impressum from "@/views/Impressum.vue";
import LoginPage from "@/views/LoginPage.vue";
import PrivacyPolicy from "@/views/PrivacyPolicy.vue";
import WizardApiKey from "@/views/wizard/ApiKey.vue";
import WizardBodyStats from "@/views/wizard/BodyStats.vue";
import WizardEquipmentOption from "@/views/wizard/EquipmentOption.vue";
import WizardFitnessGoal from "@/views/wizard/FitnessGoal.vue";
import WizardFitnessLevel from "@/views/wizard/FitnessLevel.vue";
import WizardFreeInput from "@/views/wizard/FreeInput.vue";
import WizardWorkoutDaysPerWeek from "@/views/wizard/WorkoutDaysPerWeek.vue";
import WizardWorkoutLocation from "@/views/wizard/WorkoutLocation.vue";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "Login",
    component: LoginPage,
  },
  {
    path: "/wizard/fitness-goal",
    name: "WizardFitnessGoal",
    component: WizardFitnessGoal,
  },
  {
    path: "/wizard/fitness-level",
    name: "WizardFitnessLevel",
    component: WizardFitnessLevel,
  },
  {
    path: "/wizard/workout-days-per-week",
    name: "WizardWorkoutDaysPerWeek",
    component: WizardWorkoutDaysPerWeek,
  },
  {
    path: "/wizard/workout-location",
    name: "WizardWorkoutLocation",
    component: WizardWorkoutLocation,
  },
  {
    path: "/wizard/equipment-option",
    name: "WizardEquipmentOption",
    component: WizardEquipmentOption,
  },
  {
    path: "/wizard/body-stats",
    name: "WizardBodyStats",
    component: WizardBodyStats,
  },
  {
    path: "/wizard/free-input",
    name: "WizardFreeInput",
    component: WizardFreeInput,
  },
  {
    path: "/wizard/api-key",
    name: "WizardApiKey",
    component: WizardApiKey,
  },
  {
    path: "/exercise-logs",
    name: "ExerciseLogs",
    component: ExerciseLogs,
  },
  {
    path: "/privacy-policy",
    name: "PrivacyPolicy",
    component: PrivacyPolicy,
  },
  {
    path: "/impressum",
    name: "Impressum",
    component: Impressum,
  },
  {
    path: "/events",
    name: "Events",
    component: () => import("@/views/EventsPage.vue"),
  },
];

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
