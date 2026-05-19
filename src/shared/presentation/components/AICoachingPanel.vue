<script setup lang="ts">
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Gauge,
  Loader2,
  Repeat,
  Search,
  Sparkles,
  Trash2,
  X,
} from "@lucide/vue";
import { useDebounceFn, useTimeAgo } from "@vueuse/core";
import DOMPurify from "dompurify";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import type { AiResponseData } from "@/modules/aiCoach/presentation";
import { useAiStore } from "@/modules/aiCoach/presentation";
import { resolveCurrentSession, useExerciseLogsStore } from "@/modules/trainingLogs/presentation";
import {
  uiIconButtonClass,
  uiSelectableItemClass,
} from "@/shared/presentation/components/ui/styles";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiBottomSheet from "@/shared/presentation/components/ui/UiBottomSheet.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiInput from "@/shared/presentation/components/ui/UiInput.vue";
import { useKeyboardHeight } from "@/shared/presentation/composables/useKeyboardHeight";
import { useToast } from "@/shared/presentation/composables/useToast";
import { cn } from "@/shared/presentation/lib/utils";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  (e: "update:open", val: boolean): void;
  (
    e: "log-exercise",
    data: { exerciseName: string; reps?: number; weight?: number; rpe?: number },
  ): void;
}>();

const aiStore = useAiStore();
const exerciseLogsStore = useExerciseLogsStore();
const { toast } = useToast();

const internalOpen = computed({
  get: () => props.open,
  set: (val) => emit("update:open", val),
});

onMounted(() => {
  aiStore.initialize();
  if (props.open) {
    startTracking();
  }
});

// Auto-fetch insights when the panel opens
const debouncedAskAi = useDebounceFn(() => {
  aiStore.askAi().then((result) => {
    if (result.isErr()) {
      const description =
        result.error === "missing-api-key"
          ? "No API Key configured! Please add one in your profile."
          : "Failed to get AI response. Please try again.";

      toast({
        title: "AI Coaching Error",
        description,
        variant: "destructive",
      });
    } else {
      scrollToTop();
    }
  });
}, 500);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      if (assistantMessages.value.length === 0) {
        debouncedAskAi();
      }
      scrollToTop();
      startTracking();
    } else {
      stopTracking();
    }
  },
);

function tryParseAiResponse(content: string): AiResponseData | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed.coachMessage === "string") {
      return parsed as AiResponseData;
    }
    return null;
  } catch {
    return null;
  }
}

interface DisplayExercise {
  exerciseName: string;
  targetSets: number;
  targetReps: string;
  targetWeight?: string;
  targetRpe?: number;
  notes?: string;
  supersetId?: string;
}

interface DisplayWorkoutGroup {
  id: string;
  isSuperset: boolean;
  exercises: DisplayExercise[];
}

function groupWorkout(workout: DisplayExercise[] | undefined): DisplayWorkoutGroup[] | null {
  if (!workout || workout.length === 0) return null;
  const groups: DisplayWorkoutGroup[] = [];

  workout.forEach((ex) => {
    if (ex.supersetId) {
      const existing = groups.find((g) => g.isSuperset && g.id === ex.supersetId);
      if (existing) {
        existing.exercises.push(ex);
      } else {
        groups.push({ id: ex.supersetId, isSuperset: true, exercises: [ex] });
      }
    } else {
      groups.push({ id: crypto.randomUUID(), isSuperset: false, exercises: [ex] });
    }
  });
  return groups;
}

interface DisplayInsight {
  id: string;
  timestamp: Date;
  isLatest: boolean;
  rawContent: string;
  parsedData: AiResponseData | null;
  requestPayload: string | null;
}

