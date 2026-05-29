<script setup lang="ts">
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  RotateCw,
  Sparkles,
} from "@lucide/vue";
import { LogExerciseSheet } from "@/modules/trainingLogs/presentation";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiBottomSheet from "@/shared/presentation/components/ui/UiBottomSheet.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiTextarea from "@/shared/presentation/components/ui/UiTextarea.vue";
import { useAICoachPageViewModel } from "../composables/useAICoachPageViewModel";
import WorkoutExerciseCard from "./WorkoutExerciseCard.vue";

const {
  router,
  aiStore,
  restTimerStore,
  isLogFormOpen,
  prefillData,
  selectedRestSeconds,
  currentPageIndex,
  userQuestion,
  isAskSheetOpen,
  openScratchpads,
  openRequestPayloads,
  scrollContainerRef,
  assistantMessages,
  activeWorkoutGroups,
  completedExercises,
  cooldownProgressPercent,
  getExerciseProgress,
  isExerciseCompleted,
  isHighlighted,
  renderMarkdown,
  formatRestDuration,
  formatTime,
  debouncedAskAi,
  forceRefreshAi,
  handleLogExercise,
  handleAskQuestion,
  openGoogleSearch,
} = useAICoachPageViewModel();
</script>

<template>
 <div class="min-h-screen bg-background flex flex-col pt-safe relative">
  <!-- Header -->
  <AppHeader>
   <UiButton variant="ghost" size="icon" @click="router.back()">
    <ArrowLeft class="w-5 h-5" />
   </UiButton>
   <div class="flex-1 min-w-0 ml-2">
    <h1 class="text-lg font-bold tracking-tight text-foreground">AI Coach</h1>
   </div>
   <UiButton
    variant="ghost"
    size="icon"
    @click="forceRefreshAi"
    :disabled="aiStore.isLoading"
   >
    <RotateCw
     class="w-5 h-5 text-muted-foreground hover:text-primary transition-colors"
     :class="{ 'animate-spin': aiStore.isLoading }"
    />
   </UiButton>
   <UiButton
    type="button"
    variant="ghost"
    size="icon"
    class="ml-2"
    @click="isAskSheetOpen = true"
    :disabled="aiStore.isLoading"
    title="Ask Coach"
   >
    <MessageSquare class="w-4 h-4 text-primary" />
    <span class="sr-only">Ask Coach</span>
   </UiButton>
  </AppHeader>

  <!-- Content Area -->
  <div ref="scrollContainerRef" class="flex-1 overflow-y-auto px-5 pt-4 pb-16 space-y-4 no-scrollbar">

    <!-- 1. AI Coach Insight Section -->
    <div v-if="assistantMessages.length > 0" class="flex flex-col gap-3 relative px-1">
     <!-- Header: timestamp + pager -->
     <div class="flex items-center justify-between gap-3 pb-1">
      <span class="text-xs font-medium text-muted-foreground/60 shrink-0">
       {{ formatTime(assistantMessages[currentPageIndex].timestamp) }}
      </span>
      <div v-if="assistantMessages.length > 1" class="flex items-center gap-2 bg-muted/10 px-2.5 py-0.5 rounded-full border border-muted/10 shrink-0">
       <button
        type="button"
        class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed p-0.5 active:scale-95 cursor-pointer rounded-full hover:bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
        :disabled="currentPageIndex === 0"
        @click="currentPageIndex--"
       >
        <ChevronLeft class="w-3.5 h-3.5 shrink-0" />
       </button>
       <span class="text-xs font-bold text-muted-foreground min-w-[28px] text-center select-none shrink-0">
        {{ currentPageIndex + 1 }} / {{ assistantMessages.length }}
       </span>
       <button
        type="button"
        class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed p-0.5 active:scale-95 cursor-pointer rounded-full hover:bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
        :disabled="currentPageIndex === assistantMessages.length - 1"
        @click="currentPageIndex++"
       >
        <ChevronRight class="w-3.5 h-3.5 shrink-0" />
       </button>
      </div>
     </div>

     <!-- Message body -->
     <div class="flex flex-col gap-2">
      <template v-if="assistantMessages[currentPageIndex].parsedData">
       <div
        class="text-sm leading-relaxed [&_strong]:text-primary [&_strong]:font-bold text-foreground/90 font-medium"
        v-html="renderMarkdown(assistantMessages[currentPageIndex].parsedData?.coachMessage ?? '')"
       />
      </template>
      <template v-else>
       <div
        class="text-sm leading-relaxed [&_strong]:text-primary [&_strong]:font-bold text-foreground/90 font-medium"
        v-html="renderMarkdown(assistantMessages[currentPageIndex].rawContent)"
       />
      </template>

      <!-- Sent data collapsible -->
      <div v-if="assistantMessages[currentPageIndex].requestPayload" class="mt-1">
       <button
        type="button"
        class="flex items-center gap-2 text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
        @click="openRequestPayloads = openRequestPayloads.includes(assistantMessages[currentPageIndex].id) ? openRequestPayloads.filter(id => id !== assistantMessages[currentPageIndex].id) : [...openRequestPayloads, assistantMessages[currentPageIndex].id]"
       >
        <ChevronDown
         class="w-3 h-3 transition-transform"
         :class="openRequestPayloads.includes(assistantMessages[currentPageIndex].id) ? 'rotate-180' : ''"
        />
        Sent Data
       </button>
       <pre
        v-if="openRequestPayloads.includes(assistantMessages[currentPageIndex].id)"
        class="font-mono font-medium text-xs text-muted-foreground/50 bg-muted/20 rounded-xl p-2 overflow-x-auto whitespace-pre-wrap break-all mt-2"
       >{{ assistantMessages[currentPageIndex].requestPayload }}</pre>
      </div>

      <!-- Scratchpad / Reasoning collapsible -->
      <div v-if="assistantMessages[currentPageIndex].parsedData?.scratchpad" class="mt-1">
       <button
        type="button"
        class="flex items-center gap-2 text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
        @click="openScratchpads = openScratchpads.includes(assistantMessages[currentPageIndex].id) ? openScratchpads.filter(id => id !== assistantMessages[currentPageIndex].id) : [...openScratchpads, assistantMessages[currentPageIndex].id]"
       >
        <ChevronDown
         class="w-3 h-3 transition-transform"
         :class="openScratchpads.includes(assistantMessages[currentPageIndex].id) ? 'rotate-180' : ''"
        />
        Reasoning
       </button>
       <pre
        v-if="openScratchpads.includes(assistantMessages[currentPageIndex].id)"
        class="font-mono font-medium text-xs text-muted-foreground/50 bg-muted/20 rounded-xl p-2 overflow-x-auto whitespace-pre-wrap break-all mt-2"
       >{{ assistantMessages[currentPageIndex].parsedData?.scratchpad }}</pre>
      </div>
     </div>
    </div>

   <!-- 2. Workout Plan heading -->
   <div v-if="activeWorkoutGroups?.length" class="mt-1 flex items-center justify-between">
    <h2 class="text-lg font-bold text-foreground">Workout Plan</h2>
   </div>

   <!-- Completed exercises strip -->
   <UiCard v-if="completedExercises.length" variant="list" class="mt-1 shadow-sm opacity-60">
    <div
     v-for="(ex, idx) in completedExercises"
     :key="ex.exerciseName || idx"
     class="relative w-full p-3 pl-4 flex items-center justify-between gap-4 border-b border-border/40 last:border-0"
    >
     <div class="flex items-center gap-4 min-w-0">
      <div class="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
       <CheckCircle2 class="w-4 h-4 text-emerald-500 shrink-0" />
      </div>
      <span class="text-sm font-semibold text-foreground tracking-tight truncate leading-none mt-0.5">{{ ex.exerciseName }}</span>
     </div>
    </div>
   </UiCard>

   <!-- Radial Hero Rest Cooldown -->
   <Transition name="slide-down">
    <div
     v-if="restTimerStore.isResting"
     class="relative w-full rounded-xl border p-4 flex items-center justify-between gap-4 transition-colors duration-300 z-10 shadow-sm"
     :class="restTimerStore.isOvertime ? 'bg-destructive/[0.05] border-destructive/30' : 'bg-primary/[0.02] border-primary/40'"
    >
     <!-- Animated highlight layer -->
     <div 
       class="absolute inset-0 rounded-xl border-2 ring-4 animate-pulse pointer-events-none transition-colors duration-300"
       :class="restTimerStore.isOvertime ? 'border-destructive/50 ring-destructive/20' : 'border-primary/60 ring-primary/20'"
     />

     <div class="relative flex items-center gap-4 z-10 min-w-0">
      <!-- Radial Progress Ring -->
      <div class="relative w-16 h-16 shrink-0 flex items-center justify-center">
       <svg class="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
        <!-- Track -->
        <circle cx="50" cy="50" r="45" class="stroke-muted/20" stroke-width="6" fill="none" />
        <!-- Progress -->
        <circle
         cx="50"
         cy="50"
         r="45"
         class="transition-all duration-1000 ease-linear"
         :class="restTimerStore.isOvertime ? 'stroke-destructive' : 'stroke-primary'"
         stroke-width="6"
         fill="none"
         stroke-linecap="round"
         :stroke-dasharray="283"
         :stroke-dashoffset="283 - (283 * Math.max(0, 100 - cooldownProgressPercent)) / 100"
        />
       </svg>
       <!-- Center Time -->
       <div class="absolute inset-0 flex items-center justify-center">
        <span 
          class="text-base font-bold tabular-nums tracking-tight"
          :class="restTimerStore.isOvertime ? 'text-destructive' : 'text-primary'"
        >
         {{ restTimerStore.formattedTime }}
        </span>
       </div>
      </div>

      <!-- Text Content -->
      <div class="flex flex-col min-w-0 gap-0.5">
       <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 leading-none">Rest Cooldown</span>
       <span 
        class="text-base font-bold truncate mt-0.5 transition-colors duration-300"
        :class="restTimerStore.isOvertime ? 'text-destructive' : 'text-foreground'"
       >
        {{ restTimerStore.isOvertime ? 'Ready to go!' : 'Catch your breath...' }}
       </span>
       <span class="text-xs font-medium text-muted-foreground/50 truncate">
        Target: {{ formatRestDuration(restTimerStore.targetRestSeconds) }}
       </span>
      </div>
     </div>
     
     <!-- Action -->
     <div class="relative z-10 shrink-0">
      <button
       type="button"
       class="text-xs font-semibold uppercase tracking-wider hover:text-primary active:scale-95 transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full px-4 py-2 border border-white/5 bg-white/5"
       :class="restTimerStore.isOvertime ? 'text-destructive-foreground hover:bg-destructive/10 border-destructive/20' : 'text-foreground hover:bg-white/10'"
       @click="restTimerStore.reset()"
      >
       Skip
      </button>
     </div>
    </div>
   </Transition>

   <!-- 3. Remaining workout exercise cards -->
   <div v-if="activeWorkoutGroups?.length" class="flex flex-col gap-3">
    <div
     v-for="(group, gIndex) in activeWorkoutGroups"
     :key="group.id"
     class="w-full"
    >
     <!-- Superset Group -->
     <div
      v-if="group.isSuperset"
      class="relative rounded-xl p-4 flex flex-col gap-3 shadow-sm bg-card border border-border/40"
     >
       <div class="px-1 flex items-center gap-3 opacity-60">
        <span class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Superset</span>
        <div class="h-px flex-1 bg-border/50"></div>
       </div>
      <div class="flex flex-col gap-3">
       <WorkoutExerciseCard
        v-for="(exercise, exIndex) in group.exercises"
        :key="exercise.exerciseName ?? exIndex"
        :exercise="exercise"
        :is-completed="isExerciseCompleted(exercise)"
        :is-highlighted="isHighlighted(gIndex, exIndex)"
        :progress="getExerciseProgress(exercise.exerciseName, exercise.targetSets)"
        heading-level="h4"
        @log="handleLogExercise"
        @search="openGoogleSearch"
       />
      </div>
     </div>

     <!-- Standalone Exercise -->
     <div v-else class="relative flex flex-col gap-3">
      <WorkoutExerciseCard
       v-for="(exercise, exIndex) in group.exercises"
       :key="exercise.exerciseName ?? exIndex"
       :exercise="exercise"
       :is-completed="isExerciseCompleted(exercise)"
       :is-highlighted="isHighlighted(gIndex, exIndex)"
       :progress="getExerciseProgress(exercise.exerciseName, exercise.targetSets)"
       heading-level="h3"
       @log="handleLogExercise"
       @search="openGoogleSearch"
      />
     </div>
    </div>
   </div>

   <!-- Loading State (initial) -->
   <div v-if="aiStore.isLoading && assistantMessages.length === 0" class="flex flex-col items-center justify-center py-20 text-center gap-3">
    <Loader2 class="w-8 h-8 animate-spin text-primary" />
    <p class="text-sm font-bold tracking-tight text-muted-foreground animate-pulse">Analyzing your workouts...</p>
   </div>

   <!-- Empty Fallback -->
   <div v-else-if="!aiStore.isLoading && assistantMessages.length === 0" class="flex flex-col items-center justify-center py-12 text-center opacity-50">
    <Sparkles class="w-10 h-10 mb-3 text-primary" />
    <p class="font-bold text-base">No insights available</p>
    <p class="text-sm text-muted-foreground mt-1 max-w-[260px]">Log some exercises first, then come back for personalized coaching.</p>
   </div>

   <!-- Inline typing indicator (with existing insights) -->
   <div v-if="aiStore.isLoading && assistantMessages.length > 0" class="flex items-center gap-2 text-xs text-muted-foreground/60 animate-pulse py-2 justify-center">
    <Loader2 class="w-3.5 h-3.5 animate-spin text-primary" />
    <span>Coach is thinking...</span>
   </div>
  </div>

  <!-- Q&A Bottom Sheet -->
  <UiBottomSheet v-model:open="isAskSheetOpen" title="Ask AI Coach">
   <div class="flex flex-col gap-6 w-full pb-safe">
    <UiTextarea
     v-model="userQuestion"
     placeholder="Ask a question about your workout, progress, or fatigue..."
     rows="4"
    />
    <UiButton
     type="button"
     size="lg"
     class="w-full"
     :disabled="!userQuestion.trim() || aiStore.isLoading"
     @click="handleAskQuestion"
    >
     <span v-if="aiStore.isLoading">Sending...</span>
     <span v-else>Send Question</span>
    </UiButton>
   </div>
  </UiBottomSheet>

  <!-- Log Exercise Sheet -->
  <LogExerciseSheet
   v-model:open="isLogFormOpen"
   :prefill-data="prefillData"
   :rest-seconds="selectedRestSeconds"
  />
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
.slide-down-enter-active,
.slide-down-leave-active {
 transition: all 0.3s ease-in-out;
}
.slide-down-enter-from,
.slide-down-leave-to {
 transform: translateY(-100%);
 opacity: 0;
}
</style>