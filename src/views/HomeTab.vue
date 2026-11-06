<script setup lang="ts">
import { CheckCircle2, Coffee, Sparkles, Timer } from "@lucide/vue";
import { useDebounceFn, useThrottleFn } from "@vueuse/core";
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, watch } from "vue";
import {
  type DisplayExercise,
  type DisplayWorkoutGroup,
  WorkoutExerciseCard,
} from "@/modules/aiCoach/presentation";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import EmptyState from "@/shared/presentation/components/EmptyState.vue";
import GlobalHeaderActions from "@/shared/presentation/components/GlobalHeaderActions.vue";
import TrainInteractionDeck from "@/shared/presentation/components/TrainInteractionDeck.vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiTelemetryLoader from "@/shared/presentation/components/ui/UiTelemetryLoader.vue";
import { useHomeWorkoutViewModel } from "@/views/composables/useHomeWorkoutViewModel";

const {
  router,
  editLog,
  chatStore,
  isRestDay,
  isWorkoutComplete,
  allWorkoutGroups,
  currentSessionElapsedText,
  getExerciseProgress,
  getExerciseProgression,
  isHighlighted,
  getLastSessionSummary,
  getTodaysLogsForExercise,
  handleLogArbitrary,
  skipRest,
  visibleGroupIndex,
  activeExerciseForDeck,
  activeExerciseProgress,
  supersetAlternatives,
  selectSupersetExercise,
  handleDeckLogCurrent,
  openGoogleSearch,
  restTimerStore,
  requestOffDayWorkout,
} = useHomeWorkoutViewModel();

const galleryRef = ref<HTMLElement | null>(null);
const isProgrammaticScrolling = ref(false);
let programmaticScrollTimeout: ReturnType<typeof setTimeout> | null = null;

function isGroupCompleted(group: DisplayWorkoutGroup) {
  return group.exercises.every(
    (ex: DisplayExercise) => getExerciseProgress(ex.exerciseName, ex.targetSets).isCompleted,
  );
}

const activeGroupIndex = computed(() => {
  if (!allWorkoutGroups.value || allWorkoutGroups.value.length === 0) return 0;
  const idx = allWorkoutGroups.value.findIndex((g) => !isGroupCompleted(g));
  return idx === -1 ? allWorkoutGroups.value.length - 1 : idx;
});

function resetProgrammaticScroll() {
  if (programmaticScrollTimeout) {
    clearTimeout(programmaticScrollTimeout);
    programmaticScrollTimeout = null;
  }
  isProgrammaticScrolling.value = false;
}

function scrollContainerToChild(container: HTMLElement, idx: number, smooth: boolean) {
  const child = container.children?.[idx] as HTMLElement | undefined;
  if (!child) return;

  if (smooth) {
    isProgrammaticScrolling.value = true;
    if (programmaticScrollTimeout) clearTimeout(programmaticScrollTimeout);
    programmaticScrollTimeout = setTimeout(resetProgrammaticScroll, 500);
  }

  if (typeof container.scrollTo === "function") {
    container.scrollTo({ left: child.offsetLeft, behavior: smooth ? "smooth" : "instant" });
  } else {
    try {
      container.scrollLeft = child.offsetLeft;
    } catch {
      // Fallback for jsdom/test environments
    }
  }
}

function scrollToGroup(idx: number, smooth = true) {
  if (!allWorkoutGroups.value || idx < 0 || idx >= allWorkoutGroups.value.length) return;
  visibleGroupIndex.value = idx;

  nextTick().then(() => {
    if (galleryRef.value) {
      scrollContainerToChild(galleryRef.value, idx, smooth);
    }
  });
}

function syncVisibleGroupFromScroll() {
  if (isProgrammaticScrolling.value) return;
  const container = galleryRef.value;
  const children = container?.children;
  if (!container || !children?.length) return;
  if (children.length <= 1) {
    visibleGroupIndex.value = 0;
    return;
  }

  const diff = (children[1] as HTMLElement).offsetLeft - (children[0] as HTMLElement).offsetLeft;
  const stepWidth = diff > 0 ? diff : container.clientWidth;
  if (stepWidth <= 0) return;

  const closestIdx = Math.max(
    0,
    Math.min(children.length - 1, Math.round(container.scrollLeft / stepWidth)),
  );
  if (visibleGroupIndex.value !== closestIdx) {
    visibleGroupIndex.value = closestIdx;
  }
}

