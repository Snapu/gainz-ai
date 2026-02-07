import { type GenerateContentConfig, GoogleGenAI } from "@google/genai";

import { defineStore } from "pinia";
import * as smd from "streaming-markdown";
import { computed, ref } from "vue";

import { localeDateString } from "@/services/utils/date";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";
import { useUserProfileStore } from "@/stores/userProfile";

interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sessionDate: string;
  logsCount: number;
}

const aiConfig: GenerateContentConfig = {
  systemInstruction: `
You are an AI personal trainer providing feedback to your client.

Your job:
- Recall this week's training, last week's training, and long-term progress and patterns; Detect users rhythms, splits and phases and give brief feedback.
- Warn user when you detect an overtraining, undertraining or neglected muscle groups.
- Create an effective workout plan for today that is based on the user's training history and aligns with the user's goals, fitness level and amount of days the user wants to workout per week. Only suggest exercises that can be done with the user's available equipment.
- Infer from exercise logs whether user is planning, mid-workout, or finished training. Adapt your responses accordingly.
- Respect any time constraints in the user's profile (e.g., preferred workout duration).

You may receive:
- Your previous feedback from this session (if any)
- A \`userProfile\` JSON (age, gender, goals, fitness level, equipment, time constraints, etc.)
- An \`exerciseLogs\` JSON array (past workout sessions and today's logs)
- User's preferred language/locale
- Current date

Important:
- The user CANNOT send text replies. They only log exercises in the app.
- When you receive updated exercise logs, acknowledge what's new and adapt your recommendations.
- Build on your previous feedback. Don't repeat advice you already gave.
- Don't ask questions or prompt for responses (e.g., avoid "Let me know how it goes!" or "Tell me when you're done").
- Always respond in the user's preferred language, using the **informal form of address** (e.g. "du" in German, "tú" in Spanish, "tu" in French). Never use formal address like "Sie", "usted", or "vous".
- Avoid filler sentences and small talk; optimize all responses for mobile screens.
- Be clear, constructive, data-driven and knowledgeable. Be critical when you need to be.
`,
};

const STORAGE_KEY_PREFIX = "ai-messages-";
const MAX_SESSION_AGE_DAYS = 7;

function getStorageKey(sessionDate: string): string {
  return `${STORAGE_KEY_PREFIX}${sessionDate}`;
}

function loadMessagesFromStorage(sessionDate: string): AiMessage[] {
  try {
    const stored = localStorage.getItem(getStorageKey(sessionDate));
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    return parsed.map((msg: AiMessage) => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    }));
  } catch (error) {
    console.error("Failed to load messages from storage:", error);
    return [];
  }
}

function saveMessagesToStorage(sessionDate: string, messages: AiMessage[]) {
  try {
    localStorage.setItem(getStorageKey(sessionDate), JSON.stringify(messages));
  } catch (error) {
    console.error("Failed to save messages to storage:", error);
  }
}

function cleanOldSessions() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_SESSION_AGE_DAYS);

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_KEY_PREFIX)) {
      const sessionDateStr = key.replace(STORAGE_KEY_PREFIX, "");
      // Simple date comparison - could be improved with proper parsing
      if (sessionDateStr < localeDateString(cutoffDate)) {
        keysToRemove.push(key);
      }
    }
  }

  keysToRemove.forEach((key) => {
    localStorage.removeItem(key);
  });
}

function getTodayLogsCount(exerciseLogsStore: ReturnType<typeof useExerciseLogsStore>): number {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  return exerciseLogsStore.exerciseLogs.filter((log) => log.loggedAt.getTime() > startOfToday)
    .length;
}

export const useAiStore = defineStore("ai", () => {
  const messages = ref<AiMessage[]>([]);
  const isLoading = ref(false);

  const userProfileStore = useUserProfileStore();
  const exerciseLogsStore = useExerciseLogsStore();

  const todaySessionDate = computed(() => localeDateString(new Date()));

  // Load today's messages on initialization
  messages.value = loadMessagesFromStorage(todaySessionDate.value);
  cleanOldSessions();

  async function askAi() {
    const apiKey = userProfileStore.userProfile.apiKey;
    if (!apiKey) {
      alert("No API Key configured!");
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    const today = localeDateString(new Date());
    const todayLogsCount = getTodayLogsCount(exerciseLogsStore);

    // Check if we need to make a new request
    const lastMessage = messages.value[messages.value.length - 1];
    if (
      lastMessage &&
      lastMessage.logsCount === todayLogsCount &&
      lastMessage.sessionDate === today
    ) {
      console.debug("No new logs since last AI response, using cached messages.");
      return;
    }

    isLoading.value = true;

    try {
      // Get today's logs only for current context
      const startOfToday = new Date().setHours(0, 0, 0, 0);
      const todayLogs = exerciseLogsStore.exerciseLogs.filter(
        (log) => log.loggedAt.getTime() > startOfToday,
      );

      // For first message, include more history for context
      const isFirstMessage = messages.value.length === 0;
      const logsToInclude = isFirstMessage ? exerciseLogsStore.exerciseLogs : todayLogs;

      const workoutStatus = exerciseLogsStore.workoutStarted
        ? `I already started my workout today.`
        : `I haven't worked out today yet.`;

      const profileJson = JSON.stringify(userProfileStore.userProfile, null, 2);
      const logsJson = JSON.stringify(
        logsToInclude.map((log) => ({
          ...log,
          timestamp: localeDateString(log.loggedAt),
        })),
        null,
        2,
      );

      const currentUserInput = `Today is ${today}, ${workoutStatus}

Here is my profile data:
\`\`\`json
${profileJson}
\`\`\`

Here is my ${isFirstMessage ? "exercise log history" : "today's exercise logs so far"}:
\`\`\`json
${logsJson}
\`\`\`

Units: weight = kg, duration = minutes, distance = meters

Language preference: "${navigator.language}"`;

      console.debug(currentUserInput);

      // Build conversation contents array
      const conversationContents: Array<{
        role: "user" | "model";
        parts: Array<{ text: string }>;
      }> = [];

      // Include last 5 message pairs for context (10 messages total)
      const recentMessages = messages.value.slice(-10);
      for (const msg of recentMessages) {
        conversationContents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      }

      // Add current user input
      conversationContents.push({
        role: "user",
        parts: [{ text: currentUserInput }],
      });

      // Save user message
      const userMessageId = `${Date.now()}-user`;
      const userMessage: AiMessage = {
        id: userMessageId,
        role: "user",
        content: currentUserInput,
        timestamp: new Date(),
        sessionDate: today,
        logsCount: todayLogsCount,
      };
      messages.value.push(userMessage);
      saveMessagesToStorage(today, messages.value);

      const responseStream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: conversationContents,
        config: aiConfig,
      });

      // Accumulate AI response
      let aiResponseText = "";
      for await (const chunk of responseStream) {
        if (chunk.text) {
          isLoading.value = false;
          aiResponseText += chunk.text;
        }
      }

      // Save assistant message
      const assistantMessageId = `${Date.now()}-assistant`;
      const assistantMessage: AiMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: aiResponseText,
        timestamp: new Date(),
        sessionDate: today,
        logsCount: todayLogsCount,
      };
      messages.value.push(assistantMessage);
      saveMessagesToStorage(today, messages.value);
    } catch (error) {
      console.error("AI request failed:", error);
      alert("Failed to get AI response. Please try again.");
    } finally {
      isLoading.value = false;
    }
  }

  return { askAi, isLoading, messages };
});
