<script setup lang="ts">
import { CheckCircle2, Coffee, Sparkles, Timer } from "@lucide/vue";
import { computed, nextTick, onActivated, onMounted, ref, watch } from "vue";
import {
  type DisplayExercise,
  type DisplayWorkoutGroup,
  WorkoutExerciseCard,
} from "@/modules/aiCoach/presentation";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import EmptyState from "@/shared/presentation/components/EmptyState.vue";
import GlobalHeaderActions from "@/shared/presentation/components/GlobalHeaderActions.vue";
import SessionLogGroup from "@/shared/presentation/components/SessionLogGroup.vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiTelemetryLoader from "@/shared/presentation/components/ui/UiTelemetryLoader.vue";
import { useHomeWorkoutViewModel } from "@/views/composables/useHomeWorkoutViewModel";

const {
  router,
  logsStore,
  groupedLogs,
  collapsedSessions,
  toggleSession,
  editLog,
  chatStore,
  isRestDay,
  isWorkoutComplete,
  allWorkoutGroups,
  currentSessionElapsedText,
  getExerciseProgress,
  getExerciseProgression,
  isExerciseCompleted,
  isHighlighted,
  getLastSessionSummary,
  getTodaysLogsForExercise,
  handleLogExercise,
  openGoogleSearch,
  restTimerStore,
  requestOffDayWorkout,
} = useHomeWorkoutViewModel();

const showPastSessions = ref(false);

const galleryRef = ref<HTMLElement | null>(null);

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

const visibleGroupIndex = ref(0);

// Auto-scroll when active group changes
watch(
  activeGroupIndex,
  async (newIdx) => {
    scrollToGroup(newIdx);
  },
  { immediate: true },
);

// Ensure we scroll to the active group when mounted (since immediate watcher might run before ref is bound)
onMounted(() => {
  scrollToGroup(activeGroupIndex.value);
});

// Restore scroll position to the active group when returning to this view via keep-alive
onActivated(() => {
  scrollToGroup(activeGroupIndex.value);
});

function scrollToGroup(idx: number) {
  if (galleryRef.value) {
    nextTick().then(() => {
      const container = galleryRef.value;
      if (!container) return;
      const children = container.children;
      if (children?.[idx]) {
        const child = children[idx] as HTMLElement;
        const containerRect = container.getBoundingClientRect();
        const childRect = child.getBoundingClientRect();

        const targetScrollLeft =
          container.scrollLeft +
          (childRect.left - containerRect.left) -
          containerRect.width / 2 +
          childRect.width / 2;
        container.scrollTo({ left: targetScrollLeft, behavior: "smooth" });
      }
    });
  }
}

