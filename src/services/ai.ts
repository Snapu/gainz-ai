import { type GenerateContentConfig, GoogleGenAI, type Schema, Type } from "@google/genai";

import { err, ok, type Result } from "neverthrow";

import type { ExerciseLog } from "@/services/exerciseLogs";
import type { TrainingSummary } from "@/services/trainingSummary";
import { localeDateString } from "@/services/utils/date";
import type { UserProfile } from "@/stores/userProfile";
import type { Event } from "@/types/event";
import { getLearnedMuscleMap, learnFromAiResponse } from "./exerciseMuscleMap";
import { calculateTrainingInsights } from "./trainingScience";

export type PreviousAiMessage = {
  role: "user" | "assistant";
  content: string;
  sessionDate: string;
  logsCount: number;
};

export type AskAiError = "missing-api-key" | "generate-content-stream-failed";

export interface AiResponseData {
  scratchpad?: string;
  coachMessage: string;
  recommendedWorkout?: {
    exerciseName: string;
    targetSets: number;
    targetReps: string;
    targetWeight?: string;
    notes?: string;
    supersetId?: string;
  }[];
}

export const aiResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    scratchpad: {
      type: Type.STRING,
      description:
        "Internal workspace to calculate aggregate muscle group volumes across exercises, evaluate overtraining, and sketch the workout plan BEFORE writing the final message. NOT shown to user.",
    },
    coachMessage: {
      type: Type.STRING,
      description:
        "The empathetic, motivating, and analytical message from the coach. Max 2-3 short paragraphs.",
    },
    recommendedWorkout: {
      type: Type.ARRAY,
      description: "Optional recommended exercises to add to today's workout.",
      items: {
        type: Type.OBJECT,
        required: ["exerciseName", "targetSets", "targetReps"],
        properties: {
          exerciseName: { type: Type.STRING },
          reasoning: {
            type: Type.STRING,
            description:
              "Your internal scratchpad to explain your logic for these targets based on user history. NOT shown to user.",
          },
          targetSets: { type: Type.INTEGER },
          targetReps: { type: Type.STRING },
          targetWeight: {
            type: Type.STRING,
            description:
              "Exact numeric weight only (e.g. '60kg', 'Bodyweight'). Keep it extremely concise (1-2 words). Do not explain logic.",
          },
          notes: {
            type: Type.STRING,
            description:
              "Advanced execution cue, tempo (e.g. '3s eccentric pause'), or anatomical focus (e.g. 'Bias long head'). Omit if nothing special.",
          },
          supersetId: {
            type: Type.STRING,
            description:
              "Optional. Assign the same identifier (e.g. 'A', 'B') to exercises that should be performed together as a superset.",
          },
          muscleGroup: {
            type: Type.STRING,
            description:
              "Primary muscle group this exercise targets. Must be one of: Chest, Back, Quads, Hamstrings, Shoulders, Biceps, Triceps, Abs, Calves, Glutes.",
          },
        },
      },
    },
  },
  required: ["coachMessage"],
};

