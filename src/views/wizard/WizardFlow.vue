<script setup lang="ts">
import { useStepper } from "@vueuse/core";
import { ArrowLeft, Check, Sparkles } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useRouter } from "vue-router";
import Button from "@/components/ui/Button.vue";
import Input from "@/components/ui/Input.vue";
import NumberField from "@/components/ui/NumberField.vue";
import ToggleGroup from "@/components/ui/ToggleGroup.vue";
import ToggleGroupItem from "@/components/ui/ToggleGroupItem.vue";
import type {
  EquipmentOption,
  FitnessGoal,
  FitnessLevel,
  WorkoutLocation,
} from "@/stores/userProfile";
import { useUserProfileStore } from "@/stores/userProfile";

const router = useRouter();
const profileStore = useUserProfileStore();
const { userProfile, apiKey } = storeToRefs(profileStore);

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

const equipmentOptionLabels: [string, EquipmentOption][] = [
  ["Bodyweight only", "bodyweight"],
  ["Resistance bands", "resistance_bands"],
  ["Suspension trainer (e.g. TRX)", "suspension_trainer"],
  ["Gymnastic rings", "gymnastic_rings"],
  ["Pull-up bar", "pull_up_bar"],
  ["Dip bar", "dip_bar"],
  ["Dumbbells", "dumbbells"],
  ["Kettlebells", "kettlebells"],
  ["Barbell & rack", "barbell_rack"],
  ["Bench", "bench"],
  ["Cable machine", "cable_machine"],
  ["Cardio machines", "cardio_machine"],
  ["Medicine ball", "medicine_ball"],
];

const apiKeyString = computed({
  get: () => apiKey.value || "",
  set: (val: string) => {
    apiKey.value = val || null;
  },
});

const workoutDaysString = computed({
  get: () => (userProfile.value.workoutDaysPerWeek ? String(userProfile.value.workoutDaysPerWeek) : ""),
  set: (val: string) => {
    userProfile.value.workoutDaysPerWeek = val === "" ? undefined : Number(val);
  },
});

const stepper = useStepper({
  goal: { title: "Fitness Goal" },
  level: { title: "Fitness Level" },
  days: { title: "Workout Days" },
  location: { title: "Workout Location" },
  equipment: { title: "Equipment" },
  stats: { title: "Body Stats" },
  extra: { title: "Additional Info" },
  apikey: { title: "API Key" },
});

const stepsArray = computed(() => Object.keys(stepper.steps.value));
const totalSteps = computed(() => stepsArray.value.length);
// We must ignore the id missing type on step current value
// @ts-expect-error
const currentStepIndex = computed(() => stepsArray.value.indexOf(stepper.current.value.id));

function handleNext() {
  if (stepper.isLast.value) {
    // If we're on the last step, mark as complete and route to logs
    profileStore.hasCompletedSetup = true;
    router.push("/exercise-logs");
  } else {
    stepper.goToNext();
  }
}

function handleBack() {
  if (stepper.isFirst.value) {
    // Cannot go back further from step 1 in the wizard
  } else {
    stepper.goToPrevious();
  }
}

