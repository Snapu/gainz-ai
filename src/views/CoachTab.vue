<script setup lang="ts">
import {
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Copy,
  Dumbbell,
  Key,
  Sparkles,
} from "@lucide/vue";
import { useCoachChatViewModel } from "@/modules/aiCoach/presentation";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import GlobalHeaderActions from "@/shared/presentation/components/GlobalHeaderActions.vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiTextarea from "@/shared/presentation/components/ui/UiTextarea.vue";

const {
  isLoading,
  userQuestion,
  openScratchpads,
  openRequestPayloads,
  scrollContainerRef,
  chatMessages,
  quickPrompts,
  hasApiKey,
  isKeyboardVisible,
  handleAskQuestion,
  applyQuickPrompt,
  toggleScratchpad,
  togglePayload,
  copyPayload,
  navigateToApiKeySetup,
  navigateToTrainTab,
  renderMarkdown,
} = useCoachChatViewModel();

// Used as a template ref; TS complains it is unused in script without this reference
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

    <!-- Chat Messages Scroll Area -->
    <main
      ref="scrollContainerRef"
      class="flex-1 min-h-0 px-4 pt-4 pb-4 overflow-y-auto no-scrollbar flex flex-col gap-4 w-full max-w-2xl mx-auto"
    >
      <!-- Missing API Key Callout -->
      <div
        v-if="!hasApiKey"
        class="w-full rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex flex-col gap-3 animate-in fade-in duration-300"
      >
        <div class="flex items-start gap-3">
          <div class="p-2 rounded-full bg-amber-500/10 text-amber-500 shrink-0">
            <Key class="w-4 h-4" />
          </div>
          <div class="flex flex-col gap-1">
            <h3 class="text-sm font-bold text-foreground">Gemini API Key Required</h3>
            <p class="text-xs text-muted-foreground font-medium leading-relaxed">
              To activate real-time workout adaptations, exercise swaps, and fatigue advice, add your Gemini API key.
            </p>
          </div>
        </div>
        <UiButton
          size="sm"
          variant="outline"
          class="w-full text-xs font-semibold border-amber-500/30 text-amber-400 hover:bg-amber-500/10 active:scale-95"
          @click="navigateToApiKeySetup"
        >
          Configure API Key
        </UiButton>
      </div>

      <!-- Loading Skeleton -->
      <div
        v-if="isLoading && chatMessages.length === 0"
        class="flex flex-col gap-4 py-6 w-full animate-pulse"
      >
        <div class="flex items-start gap-3">
          <div class="w-8 h-8 rounded-full bg-muted/20 shrink-0"></div>
          <div class="flex-1 flex flex-col gap-2">
            <div class="h-3 w-24 bg-muted/20 rounded-lg"></div>
            <div class="h-20 w-full bg-muted/20 rounded-xl"></div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="!isLoading && chatMessages.length === 0"
        class="flex-1 flex flex-col items-center justify-center text-center p-6 gap-5 my-auto animate-in fade-in duration-300"
      >
        <div class="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
          <Sparkles class="w-8 h-8" />
        </div>
        <div class="flex flex-col gap-1 max-w-sm">
          <h2 class="text-lg font-bold text-foreground">Your AI Strength Coach</h2>
          <p class="text-xs font-medium text-muted-foreground leading-relaxed">
            Ask questions about your lifts, request exercise substitutions, adjust workout volume, or ask about recovery.
          </p>
        </div>
        <div class="flex flex-wrap justify-center gap-2 w-full max-w-lg mt-2">
          <button
            v-for="qp in quickPrompts"
            :key="qp.id"
            type="button"
            :disabled="isLoading"
            :title="qp.prompt"
            :aria-label="qp.prompt"
            @click="applyQuickPrompt(qp.prompt)"
            class="flex items-center justify-center gap-2 text-xs font-semibold px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 text-foreground transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Sparkles class="w-3.5 h-3.5 text-primary shrink-0" />
            <span class="truncate">{{ qp.label }}</span>
          </button>
        </div>
      </div>

      <!-- Messages Stream -->
      <template v-for="message in chatMessages" :key="message.id">
        <!-- User Bubble -->
        <div
          v-if="message.role === 'user'"
          class="flex flex-col items-end gap-1 max-w-[85%] self-end animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div class="flex items-center gap-2 pr-1">
            <span class="text-xs font-medium text-muted-foreground/60 tabular-nums">{{ message.formattedTime }}</span>
            <span class="text-xs font-bold text-muted-foreground">You</span>
          </div>
          <div class="p-3 rounded-xl rounded-tr-none bg-primary/15 border border-primary/25 text-foreground text-sm font-semibold leading-relaxed shadow-sm whitespace-pre-wrap break-words">
            {{ message.content }}
          </div>
        </div>

        <!-- Coach Bubble -->
        <div
          v-else-if="message.role === 'coach'"
          class="w-full flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <!-- Content Card -->
          <div class="w-full p-4 rounded-xl bg-card border border-white/5 shadow-sm text-sm font-medium text-foreground/90 leading-relaxed flex flex-col gap-3">
            <!-- Header bar inside the card -->
            <div class="flex items-center justify-between pb-2.5 border-b border-white/5">
              <div class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                  <Sparkles class="w-3.5 h-3.5" />
                </div>
                <span class="text-xs font-bold text-foreground">AI Coach</span>
              </div>
              <span class="text-xs font-medium text-muted-foreground/60 tabular-nums">
                {{ message.formattedTime }}
              </span>
            </div>

            <div
              class="coach-content text-sm leading-relaxed text-foreground/90 font-medium"
              v-html="renderMarkdown(message.content)"
            />

            <!-- Recommended Workout Card -->
            <div
              v-if="message.recommendedWorkout?.length"
              class="mt-1 p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-3"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Dumbbell class="w-3.5 h-3.5" />
                  </div>
                  <span class="text-xs font-bold text-foreground">Prescribed Workout</span>
                </div>
                <UiBadge variant="surface" class="uppercase tracking-wider text-xs">
                  {{ message.recommendedWorkout.length }} Exercises
                </UiBadge>
              </div>

              <div class="flex flex-col gap-2">
                <div
                  v-for="(ex, exIdx) in message.recommendedWorkout"
                  :key="`${ex.exerciseName}-${exIdx}`"
                  class="text-xs text-muted-foreground font-medium flex items-center justify-between py-1 border-b border-white/5 last:border-0"
                >
                  <span class="truncate font-semibold text-foreground/90">{{ ex.exerciseName }}</span>
                  <span class="shrink-0 font-bold text-primary tabular-nums ml-2">
                    {{
                      ex.targetReps
                        ? `${ex.targetSets} × ${ex.targetReps}`
                        : ex.targetDurationSeconds
                          ? `${ex.targetSets} × ${ex.targetDurationSeconds}s`
                          : ex.targetDistanceMeters
                            ? `${ex.targetSets} × ${ex.targetDistanceMeters}m`
                            : `${ex.targetSets} Sets`
                    }}
                  </span>
                </div>
              </div>

              <button
                type="button"
                @click="navigateToTrainTab"
                class="text-xs font-bold text-primary hover:underline flex items-center gap-2 self-start pt-1 cursor-pointer active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg"
              >
                <span>Open in Train Tab</span>
                <ArrowRight class="w-3 h-3" />
              </button>
            </div>

            <!-- Expandable Disclosures: Rationale & Debug Data -->
            <div v-if="message.scratchpad || message.requestPayload" class="border-t border-white/5 pt-2 mt-1 flex flex-col gap-2">
              <div class="flex items-center gap-3 flex-wrap">
                <!-- Coach Rationale Button -->
                <button
                  v-if="message.scratchpad"
                  type="button"
                  :aria-expanded="openScratchpads.includes(message.id)"
                  :aria-controls="'scratchpad-' + message.id"
                  class="flex items-center gap-2 text-xs font-semibold text-muted-foreground/70 hover:text-foreground transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-xl py-1 px-1 -ml-1 active:scale-95"
                  @click="toggleScratchpad(message.id)"
                >
                  <ChevronDown
                    class="w-3.5 h-3.5 transition-transform duration-200"
                    :class="openScratchpads.includes(message.id) ? 'rotate-180 text-primary' : ''"
                  />
                  <span>Coach's Rationale</span>
                </button>

                <!-- Debug Data Button -->
                <button
                  v-if="message.requestPayload"
                  type="button"
                  :aria-expanded="openRequestPayloads.includes(message.id)"
                  :aria-controls="'payload-' + message.id"
                  class="flex items-center gap-2 text-xs font-semibold text-muted-foreground/50 hover:text-muted-foreground/90 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-xl py-1 px-1 active:scale-95"
                  @click="togglePayload(message.id)"
                >
                  <ChevronDown
                    class="w-3.5 h-3.5 transition-transform duration-200"
                    :class="openRequestPayloads.includes(message.id) ? 'rotate-180 text-primary' : ''"
                  />
                  <span>Debug Data</span>
                </button>
              </div>

              <!-- Rationale Box -->
              <div
                v-if="message.scratchpad && openScratchpads.includes(message.id)"
                :id="'scratchpad-' + message.id"
                class="p-3 rounded-xl bg-white/5 border border-white/5 text-xs font-medium text-foreground/80 leading-relaxed animate-in fade-in duration-200"
              >
                <div class="text-xs uppercase font-bold tracking-wider text-muted-foreground/60 mb-1">Reasoning & Scratchpad</div>
                <p class="whitespace-pre-wrap">{{ message.scratchpad }}</p>
              </div>

              <!-- Debug Data Box -->
              <div
                v-if="message.requestPayload && openRequestPayloads.includes(message.id)"
                :id="'payload-' + message.id"
                class="p-3 rounded-xl bg-muted/20 border border-white/5 text-xs font-mono text-muted-foreground/80 leading-relaxed animate-in fade-in duration-200 flex flex-col gap-2"
              >
                <div class="flex items-center justify-between">
                  <span class="text-xs uppercase font-bold tracking-wider text-muted-foreground/60">Sent Prompt Payload</span>
                  <button
                    type="button"
                    @click="copyPayload(message.requestPayload)"
                    class="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg"
                  >
                    <Copy class="w-3 h-3" />
                    <span>Copy</span>
                  </button>
                </div>
                <pre class="overflow-x-auto whitespace-pre-wrap break-all text-xs max-h-48 rounded-xl bg-black/30 p-3 font-mono text-muted-foreground/70">{{ message.requestPayload }}</pre>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Active Typing Indicator Bubble -->
      <div
        v-if="isLoading && chatMessages.length > 0"
        role="status"
        aria-live="polite"
        class="w-full flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300"
      >
        <span class="sr-only">AI Coach is analyzing workout</span>
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Sparkles class="w-3.5 h-3.5 animate-pulse" />
          </div>
          <span class="text-xs font-bold text-foreground">AI Coach</span>
          <span class="text-xs font-medium text-muted-foreground/60">Analyzing your workout...</span>
        </div>
        <div class="px-4 py-3 rounded-xl bg-card border border-white/5 shadow-sm inline-flex items-center gap-2 self-start">
          <span class="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]"></span>
          <span class="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]"></span>
          <span class="w-2 h-2 rounded-full bg-primary animate-bounce"></span>
        </div>
      </div>
    </main>

    <!-- Bottom Docked Actions & Input -->
    <div class="shrink-0 border-t border-white/5 bg-background/95 backdrop-blur-xl p-3 z-20 transition-all duration-200">
      <div class="w-full max-w-2xl mx-auto flex flex-col gap-3">
        <!-- Quick Prompts -->
        <div
          v-if="!isKeyboardVisible && !userQuestion.trim() && quickPrompts.length > 0"
          class="flex flex-wrap gap-2 py-1 w-full transition-all duration-200"
        >
          <button
            v-for="qp in quickPrompts"
            :key="qp.id"
            type="button"
            :disabled="isLoading"
            :title="qp.prompt"
            :aria-label="qp.prompt"
            @click="applyQuickPrompt(qp.prompt)"
            class="flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 text-muted-foreground hover:text-foreground transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed active:scale-95 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background whitespace-nowrap"
          >
            <Sparkles class="w-3 h-3 text-primary shrink-0" />
            <span class="truncate max-w-[240px]">{{ qp.label }}</span>
          </button>
        </div>

        <div class="relative w-full">
          <UiTextarea
            v-model="userQuestion"
            auto-resize
            rows="1"
            enterkeyhint="send"
            :disabled="isLoading"
            placeholder="Ask Coach about your workout, fatigue, or swaps..."
            class="min-h-[56px] max-h-36 py-3.5 pl-4 pr-14 text-base"
            @keydown.enter.exact.prevent="handleAskQuestion"
          />
          <UiButton
            type="button"
            size="icon"
            :variant="userQuestion.trim() ? 'default' : 'secondary'"
            class="absolute right-2 bottom-2 h-10 w-10 rounded-full active:scale-95 transition-all"
            :class="!userQuestion.trim() ? 'opacity-40' : 'shadow-sm'"
            :disabled="!userQuestion.trim() || isLoading"
            @click="handleAskQuestion"
            aria-label="Send Question"
          >
            <ArrowUp class="w-5 h-5" />
          </UiButton>
        </div>
      </div>
    </div>
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

.coach-content :deep(p) {
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
  line-height: 1.625;
}
.coach-content :deep(p:first-child) {
  margin-top: 0;
}
.coach-content :deep(p:last-child) {
  margin-bottom: 0;
}
.coach-content :deep(strong) {
  color: var(--color-primary);
  font-weight: 700;
}
.coach-content :deep(ul) {
  list-style-type: disc;
  padding-left: 1.25rem;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}
.coach-content :deep(ol) {
  list-style-type: decimal;
  padding-left: 1.25rem;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}
.coach-content :deep(li) {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}
.coach-content :deep(li > p) {
  margin-top: 0;
  margin-bottom: 0;
}
.coach-content :deep(li::marker) {
  color: var(--color-primary);
}
.coach-content :deep(code) {
  background-color: rgba(255, 255, 255, 0.08);
  padding: 0.125rem 0.375rem;
  border-radius: 0.375rem;
  font-family: monospace;
  font-size: 0.85em;
}
</style>
