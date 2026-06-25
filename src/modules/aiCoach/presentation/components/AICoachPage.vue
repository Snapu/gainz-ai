<script setup lang="ts">
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Copy,
  Play,
  RotateCw,
  Sparkles,
} from "@lucide/vue";
import { LogExerciseSheet } from "@/modules/trainingLogs/presentation";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiSegmentedControl from "@/shared/presentation/components/ui/UiSegmentedControl.vue";
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
  activeTab,
  tabOptions,
  openScratchpads,
  openRequestPayloads,
  coachMessages,
  activeWorkoutGroups,
  activePlan,
  activeSessionIndex,
  currentDayOfWeek,
  isPlanSessionCompleted,
  planDerivedWorkout,
  completedExercises,
  cooldownProgressPercent,
  getExerciseProgress,
  isExerciseCompleted,
  isHighlighted,
  renderMarkdown,
  formatRestDuration,
  formatTime,
  handleLogExercise,
  handleAskQuestion,
  openGoogleSearch,
  regeneratePlan,
  copyPlanJson,
  copyDebugState,
  requestOffDayWorkout,
  getLastSessionSummary,
} = useAICoachPageViewModel();
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col pt-safe relative">
   <!-- Global Progress Bar -->
   <div v-if="aiStore.isLoading" class="fixed top-0 left-0 w-full h-1 bg-muted/20 overflow-hidden z-[100]">
     <div class="h-full bg-primary w-1/2 rounded-full progress-indeterminate"></div>
   </div>
   <!-- Header -->
  <AppHeader>
   <UiButton variant="ghost" size="icon" @click="router.back()">
    <ArrowLeft class="w-5 h-5" />
   </UiButton>
   <div class="flex-1 max-w-[300px] ml-2">
    <UiSegmentedControl
     :options="tabOptions"
     v-model="activeTab"
    />
   </div>
   <div class="w-10"></div>
  </AppHeader>

  <!-- Content Area -->
  <div ref="scrollContainerRef" class="flex-1 overflow-y-auto px-5 pt-4 pb-16 space-y-4 no-scrollbar">

   <!-- TAB: Messages -->
   <template v-if="activeTab === 'messages'">
    <!-- 1. AI Coach Insight Section -->
    <div v-if="coachMessages.length > 0" class="flex flex-col gap-3 relative px-1">
     <!-- Header: timestamp + pager -->
     <div class="flex items-center justify-between gap-3 pb-1">
      <span class="text-xs font-medium text-muted-foreground/60 shrink-0">
       {{ formatTime(coachMessages[currentPageIndex].timestamp) }}
      </span>
      <div v-if="coachMessages.length > 1" class="flex items-center gap-2 bg-muted/10 px-2.5 py-0.5 rounded-full border border-muted/10 shrink-0">
       <button
        type="button"
        class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed p-0.5 active:scale-95 cursor-pointer rounded-full hover:bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
        :disabled="currentPageIndex === 0"
        @click="currentPageIndex--"
       >
        <ChevronLeft class="w-3.5 h-3.5 shrink-0" />
       </button>
       <span class="text-xs font-bold text-muted-foreground min-w-[28px] text-center select-none shrink-0">
        {{ currentPageIndex + 1 }} / {{ coachMessages.length }}
       </span>
       <button
        type="button"
        class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed p-0.5 active:scale-95 cursor-pointer rounded-full hover:bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
        :disabled="currentPageIndex === coachMessages.length - 1"
        @click="currentPageIndex++"
       >
        <ChevronRight class="w-3.5 h-3.5 shrink-0" />
       </button>
      </div>
     </div>

     <!-- Message body -->
     <div class="flex flex-col gap-2">
      <template v-if="coachMessages[currentPageIndex].parsedData">
       <div
        class="text-sm leading-relaxed [&_strong]:text-primary [&_strong]:font-bold text-foreground/90 font-medium"
        v-html="renderMarkdown(coachMessages[currentPageIndex].parsedData?.coachMessage ?? '')"
       />
      </template>
      <template v-else>
       <div
        class="text-sm leading-relaxed [&_strong]:text-primary [&_strong]:font-bold text-foreground/90 font-medium"
        v-html="renderMarkdown(coachMessages[currentPageIndex].rawContent)"
       />
      </template>

      <!-- Sent data collapsible -->
      <div v-if="coachMessages[currentPageIndex].requestPayload" class="mt-1">
       <button
        type="button"
        class="flex items-center gap-2 text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
        @click="openRequestPayloads = openRequestPayloads.includes(coachMessages[currentPageIndex].id) ? openRequestPayloads.filter(id => id !== coachMessages[currentPageIndex].id) : [...openRequestPayloads, coachMessages[currentPageIndex].id]"
       >
        <ChevronDown
         class="w-3 h-3 transition-transform"
         :class="openRequestPayloads.includes(coachMessages[currentPageIndex].id) ? 'rotate-180' : ''"
        />
        Sent Data
       </button>
       <pre
        v-if="openRequestPayloads.includes(coachMessages[currentPageIndex].id)"
        class="font-mono font-medium text-xs text-muted-foreground/50 bg-muted/20 rounded-xl p-2 overflow-x-auto whitespace-pre-wrap break-all mt-2"
       >{{ coachMessages[currentPageIndex].requestPayload }}</pre>
      </div>

      <!-- Scratchpad / Reasoning collapsible -->
      <div v-if="coachMessages[currentPageIndex].parsedData?.scratchpad" class="mt-1">
       <button
        type="button"
        class="flex items-center gap-2 text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
        @click="openScratchpads = openScratchpads.includes(coachMessages[currentPageIndex].id) ? openScratchpads.filter(id => id !== coachMessages[currentPageIndex].id) : [...openScratchpads, coachMessages[currentPageIndex].id]"
       >
        <ChevronDown
         class="w-3 h-3 transition-transform"
         :class="openScratchpads.includes(coachMessages[currentPageIndex].id) ? 'rotate-180' : ''"
        />
        Reasoning
       </button>
       <pre
        v-if="openScratchpads.includes(coachMessages[currentPageIndex].id)"
        class="font-mono font-medium text-xs text-muted-foreground/50 bg-muted/20 rounded-xl p-2 overflow-x-auto whitespace-pre-wrap break-all mt-2"
       >{{ coachMessages[currentPageIndex].parsedData?.scratchpad }}</pre>
      </div>
     </div>
    </div>

    <!-- Loading State (initial) -->
    <div v-if="aiStore.isLoading && coachMessages.length === 0" class="flex flex-col gap-3 py-4 w-full animate-pulse">
      <div class="h-3 w-24 bg-muted/20 rounded"></div>
      <div class="h-4 w-full bg-muted/20 rounded mt-2"></div>
      <div class="h-4 w-[90%] bg-muted/20 rounded"></div>
      <div class="h-4 w-[95%] bg-muted/20 rounded"></div>
      <div class="h-4 w-[60%] bg-muted/20 rounded"></div>
      <div class="h-8 w-24 bg-muted/20 rounded-xl mt-2"></div>
    </div>

    <!-- Empty Fallback -->
    <div v-else-if="!aiStore.isLoading && coachMessages.length === 0" class="flex flex-col items-center justify-center py-12 text-center opacity-50">
     <Sparkles class="w-10 h-10 mb-3 text-primary" />
     <p class="font-bold text-base">No insights available</p>
     <p class="text-sm text-muted-foreground mt-1 max-w-[260px]">Log some exercises first, then come back for personalized coaching.</p>
    </div>

    <!-- Inline typing indicator (with existing insights) -->
    <div v-if="aiStore.isLoading && coachMessages.length > 0" class="flex flex-col gap-3 py-4 w-full animate-pulse mt-4 pt-4 border-t border-border/20">
      <div class="h-3 w-16 bg-muted/20 rounded"></div>
      <div class="h-4 w-[85%] bg-muted/20 rounded mt-1"></div>
      <div class="h-4 w-[60%] bg-muted/20 rounded"></div>
    </div>

    <!-- View Today's Workout -->
    <div v-if="activeWorkoutGroups?.length" class="flex items-center gap-2 mt-4">
     <UiButton
      type="button"
      variant="default"
      size="lg"
      class="flex-1 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
      @click="activeTab = 'today'"
     >
      <Play class="w-4 h-4 mr-2" />
      View Today's Workout
     </UiButton>
    </div>

    <!-- Inline Q&A and Actions -->
    <div class="mt-8 flex flex-col gap-4 border-t border-border/40 pt-6">
     <div class="flex flex-col gap-3">
      <UiTextarea
       v-model="userQuestion"
       placeholder="Ask a question about your workout, progress, or fatigue..."
       rows="3"
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
    </div>
   </template>

   <!-- TAB: Today -->
   <template v-else-if="activeTab === 'today'">
    <template v-if="aiStore.isLoading && !activeWorkoutGroups?.length">
     <!-- Skeleton for Today Tab -->
     <div class="mt-1 flex items-center justify-between gap-4">
      <div class="h-4 w-32 bg-muted/20 animate-pulse rounded"></div>
     </div>
     <div class="flex flex-col gap-3 mt-4">
      <div v-for="i in 3" :key="i" class="w-full p-4 border border-border/40 rounded-xl shadow-sm bg-card animate-pulse">
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
     <!-- Workout Plan heading -->
     <div v-if="activeWorkoutGroups?.length" class="mt-1 flex items-center justify-between gap-4">
      <div class="flex items-center gap-2">
       <h3 class="text-sm font-bold text-foreground">Workout Plan</h3>
      </div>
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
       <span class="text-sm font-medium text-foreground tracking-tight truncate leading-none mt-0.5">{{ ex.exerciseName }}</span>
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

    <!-- Remaining workout exercise cards -->
    <div v-if="activeWorkoutGroups?.length" class="flex flex-col gap-3">
     <div
      v-for="(group, gIndex) in activeWorkoutGroups"
      :key="group.id"
      class="w-full"
     >
      <!-- Superset Group -->
      <div
       v-if="group.isSuperset"
       class="relative flex flex-col gap-3"
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
         :last-session-summary="getLastSessionSummary(exercise.exerciseName)"
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
        :last-session-summary="getLastSessionSummary(exercise.exerciseName)"
        heading-level="h3"
        @log="handleLogExercise"
        @search="openGoogleSearch"
       />
      </div>
     </div>
    </div>
    
    <div v-else-if="!activeWorkoutGroups?.length && completedExercises.length" class="flex flex-col items-center justify-center py-12 text-center opacity-50">
     <CheckCircle2 class="w-10 h-10 mb-3 text-emerald-500" />
     <p class="font-bold text-base">Workout Complete!</p>
     <p class="text-sm text-muted-foreground mt-1 max-w-[260px]">You have finished all exercises for today's session.</p>
    </div>
    <!-- Rest day state (plan exists, but no session for today) -->
    <div
     v-else-if="activePlan && !planDerivedWorkout?.length"
     class="flex flex-col items-center justify-center py-12 text-center opacity-50"
    >
     <Coffee class="w-10 h-10 mb-3 text-primary" />
     <p class="font-bold text-base">Rest Day</p>
     <p class="text-sm text-muted-foreground mt-1 max-w-[260px]">No training scheduled for today. Recover well!
     </p>
     <div class="flex gap-2 mt-4">
       <UiButton
        variant="ghost"
        size="sm"
        class="text-xs"
        @click="activeTab = 'plan'"
       >
        View Plan
       </UiButton>
       <UiButton
        variant="default"
        size="sm"
        class="text-xs"
        @click="requestOffDayWorkout"
       >
        Train Anyway
       </UiButton>
     </div>
    </div>
    <!-- No plan at all -->
    <div v-else class="flex flex-col items-center justify-center py-12 text-center opacity-50">
     <Sparkles class="w-10 h-10 mb-3 text-primary" />
     <p class="font-bold text-base">No active workout</p>
     <p class="text-sm text-muted-foreground mt-1 max-w-[260px]">Ask the Coach for a recommendation to start.</p>
    </div>
   </template>
   </template>

   <!-- TAB: Plan -->
   <template v-else-if="activeTab === 'plan'">
    <template v-if="aiStore.isLoading && !activePlan">
     <!-- Skeleton for Plan Tab -->
     <div class="flex items-center justify-between gap-4 mb-4">
      <div class="h-4 w-40 bg-muted/20 animate-pulse rounded"></div>
      <div class="h-8 w-24 bg-muted/20 animate-pulse rounded"></div>
     </div>
     <div class="flex flex-col gap-4 w-full">
      <div v-for="i in 3" :key="i" class="rounded-xl border border-border/50 bg-card p-3 animate-pulse">
       <div class="h-4 w-32 bg-muted/20 rounded mb-2"></div>
       <div class="h-3 w-48 bg-muted/20 rounded mb-4"></div>
       <div class="h-20 bg-muted/20 rounded w-full"></div>
      </div>
     </div>
    </template>
    <template v-else>
     <div v-if="activePlan" class="flex flex-col gap-4">
      <div class="flex items-center justify-between gap-4">
       <div class="flex items-center gap-2">
       <h3 class="text-sm font-bold text-foreground">Current Training Cycle</h3>
       <UiBadge variant="surface" class="uppercase tracking-wider whitespace-nowrap">{{ activePlan.cycleWeeks }} Week(s)</UiBadge>
      </div>
      <UiButton
       variant="outline"
       size="sm"
       class="shrink-0 h-8 text-xs font-semibold"
       :disabled="aiStore.isLoading"
       @click="regeneratePlan"
       >
        <RotateCw class="w-3.5 h-3.5 mr-1.5" />
        New Plan
       </UiButton>
      </div>
      
      <div class="flex flex-col gap-4 w-full">
       <div v-for="(session, sIdx) in activePlan.sessions" :key="sIdx" 
           class="rounded-xl overflow-hidden border border-border/50 transition-opacity" 
           :class="{ 
             'bg-primary/5 ring-1 ring-primary/20': sIdx === activeSessionIndex, 
             'bg-card': sIdx !== activeSessionIndex,
             'opacity-60': isPlanSessionCompleted(session.weekNumber, session.dayOfWeek)
           }">
       <div class="p-3">
        <h4 class="font-bold text-sm text-foreground mb-0.5 flex items-center gap-2">
          {{ session.sessionLabel }} 
          <span class="text-xs text-muted-foreground font-medium">Week {{ session.weekNumber }}</span>
          <UiBadge v-if="isPlanSessionCompleted(session.weekNumber, session.dayOfWeek)" variant="outline" class="uppercase tracking-wider ml-auto text-primary border-primary/30 bg-primary/5">
           <CheckCircle2 class="w-3 h-3 mr-1" /> Done
          </UiBadge>
          <UiBadge v-else-if="sIdx === activeSessionIndex" variant="default" class="uppercase tracking-wider ml-auto">
           {{ session.dayOfWeek === currentDayOfWeek ? 'Today' : 'Next' }}
          </UiBadge>
        </h4>
        <p class="text-xs text-muted-foreground mb-3 pb-1 border-b border-border/50">{{ session.focusDescription }}</p>
        <div class="w-full overflow-x-auto">
        <table class="w-full text-sm text-left">
         <thead>
          <tr class="text-muted-foreground/80 border-b border-border/50 text-xs uppercase tracking-wider">
           <th class="font-medium py-1.5 pr-2 w-1/2">Exercise</th>
           <th class="font-medium py-1.5 px-2 text-center">Sets</th>
           <th class="font-medium py-1.5 px-2 text-center">Reps</th>
           <th class="font-medium py-1.5 pl-2 text-right">Rest</th>
          </tr>
         </thead>
         <tbody class="divide-y divide-border/30">
          <tr v-for="(ex, exIdx) in session.exercises" :key="exIdx" class="text-foreground/90">
           <td class="py-2 pr-2 font-medium leading-tight">
            {{ ex.exerciseName }}
            <UiBadge v-if="ex.supersetId" variant="surface" class="ml-1 uppercase tracking-wider">SS:{{ ex.supersetId }}</UiBadge>
           </td>
           <td class="py-2 px-2 whitespace-nowrap text-center">{{ ex.targetSets }}</td>
           <td class="py-2 px-2 whitespace-nowrap text-center">{{ ex.targetReps }}</td>
           <td class="py-2 pl-2 text-right whitespace-nowrap text-muted-foreground">{{ ex.restSeconds }}s</td>
          </tr>
         </tbody>
        </table>
       </div>
       </div>
      </div>
     </div>

     <!-- Debug Buttons -->
     <div class="flex gap-2 mt-2">
       <UiButton
        variant="ghost"
        size="sm"
        class="text-muted-foreground flex-1 border border-border/40 border-dashed hover:bg-muted/30"
        @click="copyPlanJson"
       >
        <Copy class="w-3.5 h-3.5 mr-2 opacity-70" />
        Copy Plan
       </UiButton>
       <UiButton
        variant="ghost"
        size="sm"
        class="text-muted-foreground flex-1 border border-border/40 border-dashed hover:bg-muted/30"
        @click="copyDebugState"
       >
        <Copy class="w-3.5 h-3.5 mr-2 opacity-70" />
        Copy Debug
       </UiButton>
     </div>
    </div>
    
    <div v-else class="flex flex-col items-center justify-center py-12 text-center opacity-50">
     <Sparkles class="w-10 h-10 mb-3 text-primary" />
     <p class="font-bold text-base">No Training Plan</p>
     <p class="text-sm text-muted-foreground mt-1 max-w-[260px]">Ask the Coach to generate a new Mesocycle plan for you.</p>
     <UiButton
      variant="outline"
      class="mt-4"
      :disabled="aiStore.isLoading"
      @click="regeneratePlan"
     >
      <RotateCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': aiStore.isLoading }" />
      Generate Plan
     </UiButton>
    </div>
    </template>
   </template>

  </div>

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
.progress-indeterminate {
 animation: indeterminate 1.5s infinite linear;
}
@keyframes indeterminate {
 0% { transform: translateX(-100%); }
 100% { transform: translateX(200%); }
}
</style>