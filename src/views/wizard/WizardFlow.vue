<script setup lang="ts">
import { ArrowLeft, Check } from "@lucide/vue";
import { useStepper } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { FitnessGoal, FitnessLevel, WorkoutLocation } from "@/modules/profile/presentation";
import {
  EquipmentSelector,
  useUserProfileStore,
  WIZARD_STEPS,
} from "@/modules/profile/presentation";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiNumberField from "@/shared/presentation/components/ui/UiNumberField.vue";
import UiTextarea from "@/shared/presentation/components/ui/UiTextarea.vue";
import UiToggleGroup from "@/shared/presentation/components/ui/UiToggleGroup.vue";
import UiToggleGroupItem from "@/shared/presentation/components/ui/UiToggleGroupItem.vue";

const router = useRouter();
const route = useRoute();
const profileStore = useUserProfileStore();
const { userProfile } = storeToRefs(profileStore);

const isEditMode = computed(() => route.query.mode === "edit");

const fitnessGoalLabels: [string, FitnessGoal][] = [
  ["Build muscle", "build_muscle"],
  ["Lose fat", "lose_fat"],
  ["Improve endurance", "improve_endurance"],
  ["Increase mobility", "increase_mobility"],
  ["General fitness", "general_fitness"],
];

const fitnessLevelLabels: [string, FitnessLevel][] = [
  ["Beginner", "beginner"],
  ["Intermediate", "intermediate"],
  ["Advanced", "advanced"],
];

const workoutDaysPerWeekLabels: [string, number][] = [
  ["2", 2],
  ["3", 3],
  ["4", 4],
  ["5+", 5],
];

const workoutLocationLabels: [string, WorkoutLocation][] = [
  ["Gym", "gym"],
  ["Home", "home"],
  ["Both", "both"],
];

const workoutDaysString = computed<string | undefined>({
  get: () =>
    userProfile.value.workoutDaysPerWeek ? String(userProfile.value.workoutDaysPerWeek) : "",
  set: (val: string | undefined) => {
    userProfile.value.workoutDaysPerWeek = !val ? undefined : Number(val);
  },
});

const workoutDurationLabels: [string, number][] = [
  ["30 min", 30],
  ["45 min", 45],
  ["60 min", 60],
  ["90 min", 90],
];

const workoutDurationString = computed<string | undefined>({
  get: () =>
    userProfile.value.workoutDurationMinutes
      ? String(userProfile.value.workoutDurationMinutes)
      : "",
  set: (val: string | undefined) => {
    userProfile.value.workoutDurationMinutes = !val ? undefined : Number(val);
  },
});

const stepper = useStepper(
  WIZARD_STEPS.reduce(
    (acc, step) => {
      acc[step.id] = { title: step.title };
      return acc;
    },
    {} as Record<string, { title: string }>,
  ),
);

// SYNC: URL -> Stepper (Initial & Changes)
watch(
  () => route.params.step,
  (newStep) => {
    if (newStep && WIZARD_STEPS.some((s) => s.id === newStep)) {
      stepper.goTo(newStep as string);
    }
  },
  { immediate: true },
);

// SYNC: Stepper -> URL
watch(stepper.index, (newIndex) => {
  const newStep = WIZARD_STEPS[newIndex];
  if (newStep && newStep.id !== route.params.step) {
    router.replace({
      params: { step: newStep.id },
      query: route.query,
    });
  }
});

const stepsArray = computed(() => Object.keys(stepper.steps.value));
const totalSteps = computed(() => stepsArray.value.length);
const currentStepIndex = stepper.index;

function handleNext() {
  if (stepper.isLast.value) {
    // If we're on the last step, mark as complete and route to logs
    profileStore.hasCompletedSetup = true;
    router.push("/app/home");
  } else {
    stepper.goToNext();
  }
}

const currentStepTitle = computed(() => stepper.current.value?.title ?? "Edit Profile");

function handleBack() {
  if (stepper.isFirst.value) {
    // Cannot go back further from step 1 in the wizard
  } else {
    stepper.goToPrevious();
  }
}

function skipWizard() {
  profileStore.hasCompletedSetup = true;
  router.push("/app/home");
}
</script>

