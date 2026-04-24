<script setup lang="ts">
import { useDebounceFn, useTimeAgo } from "@vueuse/core";
import DOMPurify from "dompurify";
import { Loader2, Sparkles } from "lucide-vue-next";
import { computed, watch } from "vue";
import BottomSheet from "@/components/ui/BottomSheet.vue";
import UiCard from "@/components/ui/UiCard.vue";
import { useToast } from "@/components/ui/useToast";
import type { AiResponseData } from "@/services/ai";
import { useAiStore } from "@/stores/ai";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  (e: "update:open", val: boolean): void;
  (e: "log-exercise", data: { exerciseName: string; reps?: number; weight?: number }): void;
}>();

const aiStore = useAiStore();
const { toast } = useToast();

const internalOpen = computed({
  get: () => props.open,
  set: (val) => emit("update:open", val),
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
    }
  });
}, 500);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && !aiStore.isLoading) {
      debouncedAskAi();
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
}

// All AI responses, newest first
const allInsights = computed<DisplayInsight[]>(() => {
  const reversed = aiStore.messages
    .filter((m) => m.role === "assistant")
    .slice()
    .reverse();

  return reversed.map((msg, idx) => {
    const parsedData = tryParseAiResponse(msg.content);
    return {
      id: msg.id,
      timestamp: msg.timestamp,
      isLatest: idx === 0,
      rawContent: msg.content,
      parsedData,
      groupedWorkout: parsedData?.recommendedWorkout
        ? groupWorkout(parsedData.recommendedWorkout as DisplayExercise[])
        : null,
    };
  });
});

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
  });
  emit("update:open", false);
}
</script>

<template>
  <BottomSheet v-model:open="internalOpen" title="AI Coach">
    <div class="flex flex-col gap-4 w-full max-h-[70vh] overflow-y-auto">

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
              <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {{ insight.isLatest ? 'Latest Insight' : 'Insight' }}
              </span>
            </div>
            <span class="text-[10px] text-muted-foreground font-semibold">{{ formatTime(insight.timestamp) }}</span>
          </div>
          
          <template v-if="insight.parsedData">
            <div 
              class="text-sm leading-relaxed [&_strong]:text-primary [&_strong]:font-black"
              :class="insight.isLatest ? 'text-foreground/90' : 'text-foreground/50'"
              v-html="renderMarkdown(insight.parsedData.coachMessage)"
            />
            
            <!-- Recommended Workout Cards -->
            <div v-if="insight.groupedWorkout?.length" class="mt-4 flex flex-col gap-2">
              <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-0.5 ml-1">Today's Workout</p>
              
              <UiCard class="flex flex-col bg-card/40 border-white/5 divide-y divide-white/5 overflow-hidden">
                <div 
                  v-for="group in insight.groupedWorkout" 
                  :key="group.id"
                  class="flex flex-col divide-y divide-white/5"
                >
                  <!-- Superset Label -->
                  <div v-if="group.isSuperset" class="text-[10px] font-bold tracking-widest uppercase text-muted-foreground/80 bg-muted/20 px-4 py-1.5 flex items-center gap-2">
                    <Sparkles class="w-3 h-3 opacity-60" /> Superset {{ group.id }}
                  </div>

                  <!-- Exercise Items (Tappable for one-tap logging) -->
                  <button
                    v-for="exercise in group.exercises"
                    :key="exercise.exerciseName"
                    class="flex flex-col px-4 py-3 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors text-left w-full cursor-pointer"
                    @click="handleLogExercise(exercise)"
                  >
                    <div class="flex justify-between items-center w-full">
                      <h3 class="font-bold text-sm text-foreground tracking-tight truncate pr-4">{{ exercise.exerciseName }}</h3>
                      
                      <div class="flex gap-3 text-xs text-muted-foreground font-semibold shrink-0">
                        <span v-if="exercise.targetWeight" class="text-primary">{{ exercise.targetWeight }}</span>
                        <span>{{ exercise.targetSets }}<span class="text-[10px] opacity-70 mx-0.5">&times;</span>{{ exercise.targetReps }}<span class="text-[10px] opacity-70 ml-0.5">reps</span></span>
                      </div>
                    </div>
                    
                    <div v-if="exercise.notes" class="text-[11px] text-muted-foreground/60 italic text-left mt-1.5">
                      {{ exercise.notes }}
                    </div>
                  </button>
                </div>
              </UiCard>
            </div>
          </template>
          
          <!-- Legacy Fallback -->
          <template v-else>
            <div 
              class="text-sm leading-relaxed [&_strong]:text-primary [&_strong]:font-black"
              :class="insight.isLatest ? 'text-foreground/90' : 'text-foreground/50'"
              v-html="renderMarkdown(insight.rawContent)"
            />
          </template>

          <div v-if="idx < allInsights.length - 1" class="border-t border-white/5 mt-2" />
        </div>
      </template>

      <!-- Empty Fallback (no insights and not loading) -->
      <div v-else-if="!aiStore.isLoading" class="flex flex-col items-center justify-center py-12 text-center opacity-50">
        <Sparkles class="w-10 h-10 mb-3 text-primary" />
        <p class="font-bold text-base">No insights available</p>
        <p class="text-sm text-muted-foreground mt-1 max-w-[260px]">Log some exercises first, then come back for personalized coaching.</p>
      </div>

    </div>
  </BottomSheet>
</template>
