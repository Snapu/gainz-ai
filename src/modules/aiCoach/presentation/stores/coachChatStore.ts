import * as Sentry from "@sentry/vue";
import { useLocalStorage } from "@vueuse/core";
import { Result } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import type { CoachingAdvice, CoachingMessage } from "@/modules/aiCoach/domain";
import { LocalStorageMessageRepository } from "@/modules/aiCoach/infrastructure";
import { isoDateString } from "@/modules/sharedKernel/domain";
import { resolveCurrentSession, useExerciseLogsStore } from "@/modules/trainingLogs/presentation";

export const useCoachChatStore = defineStore("coachChat", () => {
  const messages = ref<CoachingMessage[]>([]);
  const isLoading = ref(false);
  const hasInitialized = ref(false);

  const lastRequestState = useLocalStorage<{ date: string; checksum: string }>(
    "ai-coach:last-request-state",
    { date: "", checksum: "" },
  );

  const pendingRequest = ref<{ question?: string; mode: "planning" | "execution" } | null>(null);

  const messageRepository = new LocalStorageMessageRepository();
  const exerciseLogsStore = useExerciseLogsStore();

  const activeSession = computed(() => resolveCurrentSession(exerciseLogsStore.exerciseLogs));

  const currentSessionId = computed<string>(() => {
    const session = activeSession.value;
    const boundary = session
      ? new Date(session.startTime).setHours(0, 0, 0, 0)
      : new Date().setHours(0, 0, 0, 0);
    return isoDateString(new Date(boundary));
  });

  watch(currentSessionId, (newSessionId, oldSessionId) => {
    if (!hasInitialized.value || newSessionId === oldSessionId) return;

    const loadedMessagesResult = messageRepository.loadMessages(newSessionId);
    if (loadedMessagesResult.isOk()) {
      messages.value = loadedMessagesResult.value;
    } else {
      messages.value = [];
    }
  });

  function initialize() {
    if (hasInitialized.value) return;
    hasInitialized.value = true;

    const loadedMessagesResult = messageRepository.loadMessages(currentSessionId.value);
    if (loadedMessagesResult.isErr()) {
      Sentry.captureMessage("Failed to load messages from storage", {
        level: "warning",
        tags: { scope: "ai-store", feature: "storage-load" },
      });
      messages.value = [];
    } else {
      messages.value = loadedMessagesResult.value;
    }

    messageRepository.cleanOldSessions();
  }

  function addMessage(msg: CoachingMessage) {
    messages.value.push(msg);
    messageRepository.saveMessages(currentSessionId.value, messages.value);
  }

  function updateMessageContent(messageId: string, content: string) {
    messages.value = messages.value.map((msg) =>
      msg.id === messageId ? { ...msg, content } : msg,
    );
    messageRepository.saveMessages(currentSessionId.value, messages.value);
  }

  function removeMessage(messageId: string) {
    messages.value = messages.value.filter((msg) => msg.id !== messageId);
    messageRepository.saveMessages(currentSessionId.value, messages.value);
  }

  function removeMessagesFromSession(sessionId: string) {
    messageRepository.removeMessages(sessionId);
    // If the removed session is the current one, clear messages from memory too
    if (sessionId === currentSessionId.value) {
      messages.value = [];
    }
  }

  function clearMessages() {
    messages.value = [];
    messageRepository.removeMessages(currentSessionId.value);
  }

  const currentWorkoutPlan = computed<Array<{ exerciseName: string; restSeconds?: number }> | null>(
    () => {
      const lastCoachMessage = [...messages.value].reverse().find((m) => m.role === "coach");
      if (!lastCoachMessage) return null;

      const parsedResult = Result.fromThrowable(
        (json: string) => JSON.parse(json) as CoachingAdvice,
        () => new Error("Invalid json in coach message"),
      )(lastCoachMessage.content);

      if (parsedResult.isErr()) return null;
      return parsedResult.value.recommendedWorkout ?? null;
    },
  );

  const hasTodayCoachMessage = computed<boolean>(() => {
    const today = isoDateString(new Date());
    return messages.value.some(
      (m) => m.role === "coach" && isoDateString(new Date(m.timestamp)) === today,
    );
  });

  return {
    initialize,
    messages,
    isLoading,
    hasInitialized,
    lastRequestState,
    pendingRequest,
    currentSessionId,
    addMessage,
    updateMessageContent,
    removeMessage,
    removeMessagesFromSession,
    clearMessages,
    currentWorkoutPlan,
    hasTodayCoachMessage,
  };
});