const assistantMessages = computed<DisplayInsight[]>(() => {
  const allMessages = aiStore.messages;
  const indexById = new Map(allMessages.map((m, i) => [m.id, i]));
  const assistantMsgs = allMessages.filter((m) => m.role === "assistant");

  return assistantMsgs.map((msg, idx) => {
    const parsedData = tryParseAiResponse(msg.content);
    const msgIndex = indexById.get(msg.id);
    const previous =
      typeof msgIndex === "number" && msgIndex > 0 ? allMessages[msgIndex - 1] : null;
    const requestPayload =
      previous?.role === "user" && previous.content && previous.content !== "AI request"
        ? previous.content
        : null;

    return {
      id: msg.id,
      timestamp: msg.timestamp,
      isLatest: idx === assistantMsgs.length - 1,
      rawContent: msg.content,
      parsedData,
      requestPayload,
    };
  });
});

const currentPageIndex = ref(0);

watch(
  () => assistantMessages.value.length,
  (newLength) => {
    if (newLength > 0) {
      currentPageIndex.value = newLength - 1;
    }
  },
  { immediate: true },
);

const completedSetsMap = computed<Map<string, number>>(() => {
  const currentLogs = resolveCurrentSession(exerciseLogsStore.exerciseLogs)?.logs || [];
  const map = new Map<string, number>();
  for (const log of currentLogs) {
    map.set(log.exerciseName, (map.get(log.exerciseName) || 0) + 1);
  }
  return map;
});

const activeWorkout = computed<DisplayExercise[] | null>(() => {
  const assistantMessages = aiStore.messages
    .filter((m) => m.role === "assistant")
    .slice()
    .reverse();

  for (const msg of assistantMessages) {
    const parsed = tryParseAiResponse(msg.content);
    if (parsed?.recommendedWorkout && parsed.recommendedWorkout.length > 0) {
      return parsed.recommendedWorkout as DisplayExercise[];
    }
  }
  return null;
});

const activeWorkoutGroups = computed<DisplayWorkoutGroup[] | null>(() => {
  return groupWorkout(activeWorkout.value || undefined);
});

const overallProgress = computed(() => {
  const workout = activeWorkout.value;
  if (!workout || workout.length === 0) {
    return { completed: 0, total: 0, percent: 0 };
  }

  let completed = 0;
  let total = 0;

  for (const ex of workout) {
    const target = ex.targetSets;
    const done = completedSetsMap.value.get(ex.exerciseName) || 0;
    completed += Math.min(target, done);
    total += target;
  }

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percent };
});

function getExerciseProgress(exerciseName: string, targetSets: number) {
  const done = completedSetsMap.value.get(exerciseName) || 0;
  const isCompleted = done >= targetSets;
  const progressPercent = Math.min(100, Math.round((done / targetSets) * 100));
  return { done, isCompleted, progressPercent };
}

const openScratchpads = ref<string[]>([]);
const openRequestPayloads = ref<string[]>([]);

function formatTime(d: Date) {
  return useTimeAgo(d).value;
}

// Simple safe markdown parser
function renderMarkdown(text: string) {
  let html = text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n\n/g, '</p><p class="mt-3">')
    .replace(/\n/g, "<br/>");
  return DOMPurify.sanitize(`<p>${html}</p>`, { ALLOWED_TAGS: ["p", "strong", "em", "br"] });
}
function parseWeight(targetWeight?: string): number | undefined {
  if (!targetWeight) return undefined;
  // Handle both "52.5kg" and "52,5kg" (locale-dependent decimal separator)
  const match = targetWeight.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  return match?.[1] ? parseFloat(match[1].replace(",", ".")) : undefined;
}

function parseFirstRep(targetReps?: string): number | undefined {
  if (!targetReps) return undefined;
  // "8-12" → 12 (aim for the high end), "10" → 10
  const rangeMatch = targetReps.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch?.[2]) return parseInt(rangeMatch[2], 10);
  const singleMatch = targetReps.match(/(\d+)/);
  return singleMatch?.[1] ? parseInt(singleMatch[1], 10) : undefined;
}

function splitWeight(weightStr?: string): { value: string; unit: string } {
  if (!weightStr) return { value: "", unit: "" };
  const match = weightStr.match(/^([\d.,]+)\s*(.*)$/);
  if (match) {
    return {
      value: match[1],
      unit: match[2] || "kg",
    };
  }
  return { value: weightStr, unit: "kg" };
}

