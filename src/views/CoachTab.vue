<script setup lang="ts">
import { ChevronDown, ChevronLeft, ChevronRight, Sparkles } from "@lucide/vue";
import { useCoachChatViewModel } from "@/modules/aiCoach/presentation";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import EmptyState from "@/shared/presentation/components/EmptyState.vue";
import GlobalHeaderActions from "@/shared/presentation/components/GlobalHeaderActions.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiTextarea from "@/shared/presentation/components/ui/UiTextarea.vue";

const {
  chatStore,
  currentPageIndex,
  userQuestion,
  openScratchpads,
  openRequestPayloads,
  coachMessages,
  scrollContainerRef,
  handleAskQuestion,
  formatTime,
  renderMarkdown,
} = useCoachChatViewModel();

// Used as a template ref, but TS complains it's unused if we don't reference it in script
void scrollContainerRef;
</script>

<template>
  <div class="h-full bg-background flex flex-col pt-safe relative">
    
    <!-- Top Nav -->
    <AppHeader>
      <h1 class="text-lg font-black tracking-tight">AI Coach</h1>
      <template #actions>
        <GlobalHeaderActions />
      </template>
    </AppHeader>

    <main ref="scrollContainerRef" class="flex-1 px-4 pt-6 pb-32 overflow-y-auto no-scrollbar flex flex-col gap-6">
      
      <!-- AI Coach Insight Section -->
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
      <div v-if="chatStore.isLoading && coachMessages.length === 0" class="flex flex-col gap-3 py-4 w-full animate-pulse">
        <div class="h-3 w-24 bg-muted/20 rounded"></div>
        <div class="h-4 w-full bg-muted/20 rounded mt-2"></div>
        <div class="h-4 w-[90%] bg-muted/20 rounded"></div>
        <div class="h-4 w-[95%] bg-muted/20 rounded"></div>
        <div class="h-4 w-[60%] bg-muted/20 rounded"></div>
        <div class="h-8 w-24 bg-muted/20 rounded-xl mt-2"></div>
      </div>

      <!-- Empty Fallback -->
      <EmptyState 
        v-else-if="!chatStore.isLoading && coachMessages.length === 0"
        :icon="Sparkles"
        title="No insights available"
        description="Ask the Coach a question below."
        class="opacity-100"
      />

      <!-- Inline typing indicator (with existing insights) -->
      <div v-if="chatStore.isLoading && coachMessages.length > 0" class="flex flex-col gap-3 py-4 w-full animate-pulse mt-4 pt-4 border-t border-border/20">
        <div class="h-3 w-16 bg-muted/20 rounded"></div>
        <div class="h-4 w-[85%] bg-muted/20 rounded mt-1"></div>
        <div class="h-4 w-[60%] bg-muted/20 rounded"></div>
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
            :disabled="!userQuestion.trim() || chatStore.isLoading"
            @click="handleAskQuestion"
          >
            <span v-if="chatStore.isLoading">Sending...</span>
            <span v-else>Send Question</span>
          </UiButton>
        </div>
      </div>
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
