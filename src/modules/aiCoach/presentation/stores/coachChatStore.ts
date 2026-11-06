import * as Sentry from "@sentry/vue";
import { useIntervalFn, useLocalStorage, useNow } from "@vueuse/core";
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
  const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 60000) });

  const lastRequestState = useLocalStorage<{ date: string; checksum: string }>(
    "ai-coach:last-request-state",
    { date: "", checksum: "" },
  );

  const messageRepository = new LocalStorageMessageRepository();
  const exerciseLogsStore = useExerciseLogsStore();

  const activeSession = computed(() =>
    resolveCurrentSession(exerciseLogsStore.exerciseLogs, now.value.getTime()),
  );

  const currentSessionId = computed<string>(() => {
    const session = activeSession.value;
    const boundary = session
      ? new Date(session.startTime).setHours(0, 0, 0, 0)
      : new Date(now.value).setHours(0, 0, 0, 0);
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

    messages.value = messageRepository
      .loadMessages(currentSessionId.value)
      .orTee(() => {
        Sentry.captureMessage("Failed to load messages from storage", {
          level: "warning",
          tags: { scope: "ai-store", feature: "storage-load" },
        });
      })
      .unwrapOr([]);

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

  function clearMessages() {
    messages.value = [];
    messageRepository.removeMessages(currentSessionId.value);
  }

  function retainOnlyMessage(messageId: string) {
    messages.value = messages.value.filter((msg) => msg.id === messageId);
    messageRepository.saveMessages(currentSessionId.value, messages.value);
  }

  const currentWorkoutPlan = computed<Array<{ exerciseName: string; restSeconds?: number }> | null>(
    () => {
      const lastCoachMessage = [...messages.value].reverse().find((m) => m.role === "coach");
      if (!lastCoachMessage) return null;

      return Result.fromThrowable(
        (json: string) => JSON.parse(json) as CoachingAdvice,
        () => new Error("Invalid json in coach message"),
      )(lastCoachMessage.content)
        .map((advice) => advice.recommendedWorkout ?? null)
        .unwrapOr(null);
    },
  );

  const hasTodayCoachMessage = computed<boolean>(() => {
    const targetDate = currentSessionId.value;
    return messages.value.some(
      (m) =>
        m.role === "coach" &&
        (m.sessionId === targetDate || isoDateString(new Date(m.timestamp)) === targetDate),
    );
  });

  return {
    initialize,
    messages,
    isLoading,
    hasInitialized,
    lastRequestState,
    currentSessionId,
    addMessage,
    updateMessageContent,
    removeMessage,
    clearMessages,
    retainOnlyMessage,
    currentWorkoutPlan,
    hasTodayCoachMessage,
  };
});
