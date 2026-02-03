import { createRouter, createWebHistory } from "@ionic/vue-router";
import type { RouteRecordRaw } from "vue-router";
import ExerciseLogs from "@/views/ExerciseLogs.vue";
import LoginPage from "@/views/LoginPage.vue";
import SpreadsheetInit from "@/views/SpreadsheetInit.vue";
import WizardApiKey from "@/views/wizard/ApiKey.vue";
import WizardBodyStats from "@/views/wizard/BodyStats.vue";
import WizardEquipmentOption from "@/views/wizard/EquipmentOption.vue";
import WizardFitnessGoal from "@/views/wizard/FitnessGoal.vue";
import WizardFitnessLevel from "@/views/wizard/FitnessLevel.vue";
import WizardFreeInput from "@/views/wizard/FreeInput.vue";
import WizardIntro from "@/views/wizard/SetupIntro.vue";
import WizardWorkoutDaysPerWeek from "@/views/wizard/WorkoutDaysPerWeek.vue";
import WizardWorkoutLocation from "@/views/wizard/WorkoutLocation.vue";

const routes: Array<RouteRecordRaw> = [
  {
    path: "/",
    name: "Login",
    component: LoginPage,
  },
  {
    path: "/spreadsheet-init",
    name: "spreadsheetInit",
    component: SpreadsheetInit,
  },
  {
    path: "/wizard",
    name: "WizardIntro",
    component: WizardIntro,
  },
  {
    path: "/wizard",
    name: "WizardIntro",
    component: WizardIntro,
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
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
