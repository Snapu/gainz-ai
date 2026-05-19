<script setup lang="ts">
import { ChevronDown, Loader2, Search, Sparkles, Trash2, X } from "@lucide/vue";
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
import UiBottomSheet from "@/shared/presentation/components/ui/UiBottomSheet.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiInput from "@/shared/presentation/components/ui/UiInput.vue";
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
      debouncedAskAi();
      scrollToTop();
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
  groupedWorkout: DisplayWorkoutGroup[] | null;
  requestPayload: string | null;
}

const allInsights = computed<DisplayInsight[]>(() => {
  const allMessages = aiStore.messages;
  const indexById = new Map(allMessages.map((m, i) => [m.id, i]));
  const reversed = allMessages
    .filter((m) => m.role === "assistant")
    .slice()
    .reverse();

  const currentLogs = resolveCurrentSession(exerciseLogsStore.exerciseLogs)?.logs || [];
  const completedSetsByExercise = new Map<string, number>();
  for (const log of currentLogs) {
    completedSetsByExercise.set(
      log.exerciseName,
      (completedSetsByExercise.get(log.exerciseName) || 0) + 1,
    );
  }

  return reversed.map((msg, idx) => {
    const parsedData = tryParseAiResponse(msg.content);
    const msgIndex = indexById.get(msg.id);
    const previous =
      typeof msgIndex === "number" && msgIndex > 0 ? allMessages[msgIndex - 1] : null;
    const requestPayload =
      previous?.role === "user" && previous.content && previous.content !== "AI request"
        ? previous.content
        : null;

    let filteredWorkout: DisplayExercise[] | undefined;
    if (parsedData?.recommendedWorkout) {
      const workout = parsedData.recommendedWorkout as DisplayExercise[];
      if (idx === 0) {
        // Only dynamically filter completed exercises for the latest message (active to-do list)
        filteredWorkout = workout.filter((ex) => {
          const done = completedSetsByExercise.get(ex.exerciseName) || 0;
          return done < ex.targetSets;
        });
      } else {
        // For older messages, display the full historical workout that was prescribed at the time
        filteredWorkout = workout;
      }
    }

    return {
      id: msg.id,
      timestamp: msg.timestamp,
      isLatest: idx === 0,
      rawContent: msg.content,
      parsedData,
      groupedWorkout:
        filteredWorkout && filteredWorkout.length > 0 ? groupWorkout(filteredWorkout) : null,
      requestPayload,
    };
  });
});

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
  () => allInsights.value.length,
  (newLength, oldLength) => {
    if (newLength > oldLength) {
      scrollToTop();
    }
  },
);