function handleGalleryScroll() {
  if (!galleryRef.value) return;
  const containerRect = galleryRef.value.getBoundingClientRect();
  const containerCenter = containerRect.left + containerRect.width / 2;

  let closestIdx = visibleGroupIndex.value;
  let minDistance = Infinity;

  const children = galleryRef.value.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as HTMLElement;
    const rect = child.getBoundingClientRect();
    const childCenter = rect.left + rect.width / 2;
    const distance = Math.abs(childCenter - containerCenter);

    if (distance < minDistance) {
      minDistance = distance;
      closestIdx = i;
    }
  }

  if (visibleGroupIndex.value !== closestIdx) {
    visibleGroupIndex.value = closestIdx;
  }
}
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

    <main class="flex-1 w-full max-w-2xl mx-auto px-4 pt-4 pb-28 overflow-y-auto overscroll-y-contain no-scrollbar flex flex-col gap-5">
      <!-- TODAY'S WORKOUT SECTION -->
      <section>
        <template v-if="chatStore.isLoading && !allWorkoutGroups?.length">
          <UiTelemetryLoader text="Calibrating training session..." />
        </template>

        <template v-else>
          <div v-if="allWorkoutGroups?.length" class="flex flex-col w-full">
            <div class="mb-4 flex items-center justify-between gap-4">
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

            <!-- Segmented Stepper Bar -->
            <div class="flex items-start gap-1.5 w-full mb-4 px-1 min-h-[44px] -my-2 py-2">
              <button
                v-for="(group, gIdx) in allWorkoutGroups"
                :key="group.id"
                type="button"
                @click="scrollToGroup(gIdx)"
                :aria-label="group.isSuperset ? `Superset ${gIdx + 1}` : group.exercises[0]?.exerciseName"
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
                          : (gIdx === activeGroupIndex
                              ? 'bg-primary/30 group-hover:bg-primary/50'
                              : 'bg-white/10 group-hover:bg-white/20'))
                  ]"
                />
              </button>
            </div>

            <!-- Swipe Gallery -->
            <div 
              ref="galleryRef"
              @scroll="handleGalleryScroll"
              class="flex overflow-x-auto snap-x snap-mandatory no-scrollbar pb-6 -mx-4 px-4 gap-4 scroll-smooth"
            >
              <div
                v-for="(group, gIndex) in allWorkoutGroups"
                :key="group.id"
                class="w-[88vw] max-w-sm shrink-0 snap-center flex flex-col gap-4"
              >
                <!-- Superset Header within Card Column -->
                <div v-if="group.isSuperset" class="w-full flex items-center gap-3 mb-[-0.25rem]">
                  <div class="flex-1 h-px bg-primary/20 rounded-full"></div>
                  <UiBadge variant="info" class="text-micro font-bold px-3 py-0.5">Superset</UiBadge>
                  <div class="flex-1 h-px bg-primary/20 rounded-full"></div>
                </div>
                
                <WorkoutExerciseCard
                  v-for="(exercise, exIndex) in group.exercises"
                  :key="exercise.exerciseName"
                  :exercise="exercise"
                  :is-completed="isExerciseCompleted(exercise)"
                  :is-highlighted="isHighlighted(gIndex, exIndex)"
                  :progress="getExerciseProgress(exercise.exerciseName, exercise.targetSets)"
                  :last-session-summary="getLastSessionSummary(exercise.exerciseName)"
                  :progression-data="getExerciseProgression(exercise.exerciseName)"
                  :logged-sets="getTodaysLogsForExercise(exercise.exerciseName)"
                  :is-resting="restTimerStore.isResting"
                  :heading-level="group.isSuperset ? 'h4' : 'h3'"
                  @log="handleLogExercise"
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
            class="opacity-100"
          >
            <UiButton variant="default" size="sm" class="text-xs" @click="requestOffDayWorkout">
              Train Anyway
            </UiButton>
          </EmptyState>
          
          <!-- No plan at all -->
          <EmptyState 
            v-else
            :icon="Sparkles"
            title="No active workout"
            class="opacity-100"
          >
            <UiButton variant="outline" size="sm" class="mt-4" @click="router.push({ name: 'plan' })">
              View Plan
            </UiButton>
          </EmptyState>
        </template>
      </section>

      <!-- Divider -->
      <div class="w-full h-px bg-white/5 my-2"></div>

      <!-- PAST LOGS SECTION -->
      <section class="mt-4 flex flex-col items-center gap-4">
        <UiButton 
          variant="outline" 
          size="sm" 
          class="w-full max-w-[200px]" 
          @click="showPastSessions = !showPastSessions"
        >
          {{ showPastSessions ? 'Hide Past Sessions' : 'View Past Sessions' }}
        </UiButton>

        <div v-if="showPastSessions" class="w-full flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <SessionLogGroup
            v-for="session in groupedLogs"
            :key="session.date"
            :date="session.date"
            :logs="session.logs"
            :stats="session.stats"
            :is-collapsed="!!collapsedSessions[session.date]"
            @toggle="toggleSession(session.date)"
            @delete-log="logsStore.removeExerciseLog"
            @edit-log="editLog"
          />
          
          <EmptyState 
            v-if="groupedLogs.length === 0"
            title="No exercises yet."
            description="Tap the + button to log your first set."
          />
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