<template>
  <div class="h-full bg-background flex flex-col pt-safe overflow-hidden">
    <!-- Header -->
    <AppHeader
      v-if="isEditMode"
      show-back
      :title="currentStepTitle"
      class="shrink-0"
      @back="router.back()"
    />
    <AppHeader v-else class="shrink-0 border-b-0">
      <!-- Left: Back Button -->
      <UiButton
        v-if="!stepper.isFirst.value"
        variant="ghost"
        size="icon"
        class="-ml-1 shrink-0"
        aria-label="Back"
        @click="handleBack"
      >
        <ArrowLeft class="w-5 h-5" />
      </UiButton>
      <div v-else class="w-9 h-9 shrink-0"></div>

      <!-- Center: Progress -->
      <div class="flex gap-2 items-center mx-auto flex-1 justify-center max-w-[200px]">
        <div
          v-for="idx in totalSteps"
          :key="idx"
          class="h-1.5 flex-1 rounded-full transition-all duration-300"
          :class="[
            idx - 1 <= currentStepIndex
              ? 'bg-primary shadow-[0_0_8px_rgba(204,255,0,0.5)]'
              : 'bg-white/10',
          ]"
        ></div>
      </div>

      <!-- Right: Skip -->
      <template #actions>
        <UiButton
          variant="ghost"
          class="text-primary font-semibold tracking-wide"
          @click="skipWizard"
        >
          Skip
        </UiButton>
      </template>
    </AppHeader>

    <!-- Content Area -->
    <main class="flex-1 overflow-y-auto overscroll-y-contain px-6 pb-32 flex flex-col mt-4">
      <div class="flex-1 animate-in fade-in slide-in-from-right-4 duration-300" :key="currentStepIndex">
        <!-- Goal -->
        <template v-if="stepper.isCurrent('goal')">
          <h2 class="text-3xl font-bold mb-2 tracking-tight">What's your primary goal?</h2>
          <p class="text-muted-foreground mb-10 text-lg">Select all that apply.</p>
          <UiToggleGroup type="multiple" v-model="userProfile.fitnessGoal">
            <UiToggleGroupItem v-for="[label, value] in fitnessGoalLabels" :key="value" :value="value">
              {{ label }}
            </UiToggleGroupItem>
          </UiToggleGroup>
        </template>

        <!-- Level -->
        <template v-else-if="stepper.isCurrent('level')">
          <h2 class="text-3xl font-bold mb-2 tracking-tight">Experience level</h2>
          <p class="text-muted-foreground mb-10 text-lg">How long have you been training?</p>
          <UiToggleGroup type="single" v-model="userProfile.fitnessLevel">
            <UiToggleGroupItem v-for="[label, value] in fitnessLevelLabels" :key="value" :value="value">
              {{ label }}
            </UiToggleGroupItem>
          </UiToggleGroup>
        </template>

        <!-- Days -->
        <template v-else-if="stepper.isCurrent('days')">
          <h2 class="text-3xl font-bold mb-2 tracking-tight">Training frequency</h2>
          <p class="text-muted-foreground mb-10 text-lg">Workouts per week</p>
          <UiToggleGroup type="single" v-model="workoutDaysString" class="grid grid-cols-2">
            <UiToggleGroupItem v-for="[label, value] in workoutDaysPerWeekLabels" :key="value" :value="String(value)" class="justify-center h-20 text-xl font-bold">
              {{ label }}
            </UiToggleGroupItem>
          </UiToggleGroup>
        </template>

        <!-- Duration -->
        <template v-else-if="stepper.isCurrent('duration')">
          <h2 class="text-3xl font-bold mb-2 tracking-tight">Session length</h2>
          <p class="text-muted-foreground mb-10 text-lg">How long do you usually train?</p>
          <UiToggleGroup type="single" v-model="workoutDurationString" class="grid grid-cols-2">
            <UiToggleGroupItem v-for="[label, value] in workoutDurationLabels" :key="value" :value="String(value)" class="justify-center h-20 text-xl font-bold">
              {{ label }}
            </UiToggleGroupItem>
          </UiToggleGroup>
        </template>

        <!-- Location -->
        <template v-else-if="stepper.isCurrent('location')">
          <h2 class="text-3xl font-bold mb-2 tracking-tight">Where do you train?</h2>
          <p class="text-muted-foreground mb-10 text-lg">Sets your equipment baseline.</p>
          <UiToggleGroup type="single" v-model="userProfile.workoutLocation">
            <UiToggleGroupItem v-for="[label, value] in workoutLocationLabels" :key="value" :value="value">
              {{ label }}
            </UiToggleGroupItem>
          </UiToggleGroup>
        </template>

        <!-- Equipment -->
        <template v-else-if="stepper.isCurrent('equipment')">
          <h2 class="text-3xl font-bold mb-2 tracking-tight">Equipment access</h2>
          <p class="text-muted-foreground mb-10 text-lg">Select presets or add your own.</p>
          <EquipmentSelector v-model="userProfile.equipmentAccess" />
        </template>

        <!-- Body Stats -->
        <template v-else-if="stepper.isCurrent('stats')">
          <h2 class="text-3xl font-bold mb-2 tracking-tight">Body Stats</h2>
          <p class="text-muted-foreground mb-10 text-lg">Optional, helps the AI format plans.</p>
          <div class="space-y-6">
            <UiNumberField v-model="userProfile.age" label="Age" :min="10" :max="120" />
            <UiNumberField v-model="userProfile.heightCm" label="Height (cm)" :min="50" :max="300" />
            <UiNumberField v-model="userProfile.weightKg" label="Weight (kg)" :min="20" :max="300" :step="0.5" />
          </div>
        </template>

        <!-- Free Input -->
        <template v-else-if="stepper.isCurrent('extra')">
          <h2 class="text-3xl font-bold mb-2 tracking-tight">Additional Context</h2>
          <p class="text-muted-foreground mb-10 text-lg">Any injuries, specific focus areas, or limitations?</p>
          <UiTextarea
            v-model="userProfile.freeUserInput"
            auto-resize
            placeholder="e.g. Bad left knee, want to focus on explosive strength..."
            class="min-h-[160px] overflow-hidden"
          />
        </template>

      </div>
    </main>

    <!-- Bottom Action -->
    <div v-if="!isEditMode" class="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent pb-safe">
      <UiButton
        class="w-full h-16 rounded-xl text-lg font-bold tracking-wide transition-all data-[state=save]:bg-white data-[state=save]:text-black"
        :data-state="stepper.isLast.value ? 'save' : 'next'"
        @click="handleNext"
      >
        <span v-if="!stepper.isLast.value">Continue</span>
        <div v-else class="flex items-center gap-2">
          Finish Setup <Check class="w-5 h-5" />
        </div>
      </UiButton>
    </div>
  </div>
</template>