function skipWizard() {
  profileStore.hasCompletedSetup = true;
  router.push("/exercise-logs");
}
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col pt-safe">
    <!-- Header -->
    <header class="flex items-center justify-between px-4 py-4 sticky top-0 bg-background/90 z-10 backdrop-blur-xl">
      <Button
        variant="ghost"
        size="icon"
        class="rounded-full w-12 h-12"
        @click="handleBack"
        :disabled="stepper.isFirst.value"
        :class="{ 'opacity-0 pointer-events-none': stepper.isFirst.value }"
      >
        <ArrowLeft class="w-6 h-6" />
      </Button>

      <!-- Progress indicators -->
      <div class="flex gap-2 items-center mx-4 flex-1 justify-center max-w-[200px]">
        <div
          v-for="(step, idx) in totalSteps"
          :key="idx"
          class="h-1.5 flex-1 rounded-full bg-white/10 transition-colors duration-300"
          :class="{ 'bg-primary shadow-[0_0_8px_rgba(204,255,0,0.5)]': idx <= currentStepIndex }"
        ></div>
      </div>

      <Button variant="ghost" class="text-primary font-semibold tracking-wide" @click="skipWizard">
        Skip
      </Button>
    </header>

    <!-- Content Area -->
    <main class="flex-1 px-6 pb-32 flex flex-col mt-4">
      <div class="flex-1 animate-in fade-in slide-in-from-right-4 duration-300" :key="currentStepIndex">
        <!-- Goal -->
        <template v-if="stepper.isCurrent('goal')">
          <h2 class="text-3xl font-black mb-2 tracking-tight">What's your primary goal?</h2>
          <p class="text-muted-foreground mb-10 text-lg">Select all that apply.</p>
          <ToggleGroup type="multiple" v-model="userProfile.fitnessGoal">
            <ToggleGroupItem v-for="[label, value] in fitnessGoalLabels" :key="value" :value="value">
              {{ label }}
            </ToggleGroupItem>
          </ToggleGroup>
        </template>

        <!-- Level -->
        <template v-else-if="stepper.isCurrent('level')">
          <h2 class="text-3xl font-black mb-2 tracking-tight">Experience level</h2>
          <p class="text-muted-foreground mb-10 text-lg">How long have you been training?</p>
          <ToggleGroup type="single" v-model="userProfile.fitnessLevel">
            <ToggleGroupItem v-for="[label, value] in fitnessLevelLabels" :key="value" :value="value">
              {{ label }}
            </ToggleGroupItem>
          </ToggleGroup>
        </template>

        <!-- Days -->
        <template v-else-if="stepper.isCurrent('days')">
          <h2 class="text-3xl font-black mb-2 tracking-tight">Training frequency</h2>
          <p class="text-muted-foreground mb-10 text-lg">Workouts per week</p>
          <ToggleGroup type="single" v-model="workoutDaysString" class="grid grid-cols-2">
            <ToggleGroupItem v-for="[label, value] in workoutDaysPerWeekLabels" :key="value" :value="String(value)" class="justify-center h-20 text-xl font-bold">
              {{ label }}
            </ToggleGroupItem>
          </ToggleGroup>
        </template>

        <!-- Location -->
        <template v-else-if="stepper.isCurrent('location')">
          <h2 class="text-3xl font-black mb-2 tracking-tight">Where do you train?</h2>
          <p class="text-muted-foreground mb-10 text-lg">Sets your equipment baseline.</p>
          <ToggleGroup type="single" v-model="userProfile.workoutLocation">
            <ToggleGroupItem v-for="[label, value] in workoutLocationLabels" :key="value" :value="value">
              {{ label }}
            </ToggleGroupItem>
          </ToggleGroup>
        </template>

        <!-- Equipment -->
        <template v-else-if="stepper.isCurrent('equipment')">
          <h2 class="text-3xl font-black mb-2 tracking-tight">Equipment access</h2>
          <p class="text-muted-foreground mb-10 text-lg">Select what you have available.</p>
          <ToggleGroup type="multiple" v-model="userProfile.equipmentAccess">
            <ToggleGroupItem v-for="[label, value] in equipmentOptionLabels" :key="value" :value="value" class="py-3">
              {{ label }}
            </ToggleGroupItem>
          </ToggleGroup>
        </template>

        <!-- Body Stats -->
        <template v-else-if="stepper.isCurrent('stats')">
          <h2 class="text-3xl font-black mb-2 tracking-tight">Body Stats</h2>
          <p class="text-muted-foreground mb-10 text-lg">Optional, helps the AI format plans.</p>
          <div class="space-y-6">
            <NumberField v-model="userProfile.age" label="Age" :min="10" :max="120" />
            <NumberField v-model="userProfile.heightCm" label="Height (cm)" :min="50" :max="300" />
            <NumberField v-model="userProfile.weightKg" label="Weight (kg)" :min="20" :max="300" :step="0.5" />
          </div>
        </template>

        <!-- Free Input -->
        <template v-else-if="stepper.isCurrent('extra')">
          <h2 class="text-3xl font-black mb-2 tracking-tight">Additional Context</h2>
          <p class="text-muted-foreground mb-10 text-lg">Any injuries, specific focus areas, or limitations?</p>
          <textarea
            v-model="userProfile.freeUserInput"
            placeholder="e.g. Bad left knee, want to focus on explosive strength..."
            class="w-full flex min-h-[160px] rounded-2xl border border-input/50 bg-card/60 px-5 py-4 text-base font-medium ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-inner backdrop-blur-md resize-none"
          ></textarea>
        </template>

        <!-- API Key -->
        <template v-else-if="stepper.isCurrent('apikey')">
          <h2 class="text-3xl font-black mb-2 tracking-tight">Enable AI Coach</h2>
          <p class="text-muted-foreground mb-10 text-lg">Enter your Gemini API Key to enable personalized feedback.</p>
          <Input
            v-model="apiKeyString"
            type="password"
            placeholder="AIzaSy..."
            class="mb-6 font-mono tracking-widest"
          />
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" class="text-primary hover:underline font-semibold flex items-center gap-2">
            Get a free API key <Sparkles class="w-4 h-4" />
          </a>
        </template>

      </div>
    </main>

    <!-- Bottom Action -->
    <div class="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent pb-safe">
      <Button
        class="w-full h-16 rounded-2xl text-lg font-bold tracking-wide transition-all data-[state=save]:bg-white data-[state=save]:text-black hover:data-[state=save]:scale-[0.98]"
        :data-state="stepper.isLast.value ? 'save' : 'next'"
        @click="handleNext"
      >
        <span v-if="!stepper.isLast.value">Continue</span>
        <div v-else class="flex items-center gap-2">
          Finish Setup <Check class="w-5 h-5" />
        </div>
      </Button>
    </div>
  </div>
</template>
