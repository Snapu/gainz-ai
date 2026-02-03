import { type GenerateContentConfig, GoogleGenAI } from "@google/genai";

import { defineStore } from "pinia";
import * as smd from "streaming-markdown";
import { ref } from "vue";

import { localeDateString } from "@/services/utils/date";
import { useExerciseLogsStore } from "@/stores/exerciseLogs";
import { useUserProfileStore } from "@/stores/userProfile";

const aiConfig: GenerateContentConfig = {
  systemInstruction: `
You are an AI personal trainer.

Your job:
- Recall this week's training, last week's training, and long-term progress and patterns; Detect users rhythms, splits and phases and give brief feedback.
- Warn user when you detect an ovetraining, undertraining or neglected muscle groups.
- Create an effective workout plan for today that is based on the user's training history and aligns with the user's goals, fitness level and amount of days the user wants to workout per week. Only suggest exercises that can be done with the user's available equipment.

You may receive:
- A \`userProfile\` JSON (age, gender, goals, fitness level, etc.)
- An \`exerciseLogs\` JSON array (past workout sessions)
- User's preferred language/locale
- Current date

Important:
- Always respond in the user's preferred language, using the **informal form of address** (e.g. "du" in German, "tú" in Spanish, "tu" in French). Never use formal address like "Sie", "usted", or "vous".
- the user cannot reply; so do not ask questions.
- Avoid filler sentences and small talk; optimze all reponses for mobile screens.
- Be clear, constructive, data-driven and knowledgeable. Be critical when you need to be.
`,
};

async function generateCacheKey(message: string): Promise<string> {
  const encoded = new TextEncoder().encode(message);
  const buffer = await window.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const useAiStore = defineStore("ai", () => {
  const cacheKeyRef = ref("");
  const cachedElement = ref<HTMLDivElement | null>(null);
  const isLoading = ref(false);

  const userProfileStore = useUserProfileStore();
  const exerciseLogsStore = useExerciseLogsStore();

  async function askAi() {
    const apiKey = userProfileStore.userProfile.apiKey;
    if (!apiKey) {
      alert("No API Key configured!");
      return;
    }

    const markdownTarget = document.getElementById("markdown");
    if (!markdownTarget) return;

    const ai = new GoogleGenAI({ apiKey });

    // Compose AI input message
    const today = localeDateString(new Date());
    const workoutStatus = exerciseLogsStore.workoutFinished
      ? "and I am done with today's workout. Give me feedback about it."
      : exerciseLogsStore.workoutStarted
        ? "and I already started my workout. Please create a plan integrating what I already did."
        : "and I haven't worked out today yet. Make me a plan.";

    const profileJson = JSON.stringify(userProfileStore.userProfile, null, 2);
    const logsJson = JSON.stringify(
      exerciseLogsStore.exerciseLogs.map((log) => ({
        ...log,
        timestamp: localeDateString(log.loggedAt),
      })),
      null,
      2,
    );

    const userInput = `Today is ${today}, ${workoutStatus}

Here is my profile data:
\`\`\`json
${profileJson}
\`\`\`

Here is my exercise log history:
\`\`\`json
${logsJson}
\`\`\`

Units: weight = kg, duration = minutes, distance = meters

Language preference: "${navigator.language}"`;

    console.debug(userInput);

    isLoading.value = true;

    const currentKey = await generateCacheKey(userInput);
    const isCacheHit = currentKey === cacheKeyRef.value && cachedElement.value;

    if (isCacheHit && cachedElement.value) {
      console.debug("Cache hit: Using previous AI feedback.");
      markdownTarget.appendChild(cachedElement.value);
      isLoading.value = false;
      return;
    }

    cacheKeyRef.value = currentKey;

    const responseStream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: userInput,
      config: aiConfig,
    });

    // Prepare new container for streamed markdown
    const newElement = document.createElement("div");
    cachedElement.value = newElement;
    markdownTarget.appendChild(newElement);

    const renderer = smd.default_renderer(newElement);
    const parser = smd.parser(renderer);

    for await (const chunk of responseStream) {
      if (chunk.text) {
        isLoading.value = false;
        smd.parser_write(parser, chunk.text);
      }
    }
  }

  return { askAi, isLoading };
});