const handleGalleryScrollThrottled = useThrottleFn(syncVisibleGroupFromScroll, 50);
const handleGalleryScrollDebounced = useDebounceFn(() => {
  resetProgrammaticScroll();
  syncVisibleGroupFromScroll();
}, 100);

function handleGalleryScroll() {
  handleGalleryScrollThrottled();
  handleGalleryScrollDebounced();
}

function handleGalleryScrollEnd() {
  resetProgrammaticScroll();
  syncVisibleGroupFromScroll();
}

// Auto-scroll when active group changes
watch(
  activeGroupIndex,
  (newIdx) => {
    scrollToGroup(newIdx, true);
  },
  { flush: "post" },
);

// When workout groups finish loading asynchronously
watch(
  () => allWorkoutGroups.value?.length,
  (length) => {
    if (length) scrollToGroup(activeGroupIndex.value, false);
  },
  { flush: "post" },
);

onMounted(() => {
  if (allWorkoutGroups.value?.length) {
    scrollToGroup(activeGroupIndex.value, false);
  }
});

onUnmounted(resetProgrammaticScroll);

// Restore scroll position to the visible group when returning to this view via keep-alive
onActivated(() => {
  if (allWorkoutGroups.value?.length) {
    scrollToGroup(visibleGroupIndex.value, false);
  }
});
</script>