const userQuestion = ref("");

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

      <!-- Loading State -->
      <div v-if="aiStore.isLoading" class="flex flex-col items-center justify-center py-10 text-center gap-3">
        <Loader2 class="w-8 h-8 animate-spin text-primary" />
        <p class="text-sm font-bold tracking-tight text-muted-foreground animate-pulse">Analyzing your workouts...</p>
      </div>

      <!-- All Insights -->
      <template v-if="allInsights.length > 0">
        <div 
          v-for="(insight, idx) in allInsights" 
          :key="insight.id"
          class="flex flex-col gap-2"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Sparkles class="w-3.5 h-3.5 text-primary" />
              <span class="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {{ insight.isLatest ? 'Latest Insight' : 'Insight' }}
              </span>
            </div>
            <span class="text-xs text-muted-foreground font-semibold">{{ formatTime(insight.timestamp) }}</span>
          </div>
          
          <template v-if="insight.parsedData">
            <div 
              class="text-sm leading-relaxed [&_strong]:text-primary [&_strong]:font-bold"
              :class="insight.isLatest ? 'text-foreground/90' : 'text-foreground/50'"
              v-html="renderMarkdown(insight.parsedData.coachMessage)"
            />
            
            <!-- Recommended Workout Cards -->
            <div v-if="insight.groupedWorkout?.length" class="mt-4 flex flex-col gap-2">
              <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground/70 mb-0.5 ml-1">Today's Workout</p>
              
              <UiCard class="flex flex-col bg-card/40 border-white/5 divide-y divide-white/5 overflow-hidden">
                <div 
                  v-for="group in insight.groupedWorkout" 
                  :key="group.id"
                  class="flex flex-col divide-y divide-white/5"
                >
                  <!-- Superset Label -->
                  <div v-if="group.isSuperset" class="text-xs font-bold tracking-widest uppercase text-muted-foreground/80 bg-muted/20 px-4 py-1.5 flex items-center gap-2">
                    <Sparkles class="w-3 h-3 opacity-60" /> Superset {{ group.id }}
                  </div>

                  <!-- Exercise Items (Tappable for one-tap logging) -->
                  <div class="flex flex-col">
                    <div
                      v-for="exercise in group.exercises"
                      :key="exercise.exerciseName"
                      class="relative flex"
                    >
                      <button
                        type="button"
                        :class="cn(uiSelectableItemClass, 'pr-14')"
                        @click="handleLogExercise(exercise)"
                      >
                        <div class="flex w-full items-start justify-between gap-3">
                          <h3 class="pr-4 text-sm font-bold tracking-tight text-foreground break-words">
                            {{ exercise.exerciseName }}
                          </h3>
                          <div class="flex shrink-0 flex-wrap justify-end gap-3 text-xs font-semibold text-muted-foreground">
                            <span v-if="exercise.targetWeight" class="text-primary">{{ exercise.targetWeight }}</span>
                            <span>{{ exercise.targetSets }}×{{ exercise.targetReps }} reps</span>
                          </div>
                        </div>
                        <div v-if="exercise.notes" class="mt-1.5 text-left text-sm italic text-muted-foreground/60">
                          {{ exercise.notes }}
                        </div>
                      </button>
                      
                      <a
                        :href="`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(exercise.exerciseName + ' exercise')}`"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2.5 text-muted-foreground/50 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full cursor-pointer"
                        title="Search Images"
                        @click.stop
                      >
                        <Search class="w-4 h-4" />
                        <span class="sr-only">Search images for {{ exercise.exerciseName }}</span>
                      </a>
                    </div>
                  </div>
                </div>
              </UiCard>
            </div>
          </template>
          
          <!-- Legacy Fallback -->
          <template v-else>
            <div 
              class="text-sm leading-relaxed [&_strong]:text-primary [&_strong]:font-bold"
              :class="insight.isLatest ? 'text-foreground/90' : 'text-foreground/50'"
              v-html="renderMarkdown(insight.rawContent)"
            />
          </template>

          <!-- Sent data collapsible -->
          <div v-if="insight.requestPayload" class="mt-1">
            <button
              type="button"
              class="flex items-center gap-1 text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
              @click="openRequestPayloads = openRequestPayloads.includes(insight.id) ? openRequestPayloads.filter(id => id !== insight.id) : [...openRequestPayloads, insight.id]"
            >
              <ChevronDown
                class="w-3 h-3 transition-transform"
                :class="openRequestPayloads.includes(insight.id) ? 'rotate-180' : ''"
              />
              Sent Data
            </button>
            <pre
              v-if="openRequestPayloads.includes(insight.id)"
              class="text-xs text-muted-foreground/50 bg-muted/20 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all mt-1.5"
            >{{ insight.requestPayload }}</pre>
          </div>

          <!-- Scratchpad collapsible -->
          <div v-if="insight.parsedData?.scratchpad" class="mt-1">
            <button
              type="button"
              class="flex items-center gap-1 text-xs text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
              @click="openScratchpads = openScratchpads.includes(insight.id) ? openScratchpads.filter(id => id !== insight.id) : [...openScratchpads, insight.id]"
            >
              <ChevronDown
                class="w-3 h-3 transition-transform"
                :class="openScratchpads.includes(insight.id) ? 'rotate-180' : ''"
              />
              Reasoning
            </button>
            <pre
              v-if="openScratchpads.includes(insight.id)"
              class="text-xs text-muted-foreground/50 bg-muted/20 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all mt-1.5"
            >{{ insight.parsedData.scratchpad }}</pre>
          </div>

          <div v-if="idx < allInsights.length - 1" class="border-t border-white/5 mt-2" />
        </div>

        <!-- Clear History Button at the bottom of the list -->
        <div v-if="!aiStore.isLoading" class="pt-6 pb-2 flex justify-center">
          <UiButton
            variant="outline"
            size="sm"
            class="text-xs text-destructive border-destructive/20 hover:border-destructive hover:bg-destructive/10 gap-2 rounded-full px-4 active:scale-95 transition-all cursor-pointer"
            @click="clearAndReset"
          >
            <Trash2 class="w-3.5 h-3.5" />
            Clear Conversation History
          </UiButton>
        </div>
      </template>

      <!-- Empty Fallback (no insights and not loading) -->
      <div v-else-if="!aiStore.isLoading" class="flex flex-col items-center justify-center py-12 text-center opacity-50">
        <Sparkles class="w-10 h-10 mb-3 text-primary" />
        <p class="font-bold text-base">No insights available</p>
        <p class="text-sm text-muted-foreground mt-1 max-w-[260px]">Log some exercises first, then come back for personalized coaching.</p>
      </div>

      <!-- Inline Typing / Loading State (with existing insights) -->
      <div v-if="aiStore.isLoading && allInsights.length > 0" class="flex items-center gap-2 text-xs text-muted-foreground/60 animate-pulse py-2">
        <Loader2 class="w-3.5 h-3.5 animate-spin text-primary" />
        <span>Coach is thinking...</span>
      </div>

    </div>

    <!-- Sticky Q&A Input Bar -->
    <form
      @submit.prevent="handleAskQuestion"
      class="p-6 pt-4 border-t border-white/5 bg-background/95 backdrop-blur-xl flex gap-2 items-center shrink-0 pb-safe"
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
