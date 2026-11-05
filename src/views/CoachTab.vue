<script setup lang="ts">
import { ArrowRight, ArrowUp, ChevronDown, Copy, Dumbbell, Key, Sparkles } from "@lucide/vue";
import {
  getValidSupersetId,
  isSupersetStart,
  supersetConnectorClass,
  useCoachChatViewModel,
} from "@/modules/aiCoach/presentation";
import AppHeader from "@/shared/presentation/components/AppHeader.vue";
import GlobalHeaderActions from "@/shared/presentation/components/GlobalHeaderActions.vue";
import UiBadge from "@/shared/presentation/components/ui/UiBadge.vue";
import UiButton from "@/shared/presentation/components/ui/UiButton.vue";
import UiCard from "@/shared/presentation/components/ui/UiCard.vue";
import UiTelemetryLoader from "@/shared/presentation/components/ui/UiTelemetryLoader.vue";
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
  <div class="h-full bg-background flex flex-col pt-safe relative overflow-hidden">
    
    <!-- Top Nav -->
    <AppHeader class="shrink-0">
      <h1 class="text-2xl font-black italic tracking-tighter">Gainz<span class="text-primary">AI</span></h1>
      <template #actions>
        <GlobalHeaderActions />
      </template>
    </AppHeader>

    <!-- Chat Messages Scroll Area -->
    <main
      ref="scrollContainerRef"
      class="flex-1 min-h-0 px-4 pt-4 pb-4 overflow-y-auto overscroll-y-contain no-scrollbar flex flex-col gap-4 w-full max-w-2xl mx-auto"
    >
      <!-- Missing API Key Callout -->
      <div
        v-if="!hasApiKey"
        class="w-full rounded-xl border border-orange-500/20 bg-orange-500/10 p-4 flex flex-col gap-3 animate-in fade-in duration-300"
      >
        <div class="flex items-start gap-3">
          <div class="p-2 rounded-full bg-orange-500/10 text-orange-400 shrink-0">
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
          class="w-full text-xs font-semibold border-orange-500/30 text-orange-400 hover:bg-orange-500/10 active:scale-95"
          @click="navigateToApiKeySetup"
        >
          Configure API Key
        </UiButton>
      </div>

      <!-- Telemetry Loader -->
      <UiTelemetryLoader
        v-if="isLoading && chatMessages.length === 0"
        text="Analyzing training history..."
      />

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
            class="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 text-foreground transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background whitespace-nowrap"
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
          <div class="p-3 rounded-xl rounded-tr-none bg-primary/10 border border-primary/20 text-foreground text-sm font-semibold leading-relaxed shadow-sm whitespace-pre-wrap break-words">
            {{ message.content }}
          </div>
        </div>

        <!-- Coach Message (Flat / Streamlined AI UI) -->
        <div
          v-else-if="message.role === 'coach'"
          class="w-full flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200 py-1"
        >
          <!-- Message text directly on background -->
          <div
            class="coach-content text-sm leading-relaxed text-foreground/90 font-medium"
            v-html="renderMarkdown(message.content)"
          />

          <!-- Recommended Workout Card (Standalone Level 1 Card) -->
          <UiCard
            v-if="message.recommendedWorkout?.length"
            class="p-4 flex flex-col gap-2.5 shadow-sm"
          >
            <div class="flex items-center justify-between pb-2 border-b border-white/5">
              <div class="flex items-center gap-1.5">
                <Dumbbell class="w-3.5 h-3.5 text-primary" />
                <span class="text-xs font-bold text-foreground">Prescribed Workout</span>
              </div>
              <UiBadge variant="surface" class="uppercase tracking-wider text-[10px] px-1.5 py-0">
                {{ message.recommendedWorkout.length }} Exercises
              </UiBadge>
            </div>

            <!-- Compact Single-Line Exercise Rows -->
            <div class="flex flex-col divide-y divide-white/5 pl-2 relative">
              <div
                v-for="(ex, exIdx) in message.recommendedWorkout"
                :key="`${ex.exerciseName}-${exIdx}`"
                class="py-2 flex items-center justify-between gap-2 text-xs relative"
              >
                <!-- Superset Indicator Line -->
                <div
                  v-if="getValidSupersetId(ex, message.recommendedWorkout)"
                  class="absolute -left-2 w-[2px] bg-primary/40"
                  :class="supersetConnectorClass(exIdx, message.recommendedWorkout)"
                />

                <div class="flex items-center gap-1.5 min-w-0 flex-1 pr-2">
                  <span class="font-semibold text-foreground/90 truncate">
                    {{ ex.exerciseName }}
                  </span>
                  <UiBadge
                    v-if="isSupersetStart(exIdx, message.recommendedWorkout)"
                    variant="info"
                    class="text-[9px] px-1 py-0 uppercase tracking-wider shrink-0"
                  >
                    Superset
                  </UiBadge>
                </div>

                <!-- Metrics: Sets × Reps + Optional Weight (NO RPE) -->
                <div class="flex items-center gap-1.5 shrink-0 tabular-nums text-xs ml-2">
                  <span class="font-bold text-foreground/80">
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
                  <span v-if="ex.targetWeight" class="font-bold text-primary">
                    {{ ex.targetWeight }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Action Link -->
            <button
              type="button"
              @click="navigateToTrainTab"
              class="text-xs font-bold text-primary hover:underline flex items-center gap-1.5 self-start pt-1 cursor-pointer active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
            >
              <span>Open in Train Tab</span>
              <ArrowRight class="w-3.5 h-3.5" />
            </button>
          </UiCard>

          <!-- Expandable Disclosures: Rationale & Debug Data -->
          <div v-if="message.scratchpad || message.requestPayload" class="pt-1 flex flex-col gap-2">
            <div class="flex items-center gap-3 flex-wrap">
              <!-- Coach Rationale Button -->
              <button
                v-if="message.scratchpad"
                type="button"
                :aria-expanded="openScratchpads.includes(message.id)"
                :aria-controls="'scratchpad-' + message.id"
                class="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground/60 hover:text-foreground transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg py-1 px-1 -ml-1 active:scale-95"
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
                class="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground/40 hover:text-muted-foreground/80 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg py-1 px-1 active:scale-95"
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
              class="p-3.5 rounded-xl bg-white/5 border border-white/5 text-xs font-medium text-foreground/80 leading-relaxed animate-in fade-in duration-200"
            >
              <div class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/50 mb-1">Reasoning & Scratchpad</div>
              <p class="whitespace-pre-wrap">{{ message.scratchpad }}</p>
            </div>

            <!-- Debug Data Box -->
            <div
              v-if="message.requestPayload && openRequestPayloads.includes(message.id)"
              :id="'payload-' + message.id"
              class="p-3.5 rounded-xl bg-muted/20 border border-white/5 text-xs font-mono text-muted-foreground/80 leading-relaxed animate-in fade-in duration-200 flex flex-col gap-2"
            >
              <div class="flex items-center justify-between">
                <span class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/50">Sent Prompt Payload</span>
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
      </template>

      <!-- Active Typing Indicator -->
      <div
        v-if="isLoading && chatMessages.length > 0"
        role="status"
        aria-live="polite"
        class="w-full flex items-center gap-2 text-xs text-muted-foreground animate-in fade-in duration-200 py-1"
      >
        <span class="sr-only">AI Coach is analyzing workout</span>
        <div class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/5">
          <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]"></span>
          <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"></span>
          <span class="text-xs text-muted-foreground/80 font-medium ml-1.5">Coach is thinking...</span>
        </div>
      </div>
    </main>

    <!-- Bottom Docked Actions & Input -->
    <div class="shrink-0 border-t border-white/5 bg-background/95 backdrop-blur-xl px-4 py-3 z-20 transition-all duration-200">
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
            class="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 text-muted-foreground hover:text-foreground transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed active:scale-95 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background whitespace-nowrap"
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
            placeholder="Ask Coach anything..."
            class="min-h-[52px] max-h-36 py-3.5 pl-4 pr-14 text-base placeholder:text-muted-foreground/60 placeholder:truncate leading-normal"
            @keydown.enter.exact.prevent="handleAskQuestion"
          />
          <UiButton
            type="button"
            size="icon"
            :variant="userQuestion.trim() ? 'default' : 'secondary'"
            class="absolute right-1.5 bottom-1.5 h-10 w-10 rounded-full active:scale-95 transition-all"
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