function handleLogExercise(exercise: DisplayExercise) {
  emit("log-exercise", {
    exerciseName: exercise.exerciseName,
    reps: parseFirstRep(exercise.targetReps),
    weight: parseWeight(exercise.targetWeight),
    rpe: exercise.targetRpe,
  });
  emit("update:open", false);
}

function clearAndReset() {
  aiStore.clearMessages();
  debouncedAskAi();
}

const scrollContainerRef = ref<HTMLDivElement | null>(null);

function scrollToTop() {
  nextTick(() => {
    if (scrollContainerRef.value) {
      scrollContainerRef.value.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}

watch(
  () => assistantMessages.value.length,
  (newLength, oldLength) => {
    if (newLength > (oldLength || 0)) {
      scrollToTop();
    }
  },
);

const userQuestion = ref("");

const { keyboardHeight, startTracking, stopTracking } = useKeyboardHeight();

const formStyle = computed(() => {
  return keyboardHeight.value > 0 ? { paddingBottom: `${keyboardHeight.value + 12}px` } : {};
});

function handleAskQuestion() {
  const question = userQuestion.value.trim();
  if (!question) return;

  userQuestion.value = ""; // Clear immediately for responsive mobile UX

  aiStore.askAi(question).then((result) => {
    if (result.isErr()) {
      userQuestion.value = question; // Restore on error so user doesn't lose typed text
      toast({
        title: "Error",
        description: "Failed to send question.",
        variant: "destructive",
      });
    } else {
      scrollToTop();
    }
  });
}
</script>

<template>
  <UiBottomSheet v-model:open="internalOpen" title="AI Coach" content-class="p-0 gap-0 overflow-hidden flex flex-col max-h-[85vh]">
    <template #header>
      <div class="flex items-center justify-between p-6 pb-2">
        <span class="text-2xl font-bold tracking-tight">AI Coach</span>
        <div class="flex items-center gap-1">
          <button
            type="button"
            :class="uiIconButtonClass"
            @click="internalOpen = false"
          >
            <X class="w-5 h-5 text-muted-foreground" />
            <span class="sr-only">Close</span>
          </button>
        </div>
      </div>
    </template>
    <div ref="scrollContainerRef" class="flex-1 overflow-y-auto px-6 pb-4 space-y-4 no-scrollbar">

      <!-- Top Paged Coach Message Card -->
      <UiCard v-if="assistantMessages.length > 0" class="p-5 flex flex-col gap-3 relative overflow-hidden bg-card/60">
        <!-- Header row -->
        <div class="flex items-center justify-between border-b border-white/5 pb-2">
          <div class="flex items-center gap-2">
            <Sparkles class="w-3.5 h-3.5 text-primary shrink-0" />
            <span class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Coach</span>
          </div>
          
          <!-- Pager Controls -->
          <div v-if="assistantMessages.length > 1" class="flex items-center gap-2 bg-white/5 px-2.5 py-0.5 rounded-full border border-white/5 shrink-0">
            <button
              type="button"
              class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-30 disabled:pointer-events-none disabled:cursor-not-allowed p-0.5 active:scale-95 cursor-pointer rounded-full hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
              :disabled="currentPageIndex === 0"
              @click="currentPageIndex--"
            >
              <ChevronLeft class="w-3.5 h-3.5 shrink-0" />
            </button>
            <span class="text-[10px] font-bold text-muted-foreground min-w-[28px] text-center select-none font-medium shrink-0">
              {{ currentPageIndex + 1 }} / {{ assistantMessages.length }}
            </span>
            <button
              type="button"
              class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-30 disabled:pointer-events-none disabled:cursor-not-allowed p-0.5 active:scale-95 cursor-pointer rounded-full hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
              :disabled="currentPageIndex === assistantMessages.length - 1"
              @click="currentPageIndex++"
            >
              <ChevronRight class="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>
        </div>

        <!-- Message Body -->
        <div class="flex flex-col gap-2">
          <template v-if="assistantMessages[currentPageIndex].parsedData">
            <div 
              class="text-sm leading-relaxed [&_strong]:text-primary [&_strong]:font-bold text-foreground/90 font-medium"
              v-html="renderMarkdown(assistantMessages[currentPageIndex].parsedData?.coachMessage ?? '')"
            />
          </template>
          
          <!-- Legacy Fallback -->
          <template v-else>
            <div 
              class="text-sm leading-relaxed [&_strong]:text-primary [&_strong]:font-bold text-foreground/90 font-medium"
              v-html="renderMarkdown(assistantMessages[currentPageIndex].rawContent)"
            />
          </template>

          <!-- Sent data collapsible for active message -->
          <div v-if="assistantMessages[currentPageIndex].requestPayload" class="mt-1">
            <button
              type="button"
              class="flex items-center gap-1 text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
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
              class="text-xs text-muted-foreground/50 bg-muted/20 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all mt-1.5"
            >{{ assistantMessages[currentPageIndex].requestPayload }}</pre>
          </div>

          <!-- Scratchpad collapsible for active message -->
          <div v-if="assistantMessages[currentPageIndex].parsedData?.scratchpad" class="mt-1">
            <button
              type="button"
              class="flex items-center gap-1 text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
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
              class="text-xs text-muted-foreground/50 bg-muted/20 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all mt-1.5"
            >{{ assistantMessages[currentPageIndex].parsedData?.scratchpad }}</pre>
          </div>
        </div>
      </UiCard>

      <!-- Pinned Workout HUD Singleton -->
      <div v-if="activeWorkoutGroups?.length" class="flex flex-col gap-4">
        <!-- Daily Progress Header Card -->
        <UiCard class="p-5 flex flex-col gap-4 relative overflow-hidden bg-card/60">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Dumbbell class="w-5 h-5 text-primary animate-pulse" />
              <span class="text-sm font-bold tracking-tight text-foreground">Workout-Fortschritt</span>
            </div>
            <span class="text-sm font-bold text-primary">{{ overallProgress.completed }} / {{ overallProgress.total }} Sätze geschafft</span>
          </div>
          
          <!-- Sleek, Glowing Global Progress Bar -->
          <div class="h-2 w-full bg-white/10 rounded-full overflow-hidden relative">
            <div 
              class="h-full bg-primary rounded-full transition-all duration-300 shadow-[0_0_8px_var(--color-primary)]"
              :style="{ width: `${overallProgress.percent}%` }"
            />
          </div>
        </UiCard>

        <!-- Exercises Pinned Layout -->
        <div class="flex flex-col gap-3">
          <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 mb-0.5 ml-1">Today's Workout</p>
          
          <div class="flex flex-col gap-3">
            <div 
              v-for="group in activeWorkoutGroups" 
              :key="group.id"
              class="w-full"
            >
              <!-- Superset Group -->
              <div 
                v-if="group.isSuperset" 
                class="relative border border-primary/20 bg-primary/[0.02] rounded-xl p-4 flex flex-col gap-3 shadow-sm"
              >
                <!-- Superset Badge inside the card -->
                <div class="px-1 flex">
                  <UiBadge variant="default" class="gap-1.5 px-2.5 py-0.5 text-xs font-semibold tracking-wider uppercase">
                    <Sparkles class="w-3.5 h-3.5 text-primary-foreground animate-pulse" />
                    Superset Link
                  </UiBadge>
                </div>

                <!-- Exercises in Superset -->
                <div class="flex flex-col gap-3">
                  <div
                    v-for="exercise in group.exercises"
                    :key="exercise.exerciseName"
                    class="relative flex flex-col"
                  >
                    <UiCard
                      as="button"
                      type="button"
                      class="w-full text-left p-4 flex flex-col gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-all duration-300"
                      :class="[
                        getExerciseProgress(exercise.exerciseName, exercise.targetSets).isCompleted 
                          ? 'opacity-55 scale-98' 
                          : ''
                      ]"
                      @click="handleLogExercise(exercise)"
                    >
                      <div class="flex flex-col gap-3 w-full">
                        <!-- Top row: Exercise Title & Search button -->
                        <div class="flex items-start justify-between gap-3 w-full">
                          <div class="flex items-center gap-2 min-w-0">
                            <!-- Bullet vs Green Checked circle icon -->
                            <CheckCircle2 
                              v-if="getExerciseProgress(exercise.exerciseName, exercise.targetSets).isCompleted"
                              class="w-4 h-4 text-primary shrink-0 transition-all" 
                            />
                            <span 
                              v-else
                              class="w-1.5 h-1.5 rounded-full bg-primary shrink-0 animate-pulse" 
                            />
                            <h4 
                              class="text-sm font-bold tracking-tight text-foreground break-words leading-tight transition-all"
                              :class="[
                                getExerciseProgress(exercise.exerciseName, exercise.targetSets).isCompleted 
                                  ? 'line-through text-muted-foreground font-medium' 
                                  : ''
                              ]"
                            >
                              {{ exercise.exerciseName }}
                            </h4>
                          </div>

                          <!-- Search Icon Button -->
                          <a
                            :href="`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(exercise.exerciseName + ' exercise')}`"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="p-1.5 text-muted-foreground/40 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full cursor-pointer hover:bg-white/5 shrink-0"
                            title="Search Images"
                            @click.stop
                          >
                            <Search class="w-3.5 h-3.5" />
                            <span class="sr-only">Search images</span>
                          </a>
                        </div>

                        <!-- Bottom row: Metrics Tag Capsules -->
                        <div class="flex flex-wrap items-center gap-2">
                          <!-- Reps Card -->
                          <UiBadge variant="outline" class="gap-1.5 px-2.5 py-1 bg-white/5 border-white/5 text-xs font-semibold text-foreground/90 shrink-0">
                            <Repeat class="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                            <span>{{ exercise.targetSets }}<span class="text-muted-foreground/50 font-medium mx-0.5">×</span>{{ exercise.targetReps }}<span class="text-muted-foreground/50 font-medium ml-1">reps</span></span>
                          </UiBadge>
                          
                          <!-- Weight Card -->
                          <UiBadge v-if="exercise.targetWeight" variant="outline" class="gap-1.5 px-2.5 py-1 bg-white/5 border-white/5 text-xs font-semibold text-foreground/90 shrink-0">
                            <Dumbbell class="w-3.5 h-3.5 text-primary/70 shrink-0" />
                            <span>{{ splitWeight(exercise.targetWeight).value }}<span class="text-muted-foreground/50 font-medium ml-0.5">{{ splitWeight(exercise.targetWeight).unit }}</span></span>
                          </UiBadge>
                          
                          <!-- RPE Card -->
                          <UiBadge v-if="exercise.targetRpe" variant="outline" class="gap-1.5 px-2.5 py-1 bg-white/5 border-white/5 text-xs font-semibold text-foreground/90 shrink-0">
                            <Gauge class="w-3.5 h-3.5 text-amber-500/70 shrink-0" />
                            <span><span class="text-muted-foreground/50 font-medium mr-1">RPE</span>{{ exercise.targetRpe }}</span>
                          </UiBadge>
                        </div>
                      </div>

                      <div v-if="exercise.notes" class="text-xs text-muted-foreground font-medium italic leading-relaxed bg-white/5 border border-white/5 px-3 py-2 rounded-lg w-full">
                        {{ exercise.notes }}
                      </div>

                      <!-- Absolute Bottom Progress Glide -->
                      <div class="absolute bottom-0 left-0 right-0 h-1 bg-white/5 overflow-hidden">
                        <div 
                          class="h-full bg-primary transition-all duration-300"
                          :style="{ width: `${getExerciseProgress(exercise.exerciseName, exercise.targetSets).progressPercent}%` }"
                        />
                      </div>
                    </UiCard>
                  </div>
                </div>
              </div>

              <!-- Standalone Exercise Card -->
              <div 
                v-else
                class="relative flex flex-col gap-3"
              >
                <UiCard
                  as="button"
                  type="button"
                  class="w-full text-left p-4 flex flex-col gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-all duration-300"
                  :class="[
                    getExerciseProgress(exercise.exerciseName, exercise.targetSets).isCompleted 
                      ? 'opacity-55 scale-98' 
                      : ''
                  ]"
                  @click="handleLogExercise(exercise)"
                  v-for="exercise in group.exercises"
                  :key="exercise.exerciseName"
                >
                  <div class="flex flex-col gap-3 w-full">
                    <!-- Top row: Exercise Title & Search button -->
                    <div class="flex items-start justify-between gap-3 w-full">
                      <div class="flex items-center gap-2 min-w-0">
                        <!-- Bullet vs Green Checked circle icon -->
                        <CheckCircle2 
                          v-if="getExerciseProgress(exercise.exerciseName, exercise.targetSets).isCompleted"
                          class="w-4 h-4 text-primary shrink-0 transition-all" 
                        />
                        <span 
                          v-else
                          class="w-1.5 h-1.5 rounded-full bg-primary shrink-0 animate-pulse" 
                        />
                        <h3 
                          class="text-sm font-bold tracking-tight text-foreground break-words leading-tight transition-all"
                          :class="[
                            getExerciseProgress(exercise.exerciseName, exercise.targetSets).isCompleted 
                              ? 'line-through text-muted-foreground font-medium' 
                              : ''
                          ]"
                        >
                          {{ exercise.exerciseName }}
                        </h3>
                      </div>

                      <!-- Search Icon Button -->
                      <a
                        :href="`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(exercise.exerciseName + ' exercise')}`"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="p-1.5 text-muted-foreground/40 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full cursor-pointer hover:bg-white/5 shrink-0"
                        title="Search Images"
                        @click.stop
                      >
                        <Search class="w-3.5 h-3.5" />
                        <span class="sr-only">Search images</span>
                      </a>
                    </div>

                    <!-- Bottom row: Metrics Tag Capsules -->
                    <div class="flex flex-wrap items-center gap-2">
                      <!-- Reps Card -->
                      <UiBadge variant="outline" class="gap-1.5 px-2.5 py-1 bg-white/5 border-white/5 text-xs font-semibold text-foreground/90 shrink-0">
                        <Repeat class="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                        <span>{{ exercise.targetSets }}<span class="text-muted-foreground/50 font-medium mx-0.5">×</span>{{ exercise.targetReps }}<span class="text-muted-foreground/50 font-medium ml-1">reps</span></span>
                      </UiBadge>
                      
                      <!-- Weight Card -->
                      <UiBadge v-if="exercise.targetWeight" variant="outline" class="gap-1.5 px-2.5 py-1 bg-white/5 border-white/5 text-xs font-semibold text-foreground/90 shrink-0">
                        <Dumbbell class="w-3.5 h-3.5 text-primary/70 shrink-0" />
                        <span>{{ splitWeight(exercise.targetWeight).value }}<span class="text-muted-foreground/50 font-medium ml-0.5">{{ splitWeight(exercise.targetWeight).unit }}</span></span>
                      </UiBadge>
                      
                      <!-- RPE Card -->
                      <UiBadge v-if="exercise.targetRpe" variant="outline" class="gap-1.5 px-2.5 py-1 bg-white/5 border-white/5 text-xs font-semibold text-foreground/90 shrink-0">
                        <Gauge class="w-3.5 h-3.5 text-amber-500/70 shrink-0" />
                        <span><span class="text-muted-foreground/50 font-medium mr-1">RPE</span>{{ exercise.targetRpe }}</span>
                      </UiBadge>
                    </div>
                  </div>

                  <div v-if="exercise.notes" class="text-xs text-muted-foreground font-medium italic leading-relaxed bg-white/5 border border-white/5 px-3 py-2 rounded-lg w-full">
                    {{ exercise.notes }}
                  </div>

                  <!-- Absolute Bottom Progress Glide -->
                  <div class="absolute bottom-0 left-0 right-0 h-1 bg-white/5 overflow-hidden">
                    <div 
                      class="h-full bg-primary transition-all duration-300"
                      :style="{ width: `${getExerciseProgress(exercise.exerciseName, exercise.targetSets).progressPercent}%` }"
                    />
                  </div>
                </UiCard>
              </div>
            </div>
          </div>
          
          <div class="mt-2 px-1 flex gap-2 items-start text-xs text-muted-foreground font-medium leading-relaxed">
            <span class="text-primary font-bold shrink-0">💡 Coach-Tipp:</span>
            <span>Wähle ein Gewicht, um die Ziel-RPE innerhalb des Bereichs zu treffen. Deine Wiederholungen sinken natürlicherweise von Satz zu Satz durch Ermüdung. Erhöhe das Gewicht erst, wenn du in allen Sätzen das Limit erreachst.</span>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="aiStore.isLoading && assistantMessages.length === 0" class="flex flex-col items-center justify-center py-10 text-center gap-3">
        <Loader2 class="w-8 h-8 animate-spin text-primary" />
        <p class="text-sm font-bold tracking-tight text-muted-foreground animate-pulse">Analyzing your workouts...</p>
      </div>

      <!-- Empty Fallback (no insights and not loading) -->
      <div v-else-if="!aiStore.isLoading && assistantMessages.length === 0" class="flex flex-col items-center justify-center py-12 text-center opacity-50">
        <Sparkles class="w-10 h-10 mb-3 text-primary" />
        <p class="font-bold text-base">No insights available</p>
        <p class="text-sm text-muted-foreground mt-1 max-w-[260px]">Log some exercises first, then come back for personalized coaching.</p>
      </div>

      <!-- Inline Typing / Loading State (with existing insights) -->
      <div v-if="aiStore.isLoading && assistantMessages.length > 0" class="flex items-center gap-2 text-xs text-muted-foreground/60 animate-pulse py-2 justify-center">
        <Loader2 class="w-3.5 h-3.5 animate-spin text-primary" />
        <span>Coach is thinking...</span>
      </div>

      <!-- Clear History Button at the bottom of the list -->
      <div v-if="assistantMessages.length > 0 && !aiStore.isLoading" class="pt-6 pb-2 flex justify-center gap-2 flex-wrap">
        <UiButton
          variant="outline"
          size="sm"
          class="text-xs text-primary border-primary/20 hover:border-primary hover:bg-primary/10 gap-2 rounded-full px-4 active:scale-95 transition-all cursor-pointer font-medium"
          @click="debouncedAskAi"
        >
          <Sparkles class="w-3.5 h-3.5" />
          Request New Feedback
        </UiButton>
        
        <UiButton
          variant="outline"
          size="sm"
          class="text-xs text-destructive border-destructive/20 hover:border-destructive hover:bg-destructive/10 gap-2 rounded-full px-4 active:scale-95 transition-all cursor-pointer font-medium"
          @click="clearAndReset"
        >
          <Trash2 class="w-3.5 h-3.5" />
          Clear Conversation History
        </UiButton>
      </div>

    </div>

    <!-- Sticky Q&A Input Bar -->
    <form
      @submit.prevent="handleAskQuestion"
      class="p-6 pt-4 border-t border-white/5 bg-background/95 backdrop-blur-xl flex gap-2 items-center shrink-0 pb-safe transition-[padding-bottom] duration-200"
      :style="formStyle"
    >
      <UiInput
        v-model="userQuestion"
        placeholder="Ask a question..."
        class="flex-1"
      />
      <UiButton
        type="submit"
        size="sm"
        class="shrink-0"
        :disabled="!userQuestion.trim() || aiStore.isLoading"
      >
        Send
      </UiButton>
    </form>
  </UiBottomSheet>
</template>
