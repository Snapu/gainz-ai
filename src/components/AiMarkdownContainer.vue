<template>
  <div class="feedback-container">
    <div
      v-for="message in assistantMessages"
      :key="message.id"
      class="feedback-item"
    >
      <div class="feedback-timestamp">
        <ion-text color="medium">
          <small>{{ formatTime(message.timestamp) }}</small>
        </ion-text>
      </div>
      <div class="feedback-content" v-html="renderMarkdown(message.content)"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonText } from "@ionic/vue";
import * as smd from "streaming-markdown";
import { computed } from "vue";
import { useAiStore } from "@/stores/ai";

const aiStore = useAiStore();

// Only show assistant messages (hide technical user messages with JSON)
// Show latest first (reverse chronological order)
const assistantMessages = computed(() =>
  aiStore.messages.filter((msg) => msg.role === "assistant").reverse(),
);

function renderMarkdown(content: string): string {
  const tempDiv = document.createElement("div");
  const renderer = smd.default_renderer(tempDiv);
  const parser = smd.parser(renderer);
  smd.parser_write(parser, content);
  return tempDiv.innerHTML;
}

function formatTime(timestamp: Date): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
</script>

<style lang="postcss" scoped>
.feedback-container {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  padding-bottom: 1rem;
}

.feedback-item {
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.feedback-timestamp {
  margin-bottom: 0.5rem;
  padding-left: 0.25rem;
}

.feedback-content {
  line-height: 1.6;
}

.feedback-content :deep(p) {
  margin: 0.75rem 0;
}

.feedback-content :deep(h1),
.feedback-content :deep(h2),
.feedback-content :deep(h3),
.feedback-content :deep(h4) {
  margin: 1.5rem 0 0.75rem 0;
  font-weight: 600;
}

.feedback-content :deep(h1) {
  font-size: 1.5rem;
}

.feedback-content :deep(h2) {
  font-size: 1.25rem;
}

.feedback-content :deep(h3) {
  font-size: 1.1rem;
}

.feedback-content :deep(ul),
.feedback-content :deep(ol) {
  margin: 0.75rem 0;
  padding-left: 1.5rem;
}

.feedback-content :deep(li) {
  margin: 0.5rem 0;
}

.feedback-content :deep(strong) {
  font-weight: 600;
}

.feedback-content :deep(code) {
  background: var(--ion-color-light);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.9em;
}

.feedback-content :deep(pre) {
  background: var(--ion-color-light);
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 0.75rem 0;
}

/* Add separator line between feedback items except the last one */
.feedback-item:not(:last-child) {
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--ion-color-light-shade);
}
</style>