export const aiConfig: GenerateContentConfig = {
  responseMimeType: "application/json",
  responseSchema: aiResponseSchema,
  systemInstruction: `
You are an elite AI personal trainer providing data-driven feedback and workout planning.

1. CORE RESPONSIBILITIES:
- Analyze recent training, long-term progress, and detect the user's current split/phase.
- Warn the user of overtraining, undertraining, or neglected muscle groups.
- Generate a highly personalized workout plan for today based on goals, fitness level, available equipment, and time constraints.
- Infer from logs whether the user is planning, mid-workout, or finished, and adapt tone.
- Factor in health/schedule events (e.g., ease back after sickness/injury, respect fasting/rest days).

2. TRAINING SCIENCE DATA (CRITICAL):
- You receive a 'trainingInsights' JSON containing pre-calculated scientific data. TRUST these numbers — do NOT recalculate them.
- 'muscleGroups': Per-muscle weekly sets, volume landmark (below_MEV / at_MEV / at_MAV / above_MRV), training frequency, and hours since last trained.
  - MEV = Minimum Effective Volume (need more volume to grow)
  - MAV = Maximum Adaptive Volume (optimal growth zone — 10-18 sets/week)
  - MRV = Maximum Recoverable Volume (too much — risk of overtraining)
- 'e1rm': Estimated 1-Rep Max per exercise with a 4-session trend and plateau detection. Use this to set precise targetWeight values.
- 'fatigue': Deload recommendation with reasoning. If shouldDeload is true, you MUST program a deload week (50-60% of normal volume, reduce intensity by 10-15%).
- You MUST use the 'scratchpad' JSON field to analyze this data BEFORE writing your coachMessage.

3. STRICT OUTPUT & TONAL RULES:
- The user CANNOT reply. Do not ask questions or prompt for responses (e.g. never say "Let me know how it goes!").
- Mobile-first brevity: Keep 'coachMessage' strictly to 2-3 short, punchy paragraphs. Avoid filler small talk.
- Tone: Always use informal language (e.g. 'du' in German, 'tu' in French) matching the user's locale. Be constructive and critical when necessary.
- Confusing Jargon: Never use 'RPE' without explaining it. Speak in plain language (e.g. 'leave 2 reps in tank').
- Auto-Regulation (RPE): If the user provides an RPE (e.g., @RPE8) for a set, use this to gauge proximity to failure. If RPE is low (<8) on a hypertrophy set, you MUST push the targetWeight or targetReps higher.
- Targets: Be definitive in the 'targetWeight' field. Use e1RM data and RPE feedback to calculate appropriate working weights (typically 70-85% of e1RM for hypertrophy). Give exactly one numeric target.
- Notes: NEVER use trivial cliches in the 'notes' field (e.g. "controlled execution", "deep squat"). Only provide advanced tempo/anatomical cues (e.g. "3s eccentric") or OMIT the field entirely.
- LANGUAGE RULE: Only 'coachMessage' is shown to the user — write it in the user's locale. ALL other fields ('scratchpad', 'reasoning', 'muscleGroup', 'supersetId', 'targetWeight', 'notes') MUST be in English. This saves tokens and ensures reliable parsing.

4. MID-WORKOUT BEHAVIOR (CRITICAL):
- If the user has already logged exercises today, you are MID-WORKOUT.
- Extremely important: Do NOT repeat the workout's overarching goal, do NOT repeat weekly volume analysis, and do NOT re-explain things you already said in previous messages today.
- Your ONLY job mid-workout is to give a quick 1-2 sentence reaction to their latest set and smoothly present the next exercises. Be highly fluent and conversational, acting like a trainer standing right next to them in the gym.

You may receive:
- Your previous feedback from this session (if any)
- A 'userProfile' JSON
- An 'exerciseLogs' in compact format
- A 'trainingInsights' JSON (e1RM, volume landmarks, deload status)
- An 'events' array
- User's preferred language/locale
- Current date

Here are examples of how you should respond:
EXAMPLE 1 (Dynamic Volume & Overload Analysis):
User Data: Calculated Fitness Insights: {"weeklyVolume": [{"exerciseName": "Bankdrücken", "sets": 6, "totalReps": 60}], "progressiveOverload": [{"exerciseName": "Bankdrücken", "status": "maintained"}]}
Coach Response: {"scratchpad": "User did 6 sets of Bankdrücken (Chest). That's only 6 active chest sets this week. Hypertrophy requires >10. Need to program chest volume.", "coachMessage": "I noticed your bench press (Bankdrücken) has maintained the same weight and reps this week. Furthermore, translating your logs, you've only hit 6 sets for Chest this week, which is below the minimum effective volume for hypertrophy. Let's bump your chest volume up to 10 sets next week to break this plateau.", "recommendedWorkout": [{"exerciseName": "Bankdrücken", "reasoning": "User maintained volume, but total weekly sets are low. Need to push target weight slightly to break plateau.", "targetSets": 4, "targetReps": "8-12", "targetWeight": "65kg", "notes": "3s eccentric phase", "supersetId": "A"}, {"exerciseName": "Incline Dumbbell Flyes", "reasoning": "Adding a chest isolation superset to increase volume.", "targetSets": 4, "targetReps": "12-15", "targetWeight": "15kg", "notes": "Pause at maximum stretch", "supersetId": "A"}]}

EXAMPLE 2 (Event & Constraint Adaptation):
User Data: User is fasting today. Goal is lose_fat.
Coach Response: {"coachMessage": "Since you're fasting today, we shouldn't push for PRs. Let's keep the intensity moderate and focus on maintaining your muscle mass while you're in a caloric deficit. We'll stick to 3 working sets for your main lifts."}
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

function getWorkoutPhase(exerciseLogs: ExerciseLog[]): "planning" | "mid-workout" | "post-workout" {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const todayLogs = exerciseLogs.filter((log) => log.loggedAt.getTime() > startOfToday);
  if (todayLogs.length === 0) return "planning";

  const lastLogTime = Math.max(...todayLogs.map((l) => l.loggedAt.getTime()));
  const minutesSinceLastLog = (Date.now() - lastLogTime) / 60000;
  // If >45 min since last set, treat as post-workout
  return minutesSinceLastLog > 45 ? "post-workout" : "mid-workout";
}

function getDaysSinceLastWorkout(exerciseLogs: ExerciseLog[]): number | null {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const pastLogs = exerciseLogs.filter((log) => log.loggedAt.getTime() < startOfToday);
  if (pastLogs.length === 0) return null;

  const lastLogDate = new Date(Math.max(...pastLogs.map((l) => l.loggedAt.getTime())));
  const diffMs = startOfToday - lastLogDate.setHours(0, 0, 0, 0);
  return Math.round(diffMs / 86400000);
}

function getTrainingPattern(exerciseLogs: ExerciseLog[]): string | null {
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const recentLogs = exerciseLogs.filter((l) => l.loggedAt.getTime() >= fourWeeksAgo.getTime());
  if (recentLogs.length === 0) return null;

  // Count workouts by day-of-week
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayCounts = new Map<number, number>();
  const seenDates = new Set<string>();
  for (const log of recentLogs) {
    const dateKey = log.loggedAt.toDateString();
    if (seenDates.has(dateKey)) continue;
    seenDates.add(dateKey);
    const day = log.loggedAt.getDay();
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }

  // Only include days trained ≥2 times in 4 weeks
  const activeDays = [...dayCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort(([a], [b]) => a - b)
    .map(([day]) => dayNames[day]);

  return activeDays.length > 0 ? `Usual training days: ${activeDays.join(", ")}` : null;
}

/** Compress raw exercise logs into a compact, token-efficient string format.
 *  Output: "Mon 3/22: Bench 3×12@52.5kg, Squat 3×10@80kg\nTue 3/23: ..." */
function compactLogs(logs: ExerciseLog[]): string {
  if (logs.length === 0) return "(none)";

  // Group by date string
  const byDate = new Map<string, ExerciseLog[]>();
  for (const log of logs) {
    const dateKey = localeDateString(log.loggedAt);
    const existing = byDate.get(dateKey) ?? [];
    existing.push(log);
    byDate.set(dateKey, existing);
  }

  // Group sets within each day by exercise name
  const lines: string[] = [];
  for (const [date, dayLogs] of byDate) {
    const byExercise = new Map<string, ExerciseLog[]>();
    for (const log of dayLogs) {
      const existing = byExercise.get(log.exerciseName) ?? [];
      existing.push(log);
      byExercise.set(log.exerciseName, existing);
    }

    const parts: string[] = [];
    for (const [name, sets] of byExercise) {
      const setStrs = sets.map((s) => {
        const p: string[] = [];
        if (s.reps) p.push(`${s.reps}`);
        if (s.weight) p.push(`@${s.weight}kg`);
        if (s.distance) p.push(`${s.distance}m`);
        if (s.duration) p.push(`${s.duration}min`);
        if (s.rpe) p.push(`@RPE${s.rpe}`);
        return p.join("") || "1set";
      });
      parts.push(`${name}: ${setStrs.join(", ")}`);
    }
    lines.push(`${date}: ${parts.join(" | ")}`);
  }
  return lines.join("\n");
}

/** Build conversation history for the API.
 *  Only sends previous assistant responses (not the user payloads which are huge).
 *  The current user input is always appended at the end. */
function buildConversationContents(params: {
  previousMessages: PreviousAiMessage[];
  currentUserInput: string;
}): Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> {
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  // Only include previous assistant responses to avoid resending giant user payloads
  const recentAssistantMessages = params.previousMessages
    .filter((m) => m.role === "assistant")
    .slice(-5);

  for (const msg of recentAssistantMessages) {
    contents.push({ role: "model", parts: [{ text: msg.content }] });
  }

  contents.push({ role: "user", parts: [{ text: params.currentUserInput }] });

  return contents;
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

  let aiResponseText = "";

  try {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const todayLogs = exerciseLogs.filter((log) => log.loggedAt.getTime() > startOfToday);

    const isFirstMessage = previousMessages.length === 0;
    const isMidWorkout = todayLogs.length > 0;

    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const last4WeeksLogs = exerciseLogs.filter(
      (log) => log.loggedAt.getTime() >= fourWeeksAgo.getTime(),
    );

    const logsToInclude = isFirstMessage ? last4WeeksLogs : todayLogs;
    const workoutStatus = getWorkoutStatus(exerciseLogs);
    const phase = getWorkoutPhase(exerciseLogs);
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    // Build the user payload — only include heavy data on first message
    const sections: string[] = [
      `Today is ${today} ${currentTime}, ${workoutStatus}\nPhase: ${phase}`,
    ];

    // Profile: only on first message (it never changes mid-session)
    if (isFirstMessage) {
      sections.push(`Profile: ${JSON.stringify(userProfile)}`);

      // Highlight freeUserInput separately so the AI treats it as a primary directive
      if (userProfile.freeUserInput) {
        sections.push(`User's own words about their goals:\n"${userProfile.freeUserInput}"`);
      }
    }

    // Days since last workout (critical for recovery)
    const restDays = getDaysSinceLastWorkout(exerciseLogs);
    if (restDays !== null) {
      sections.push(`Days since last workout: ${restDays}`);
    }

    // Training pattern (helps AI understand split)
    if (isFirstMessage) {
      const pattern = getTrainingPattern(exerciseLogs);
      if (pattern) sections.push(pattern);
    }

    // Historical summaries: only on first message
    if (isFirstMessage && trainingSummaries.length > 0) {
      sections.push(`Historical training summary:\n${JSON.stringify(trainingSummaries)}`);
    }

    // Exercise logs: always send, but in compact format
    if (isMidWorkout && previousMessages.length > 0) {
      // Mid-workout: only send new sets since last AI response
      const assistantMsgs = previousMessages.filter((m) => m.role === "assistant");
      const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
      const cutoff = lastAssistant ? new Date(`${lastAssistant.sessionDate}`).getTime() : 0;
      const newLogs = todayLogs.filter((l) => l.loggedAt.getTime() > cutoff);
      sections.push(
        `New sets since last update:\n${compactLogs(newLogs.length > 0 ? newLogs : todayLogs)}`,
      );
    } else {
      const logLabel = isFirstMessage ? "Recent logs (last 4 weeks)" : "Today's logs";
      sections.push(`${logLabel}:\n${compactLogs(logsToInclude)}`);
    }

    // Training science insights: only on first message or when not mid-workout
    if (isFirstMessage || !isMidWorkout) {
      const learnedMap = getLearnedMuscleMap();
      const insights = calculateTrainingInsights(exerciseLogs, new Date(), learnedMap);
      sections.push(`Training Insights:\n${JSON.stringify(insights)}`);
    }

    // Events
    if (events.length > 0) {
      const eventsText = events
        .map((event) => `- ${event.type}: ${event.dates.join(", ")}`)
        .join("\n");
      sections.push(`Health/schedule events:\n${eventsText}`);
    }

    sections.push(`Units: kg, minutes, meters\nLanguage: "${navigator.language}"`);

    const currentUserInput = sections.join("\n\n");

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

    aiResponseText = "";
    for await (const chunk of responseStream) {
      if (chunk.text) aiResponseText += chunk.text;
    }

    return ok(aiResponseText);
  } catch (error) {
    console.error("AI request failed:", error);
    return err("generate-content-stream-failed");
  } finally {
    // Learn exercise→muscleGroup mappings from the AI response (fire-and-forget)
    // This runs even if the response is malformed — we just skip bad data
    try {
      if (aiResponseText) {
        const parsed = JSON.parse(aiResponseText);
        if (Array.isArray(parsed?.recommendedWorkout)) {
          learnFromAiResponse(parsed.recommendedWorkout);
        }
      }
    } catch {
      // Silently ignore parse errors — learning is best-effort
    }
  }
}
