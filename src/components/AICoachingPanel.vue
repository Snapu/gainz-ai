<script setup lang="ts">
import { useTimeAgo } from "@vueuse/core";
import DOMPurify from "dompurify";
import { Loader2, Sparkles } from "lucide-vue-next";
import { computed, watch } from "vue";
import BottomSheet from "@/components/ui/BottomSheet.vue";
import { useToast } from "@/components/ui/useToast";
import { useAiStore } from "@/stores/ai";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<(e: "update:open", val: boolean) => void>();

const aiStore = useAiStore();
const { toast } = useToast();

const internalOpen = computed({
  get: () => props.open,
  set: (val) => emit("update:open", val),
});

// Auto-fetch insights when the panel opens
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && !aiStore.isLoading) {
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
    }
  },
);

// All AI responses, newest first
const allInsights = computed(() =>
  aiStore.messages
    .filter((m) => m.role === "assistant")
    .slice()
    .reverse(),
);

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
                {{ idx === 0 ? 'Latest' : '' }} Insight
              </span>
            </div>
            <span class="text-[10px] text-muted-foreground font-semibold">{{ formatTime(insight.timestamp) }}</span>
          </div>
          
          <div 
            class="text-sm leading-relaxed [&_strong]:text-primary [&_strong]:font-black"
            :class="idx === 0 ? 'text-foreground/90' : 'text-foreground/50'"
            v-html="renderMarkdown(insight.content)"
          />

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
