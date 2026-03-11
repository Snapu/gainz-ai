import { type GenerateContentConfig, GoogleGenAI } from "@google/genai";

import { err, ok, type Result } from "neverthrow";

import type { ExerciseLog } from "@/services/exerciseLogs";
import type { TrainingSummary } from "@/services/trainingSummary";
import { localeDateString } from "@/services/utils/date";
import type { Event } from "@/types/event";
import type { UserProfile } from "@/stores/userProfile";

type PreviousAiMessage = {
  role: "user" | "assistant";
  content: string;
  sessionDate: string;
  logsCount: number;
};

export type AskAiError = "missing-api-key" | "generate-content-stream-failed";

export const aiConfig: GenerateContentConfig = {
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
- An \`events\` array containing health/schedule events (sickness, injury, fasting, rest days, etc.)
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

Event handling:
- Consider health/schedule events when making workout recommendations.
- Adjust workout intensity and exercise selection based on recent events (e.g., ease back after sickness/injury).
- If user was sick/injured recently, warn about returning too quickly and recommend gradual progression.
- Respect scheduled rest days and fasting periods in your recommendations.
`,
};

export function getTodayLogsCount(exerciseLogs: ExerciseLog[]): number {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  return exerciseLogs.filter((log) => log.loggedAt.getTime() > startOfToday).length;
}

function getWorkoutStatus(exerciseLogs: ExerciseLog[]): string {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const workoutStarted = exerciseLogs.find((log) => log.loggedAt.getTime() > startOfToday);
  return workoutStarted ? `I already started my workout today.` : `I haven't worked out today yet.`;
}

function buildConversationContents(params: {
  previousMessages: PreviousAiMessage[];
  currentUserInput: string;
}): Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> {
  const conversationContents: Array<{
    role: "user" | "model";
    parts: Array<{ text: string }>;
  }> = [];

  const recentMessages = params.previousMessages.slice(-10);
  for (const msg of recentMessages) {
    conversationContents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }

  conversationContents.push({
    role: "user",
    parts: [{ text: params.currentUserInput }],
  });

  return conversationContents;
}

function getLastAssistantMessageText(previousMessages: PreviousAiMessage[]): string | null {
  for (let i = previousMessages.length - 1; i >= 0; i--) {
    const msg = previousMessages[i];
    if (!msg) continue;
    if (msg.role === "assistant") return msg.content;
  }
  return null;
}

export async function askAi(
  apiKey: string | undefined,
  userProfile: UserProfile,
  exerciseLogs: ExerciseLog[],
  trainingSummaries: TrainingSummary[],
  previousMessages: PreviousAiMessage[],
  events: Event[] = [],
): Promise<Result<string, AskAiError>> {
  if (!apiKey) return err("missing-api-key");

  const ai = new GoogleGenAI({ apiKey });
  const today = localeDateString(new Date());
  const todayLogsCount = getTodayLogsCount(exerciseLogs);

  const lastMessage = previousMessages[previousMessages.length - 1];
  if (
    lastMessage &&
    lastMessage.logsCount === todayLogsCount &&
    lastMessage.sessionDate === today
  ) {
    console.debug("No new logs since last AI response, using cached messages.");
    return ok(getLastAssistantMessageText(previousMessages) ?? "");
  }

  try {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const todayLogs = exerciseLogs.filter((log) => log.loggedAt.getTime() > startOfToday);

    const isFirstMessage = previousMessages.length === 0;

    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const last4WeeksLogs = exerciseLogs.filter(
      (log) => log.loggedAt.getTime() >= fourWeeksAgo.getTime(),
    );

    const logsToInclude = isFirstMessage ? last4WeeksLogs : todayLogs;

    const workoutStatus = getWorkoutStatus(exerciseLogs);

    const profileJson = JSON.stringify(userProfile, null, 2);
    const logsJson = JSON.stringify(
      logsToInclude.map((log) => ({
        ...log,
        timestamp: localeDateString(log.loggedAt),
      })),
      null,
      2,
    );
    const eventsJson = JSON.stringify(events, null, 2);

    let historicalSummarySection = "";
    if (isFirstMessage && trainingSummaries.length > 0) {
      const summaryJson = JSON.stringify(trainingSummaries, null, 2);
      historicalSummarySection = `
Here is my historical training summary (monthly aggregates from past years):
\`\`\`json
${summaryJson}
\`\`\`

`;
    }

    let currentUserInput = `Today is ${today}, ${workoutStatus}

Here is my profile data:
\`\`\`json
${profileJson}
\`\`\`
${historicalSummarySection}Here is my ${isFirstMessage ? "recent exercise logs (last 4 weeks)" : "today's exercise logs so far"}:
\`\`\`json
${logsJson}
\`\`\`
`;

    if (events.length > 0) {
      currentUserInput += `
Here are my current events and constraints:
\`\`\`json
${eventsJson}
\`\`\`
`;
    }

    currentUserInput += `
Units: weight = kg, duration = minutes, distance = meters

Language preference: "${navigator.language}"`;

    console.debug(currentUserInput);

    const conversationContents = buildConversationContents({
      previousMessages,
      currentUserInput,
    });

    const responseStream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: conversationContents,
      config: aiConfig,
    });

    let aiResponseText = "";
    for await (const chunk of responseStream) {
      if (chunk.text) aiResponseText += chunk.text;
    }

    return ok(aiResponseText);
  } catch (error) {
    console.error("AI request failed:", error);
    return err("generate-content-stream-failed");
  }
}
