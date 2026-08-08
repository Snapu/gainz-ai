<script setup lang="ts">
import { Check, CheckCircle2, Coffee, List, Sparkles, Timer } from "@lucide/vue";
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
import UserProgressCard from "@/shared/presentation/components/UserProgressCard.vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiBottomSheet from "@/shared/presentation/components/ui/UiBottomSheet.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import { useHomeWorkoutViewModel } from "@/views/composables/useHomeWorkoutViewModel";

const {
  router,
  logsStore,
  isSummaryReady,
  userProgress,
  trainingInsights,
  groupedLogs,
  collapsedSessions,
  toggleSession,
  editLog,
  chatStore,
  planStore,
  allWorkoutGroups,
  completedExercises,
  planDerivedWorkout,
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
  activeWorkoutGroups,
  requestOffDayWorkout,
} = useHomeWorkoutViewModel();

const showPastSessions = ref(false);
const showOverviewSheet = ref(false);

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
    nextTick(() => {
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
  <div class="h-full bg-background flex flex-col pt-safe relative">
    
    <!-- Top Nav -->
    <AppHeader>
      <h1 class="text-2xl font-black italic tracking-tighter">Gainz<span class="text-primary">AI</span></h1>
      <template #actions>
        <GlobalHeaderActions />
      </template>
    </AppHeader>

    <main class="flex-1 overflow-y-auto no-scrollbar flex flex-col relative">
      
      <!-- Unified Journey HUD -->
      <div class="px-4 pt-4 pb-2">
        <UserProgressCard 
          v-if="isSummaryReady"
          :progress="userProgress" 
          :insights="trainingInsights" 
          class="w-full mx-0 mt-0"
        />
        <!-- Skeleton placeholder while summaries load -->
        <div
          v-else
          class="w-full h-48 rounded-xl bg-card ring-1 ring-white/5 animate-pulse"
        />
      </div>
      
      <div class="flex-1 px-4 pb-32 flex flex-col gap-6 pt-2">
        <!-- TODAY'S WORKOUT SECTION -->
        <section>
        <template v-if="chatStore.isLoading && !activeWorkoutGroups?.length">
          <div class="mt-1 flex items-center justify-between gap-4">
            <div class="h-4 w-32 bg-muted/20 animate-pulse rounded"></div>
          </div>
          <div class="flex flex-col gap-3 mt-4">
            <div v-for="i in 2" :key="i" class="w-full p-4 rounded-xl border border-white/5 shadow-sm bg-card animate-pulse">
              <div class="flex justify-between items-start mb-4">
                <div class="h-5 w-40 bg-muted/20 rounded"></div>
                <div class="h-8 w-8 bg-muted/20 rounded-full"></div>
              </div>
              <div class="grid grid-cols-3 gap-3">
                <div class="h-10 bg-muted/20 rounded col-span-1"></div>
                <div class="h-10 bg-muted/20 rounded col-span-1"></div>
                <div class="h-10 bg-muted/20 rounded col-span-1"></div>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div v-if="allWorkoutGroups?.length" class="flex flex-col w-full">
            <div class="mb-4 flex items-center justify-between gap-4">
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-bold text-foreground">Today's Workout</h3>
              </div>
              <div class="flex items-center gap-2">
                <template v-if="restTimerStore.isResting">
                  <Timer class="w-4 h-4 text-emerald-500 animate-pulse" />
                  <span class="text-sm font-bold tabular-nums text-emerald-500">{{ restTimerStore.formattedTime }}</span>
                </template>
                <UiBadge v-if="currentSessionElapsedText" variant="surface" class="uppercase tracking-wider">
                  <Timer class="w-3 h-3 mr-1.5 opacity-70" />
                  {{ currentSessionElapsedText }}
                </UiBadge>
                <UiButton variant="ghost" size="icon" class="w-8 h-8 rounded-full" @click="showOverviewSheet = true">
                  <List class="w-4 h-4 text-muted-foreground" />
                </UiButton>
              </div>
            </div>


            <!-- Dot-based Stepper -->
            <div class="flex items-center w-full mb-6 px-1">
              <template v-for="(group, gIdx) in allWorkoutGroups" :key="group.id">
                
                <!-- Group Container (No pill, just dots close together) -->
                <div class="flex items-center gap-1.5 shrink-0">
                  
                  <button 
                    v-for="ex in group.exercises"
                    :key="ex.exerciseName"
                    @click="scrollToGroup(gIdx)"
                    class="relative shrink-0 transition-all duration-300 z-10 rounded-full focus-visible:outline-none flex items-center justify-center"
                    :class="[
                      getExerciseProgress(ex.exerciseName, ex.targetSets).isCompleted 
                        ? (gIdx === visibleGroupIndex 
                            ? 'w-4 h-4 bg-emerald-500 ring-2 ring-emerald-500/30 ring-offset-2 ring-offset-background text-background' 
                            : 'w-3.5 h-3.5 bg-emerald-500/80 text-background')
                        : (gIdx === visibleGroupIndex 
                            ? 'w-3.5 h-3.5 bg-primary ring-2 ring-primary/30 ring-offset-2 ring-offset-background' 
                            : (gIdx === activeGroupIndex 
                                ? 'w-2.5 h-2.5 bg-primary/50' 
                                : 'w-2.5 h-2.5 bg-white/20 hover:bg-white/40'))
                    ]"
                  >
                    <Check v-if="getExerciseProgress(ex.exerciseName, ex.targetSets).isCompleted" class="w-full h-full p-[2px] opacity-90" stroke-width="4" />
                  </button>
                  
                </div>

                <!-- Connecting Line -->
                <div v-if="gIdx < allWorkoutGroups.length - 1" class="flex-1 h-[2px] transition-colors duration-500 mx-2.5 z-0 rounded-full"
                     :class="isGroupCompleted(group) ? 'bg-emerald-500/30' : 'bg-white/10'"
                ></div>

              </template>
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
                  <span class="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">Superset</span>
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
          
          <EmptyState 
            v-else-if="!activeWorkoutGroups?.length && completedExercises.length"
            :icon="CheckCircle2"
            title="Workout Complete!"
            class="opacity-100"
          />
          
          <!-- Rest day state (plan exists, but no session for today) -->
          <EmptyState 
            v-else-if="planStore.activePlan && !planDerivedWorkout?.length"
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
      </div>
    </main>

    <!-- Overview Sheet -->
    <UiBottomSheet v-model:open="showOverviewSheet" title="Workout Overview">
      <div class="flex flex-col gap-6 w-full pt-4 pb-8">
        <div
          v-for="(group, gIndex) in allWorkoutGroups"
          :key="group.id"
          class="w-full flex flex-col gap-2"
        >
          <div v-if="group.isSuperset" class="w-full flex items-center gap-3">
            <div class="flex-1 h-px bg-primary/10 rounded-full"></div>
            <span class="text-[10px] font-bold uppercase tracking-widest text-primary/80">Superset</span>
            <div class="flex-1 h-px bg-primary/10 rounded-full"></div>
          </div>
          
          <div 
            v-for="(exercise, exIndex) in group.exercises" 
            :key="exercise.exerciseName ?? exIndex"
            class="flex items-center justify-between w-full p-4 rounded-xl border transition-colors"
            :class="isExerciseCompleted(exercise) ? 'bg-emerald-500/10 border-emerald-500/20 opacity-60' : (gIndex === activeGroupIndex ? 'bg-primary/10 border-primary/20' : 'bg-card border-white/5')"
          >
             <div class="flex flex-col min-w-0">
               <span class="text-sm font-semibold truncate text-foreground" :class="isExerciseCompleted(exercise) ? 'line-through decoration-muted-foreground/30' : ''">
                 {{ exercise.exerciseName }}
               </span>
               <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mt-1">
                 {{ exercise.targetSets }} Sets
               </span>
             </div>
             
             <CheckCircle2 v-if="isExerciseCompleted(exercise)" class="w-5 h-5 text-emerald-500 shrink-0" />
             <div v-else-if="gIndex === activeGroupIndex" class="w-2 h-2 rounded-full bg-primary animate-pulse mr-1"></div>
          </div>
        </div>
      </div>
    </UiBottomSheet>
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