<template>
  <div class="h-full bg-background flex flex-col pt-safe relative overflow-hidden">
    
    <!-- Top Nav -->
    <AppHeader class="shrink-0">
      <h1 class="text-2xl font-black italic tracking-tighter">Gainz<span class="text-primary">AI</span></h1>
      <template #actions>
        <GlobalHeaderActions />
      </template>
    </AppHeader>

    <main class="flex-1 w-full max-w-2xl mx-auto px-4 pb-6 overflow-y-auto overscroll-y-contain no-scrollbar flex flex-col gap-5">
      <!-- TODAY'S WORKOUT SECTION -->
      <section>
        <template v-if="chatStore.isLoading && !allWorkoutGroups?.length">
          <div class="pt-4">
            <UiTelemetryLoader text="Calibrating training session..." />
          </div>
        </template>

        <template v-else>
          <div v-if="allWorkoutGroups?.length" class="flex flex-col w-full">
            <!-- Sticky Heading & Stepper Bar -->
            <div class="sticky top-0 z-20 bg-background/95 backdrop-blur-md pt-4 pb-2 -mx-4 px-4 mb-2">
              <div class="mb-3 flex items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                  <h3 class="text-sm font-bold text-foreground">Today's Workout</h3>
                </div>
                <div class="flex items-center gap-2">
                  <template v-if="restTimerStore.isResting">
                    <Timer
                      class="w-4 h-4 animate-pulse"
                      :class="restTimerStore.isOvertime ? 'text-destructive' : 'text-primary'"
                    />
                    <span
                      class="text-sm font-bold tabular-nums"
                      :class="restTimerStore.isOvertime ? 'text-destructive' : 'text-primary'"
                    >
                      {{ restTimerStore.formattedTime }}
                    </span>
                  </template>
                  <UiBadge v-if="currentSessionElapsedText" variant="surface" class="uppercase tracking-wider">
                    <Timer class="w-3 h-3 mr-1.5 opacity-70" />
                    {{ currentSessionElapsedText }}
                  </UiBadge>
                </div>
              </div>

              <!-- Segmented Stepper Bar -->
              <div class="flex items-start gap-2 w-full px-1 min-h-[44px] -my-2 py-2">
                <button
                  v-for="(group, gIdx) in allWorkoutGroups"
                  :key="group.id"
                  type="button"
                  @click="scrollToGroup(gIdx, true)"
                  :aria-label="group.isSuperset ? `Superset ${gIdx + 1}` : group.exercises[0]?.exerciseName"
                  :aria-current="gIdx === visibleGroupIndex ? 'step' : undefined"
                  class="flex-1 flex flex-col justify-start gap-1 pt-0.5 h-full min-h-[36px] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 transition-all group cursor-pointer"
                >
                  <div
                    v-for="ex in group.exercises"
                    :key="ex.exerciseName"
                    class="h-1.5 w-full rounded-full transition-all duration-300"
                    :class="[
                      getExerciseProgress(ex.exerciseName, ex.targetSets).isCompleted
                        ? (gIdx === visibleGroupIndex ? 'bg-emerald-500 ring-2 ring-emerald-500/30' : 'bg-emerald-500/80')
                        : (gIdx === visibleGroupIndex
                            ? 'bg-primary ring-2 ring-primary/30'
                            : 'bg-white/10 group-hover:bg-white/20')
                    ]"
                  />
                </button>
              </div>
            </div>

            <!-- Workout Complete Banner -->
            <div
              v-if="isWorkoutComplete"
              class="mb-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 animate-in fade-in duration-300"
            >
              <CheckCircle2 class="w-5 h-5 text-emerald-400 shrink-0" />
              <div class="flex flex-col">
                <span class="text-sm font-bold text-foreground">Workout Complete!</span>
                <span class="text-xs text-muted-foreground font-medium">All exercises completed for today.</span>
              </div>
            </div>

            <!-- Swipe Gallery -->
            <div 
              ref="galleryRef"
              @scroll="handleGalleryScroll"
              @scrollend="handleGalleryScrollEnd"
              class="relative flex overflow-x-auto snap-x snap-mandatory no-scrollbar pb-6 gap-4 scroll-smooth"
            >
              <div
                v-for="(group, gIndex) in allWorkoutGroups"
                :key="group.id"
                class="w-full shrink-0 snap-center flex flex-col gap-4"
              >
                <WorkoutExerciseCard
                  v-for="(exercise, exIndex) in group.exercises"
                  :key="exercise.exerciseName"
                  :exercise="exercise"
                  :is-highlighted="isHighlighted(gIndex, exIndex)"
                  :is-superset="group.isSuperset"
                  :last-session-summary="getLastSessionSummary(exercise.exerciseName)"
                  :progression-data="getExerciseProgression(exercise.exerciseName)"
                  :logged-sets="getTodaysLogsForExercise(exercise.exerciseName)"
                  :heading-level="group.isSuperset ? 'h4' : 'h3'"
                  @editLog="editLog"
                  @search="openGoogleSearch"
                />
              </div>
            </div>
          </div>
          
          <!-- Rest day state -->
          <EmptyState 
            v-else-if="isRestDay"
            :icon="Coffee"
            title="Rest Day"
            description="No training scheduled for today."
            class="opacity-100 mt-4"
          >
            <div class="flex items-center gap-2">
              <UiButton variant="default" size="sm" class="text-xs" @click="requestOffDayWorkout">
                Train Anyway
              </UiButton>
              <UiButton variant="outline" size="sm" class="text-xs" @click="handleLogArbitrary">
                Log Exercise
              </UiButton>
            </div>
          </EmptyState>
          
          <!-- No plan at all -->
          <EmptyState 
            v-else
            :icon="Sparkles"
            title="No active workout"
            class="opacity-100 mt-4"
          >
            <div class="flex items-center gap-2 mt-4">
              <UiButton variant="outline" size="sm" @click="router.push({ name: 'plan' })">
                View Plan
              </UiButton>
              <UiButton variant="default" size="sm" class="text-xs" @click="handleLogArbitrary">
                Log Exercise
              </UiButton>
            </div>
          </EmptyState>
        </template>
      </section>
    </main>

    <!-- Bottom Docked Actions & Interaction Deck -->
    <TrainInteractionDeck
      :current-exercise="activeExerciseForDeck"
      :current-progress="activeExerciseProgress"
      :superset-alternatives="supersetAlternatives"
      :is-resting="restTimerStore.isResting"
      :rest-formatted-time="restTimerStore.formattedTime"
      :target-rest-seconds="restTimerStore.targetRestSeconds"
      :rest-elapsed="restTimerStore.restElapsed"
      :is-overtime="restTimerStore.isOvertime"
      :is-workout-complete="isWorkoutComplete"
      :is-rest-day="isRestDay"
      @log-current="handleDeckLogCurrent"
      @log-custom="handleLogArbitrary"
      @skip-rest="skipRest"
      @select-superset-exercise="selectSupersetExercise"
    />
  </div>
</template>
