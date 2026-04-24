import { type GenerateContentConfig, GoogleGenAI, type Schema, Type } from "@google/genai";

import { err, ok, type Result } from "neverthrow";

import type { ExerciseLog } from "@/services/exerciseLogs";
import type { TrainingSummary } from "@/services/trainingSummary";
import { localeDateString } from "@/services/utils/date";
import type { UserProfile } from "@/stores/userProfile";
import type { Event } from "@/types/event";
import { getLearnedMuscleMap, learnFromAiResponse } from "./exerciseMuscleMap";
import { calculateTrainingInsights } from "./trainingScience";

const INITIAL_LOG_WINDOW_DAYS = 14;
const EXTENDED_LOG_WINDOW_DAYS = 28;
const MIN_INITIAL_LOG_ENTRIES = 12;
const MAX_SUMMARIES_IN_PROMPT = 6;
const MAX_ASSISTANT_HISTORY_MESSAGES = 3;

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
    primaryMuscle?: string;
    secondaryMuscles?: Array<{ muscleGroup: string; contribution?: number }>;
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
          primaryMuscle: {
            type: Type.STRING,
            description:
              "Primary muscle group this exercise targets. Must be one of: Chest, Back, Quads, Hamstrings, Shoulders, Biceps, Triceps, Abs, Calves, Glutes.",
          },
          secondaryMuscles: {
            type: Type.ARRAY,
            description:
              "Optional secondary muscle groups this exercise also activates, with their fractional contribution (0.0–1.0). E.g. Bench Press also activates Triceps (0.5) and Shoulders (0.3).",
            items: {
              type: Type.OBJECT,
              required: ["muscleGroup"],
              properties: {
                muscleGroup: {
                  type: Type.STRING,
                  description:
                    "Must be one of: Chest, Back, Quads, Hamstrings, Shoulders, Biceps, Triceps, Abs, Calves, Glutes.",
                },
                contribution: {
                  type: Type.NUMBER,
                  description:
                    "Fraction of a set credited to this muscle (0.0–1.0). Omit to default to 0.5.",
                },
              },
            },
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
  // Low temperature: reduces hallucination for numeric targets (weights, sets, reps)
  temperature: 0.4,
  topP: 0.85,
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
- Your 'scratchpad' MUST follow this exact structure BEFORE writing coachMessage:
  1. VOLUME: List each muscle group — current sets vs. MEV/MAV/MRV landmark (e.g. "Chest: 6 sets → below_MEV, needs 8+").
  2. E1RM: Trend direction per key exercise — increasing / plateau / declining (e.g. "Bench: 110→112→112→112 = plateau").
  3. FATIGUE: shouldDeload flag + reason. Note any volume spikes.
  4. RECOVERY: Which muscles are ready to train (>48h general, >72h for Quads/Back/Hamstrings).
  5. WEIGHTS: Explicit calculation for each recommended exercise (e.g. "Bench e1RM 120kg → 75% = 90 → round to 90kg").
  6. PLAN: Final proposed exercise order with one-line rationale per exercise.

3. STRICT OUTPUT & TONAL RULES:
- The user CANNOT reply. Do not ask questions or prompt for responses (e.g. never say "Let me know how it goes!").
- Mobile-first brevity: Keep 'coachMessage' strictly to 2-3 short, punchy paragraphs. Avoid filler small talk.
- Tone: Always use informal language (e.g. 'du' in German, 'tu' in French) matching the user's locale. Be constructive and critical when necessary.
- Confusing Jargon: Never use 'RPE' without explaining it. Speak in plain language (e.g. 'leave 2 reps in tank').
- Auto-Regulation (RPE): If the user provides an RPE (e.g., @RPE8) for a set, use this to gauge proximity to failure. If RPE is low (<8) on a hypertrophy set, you MUST push the targetWeight or targetReps higher.
- Weight Calculation (MANDATORY): Use e1RM data to set targetWeight according to rep range:
  Rep range 1–5   → 85–95% of e1RM (strength)
  Rep range 6–12  → 65–80% of e1RM (hypertrophy)
  Rep range 12–20 → 50–65% of e1RM (metabolic/endurance)
  Always round to the nearest 2.5kg increment. Always give a single concrete number (e.g. "82.5kg"), never a range.
- Progressive Overload Protocol (MANDATORY): Follow double-progression.
  Step 1 — if the user hit the TOP of the rep range on ALL sets in the previous session, increase targetWeight by 2.5–5kg and reset targetReps to the BOTTOM of the range.
  Step 2 — otherwise, keep the same weight and push reps higher within the range.
  Never increase weight and reps simultaneously.
- Exercise Order (MANDATORY): Always order recommendedWorkout with compound multi-joint movements first (e.g. Squat, Bench Press, Deadlift, Row, OHP), isolation movements last (e.g. Curls, Flyes, Lateral Raises). Within each category, order by the session's priority muscle group.
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

EXAMPLE 3 (Deload Week):
User Data: Training Insights: {"fatigue": {"shouldDeload": true, "reason": "Volume has increased for 4 consecutive weeks.", "weeklyTotalSets": [28, 33, 38, 44]}}
Coach Response: {"scratchpad": "1. VOLUME: Not relevant this week — deload triggered. 2. E1RM: Not pushing intensity. 3. FATIGUE: shouldDeload=true, 4 weeks of increasing volume (28→33→38→44 sets). 4. RECOVERY: All muscles need systemic rest. 5. WEIGHTS: Reduce by 15% across the board. Bench e1RM 120kg → deload target = 70% = 84 → round to 85kg. 6. PLAN: 2 sets per compound only, no isolation.", "coachMessage": "Four weeks of climbing volume — your body is telling you to back off. This is a planned deload, not a setback. Drop the weight 15% and cut to 2 sets per exercise. You'll come back noticeably stronger next week.", "recommendedWorkout": [{"exerciseName": "Bench Press", "reasoning": "Deload: 2 sets at 70% e1RM. Primary compound first.", "targetSets": 2, "targetReps": "10-12", "targetWeight": "85kg"}, {"exerciseName": "Barbell Row", "reasoning": "Deload: 2 sets, back compound second.", "targetSets": 2, "targetReps": "10-12", "targetWeight": "70kg"}]}

EXAMPLE 4 (New User — No History):
User Data: exerciseLogs=[], isFirstMessage=true, fitnessLevel="beginner"
Coach Response: {"scratchpad": "1. VOLUME: No data — zero sets logged. Cannot assess landmarks. 2. E1RM: No data. 3. FATIGUE: No data, no deload needed. 4. RECOVERY: Fully fresh. 5. WEIGHTS: No e1RM baseline. Use conservative beginner loads — bodyweight or empty bar for compounds. 6. PLAN: Full-body baseline session: 1 squat pattern, 1 push, 1 pull. 3 sets each, moderate reps to establish form.", "coachMessage": "Welcome — let's build your baseline. Since this is our first session, we're not chasing numbers today: we're establishing your starting point. Focus entirely on technique and note how these weights feel.", "recommendedWorkout": [{"exerciseName": "Squat", "reasoning": "Baseline session: compound lower first, bodyweight to assess mobility.", "targetSets": 3, "targetReps": "10-12", "targetWeight": "bodyweight"}, {"exerciseName": "Bench Press", "reasoning": "Baseline push pattern, empty bar to assess shoulder mobility and technique.", "targetSets": 3, "targetReps": "10-12", "targetWeight": "20kg"}, {"exerciseName": "Barbell Row", "reasoning": "Baseline pull pattern, light load.", "targetSets": 3, "targetReps": "10-12", "targetWeight": "30kg"}]}

EXAMPLE 5 (Fat Loss Goal — Metabolic Focus):
User Data: fitnessGoal=["lose_fat"], Training Insights: {"muscleGroups": {"Chest": {"sets": 9, "landmark": "at_MEV"}, "Back": {"sets": 10, "landmark": "at_MEV"}}}
Coach Response: {"scratchpad": "1. VOLUME: Chest 9 sets → at_MEV. Back 10 sets → at_MEV. Maintaining, not building — appropriate for fat loss. 2. E1RM: Not pushing maximal strength. 3. FATIGUE: No deload needed. 4. RECOVERY: All fresh. 5. WEIGHTS: Fat loss goal → 12-20 rep range → 50-65% e1RM. Bench e1RM 100kg → 55% = 55kg. Row e1RM 90kg → 55% = 50kg. 6. PLAN: Superset push+pull for maximum metabolic demand. Compounds first.", "coachMessage": "Metabolic day — we're keeping rest short and pairing exercises back-to-back to maximise calorie burn. The weights are deliberately moderate: your heart rate is the target, not the barbell.", "recommendedWorkout": [{"exerciseName": "Bench Press", "reasoning": "Compound push first. 55% e1RM for fat loss rep range.", "targetSets": 3, "targetReps": "15-20", "targetWeight": "55kg", "supersetId": "A"}, {"exerciseName": "Barbell Row", "reasoning": "Paired compound pull superset — elevates EPOC.", "targetSets": 3, "targetReps": "15-20", "targetWeight": "50kg", "supersetId": "A"}, {"exerciseName": "Lateral Raises", "reasoning": "Isolation last. Light, high-rep shoulder volume.", "targetSets": 3, "targetReps": "15-20", "targetWeight": "10kg"}]}
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
      const reps = sets.map((s) => s.reps).filter((v): v is number => typeof v === "number");
      const weights = sets.map((s) => s.weight).filter((v): v is number => typeof v === "number");
      const rpes = sets.map((s) => s.rpe).filter((v): v is number => typeof v === "number");
      const durations = sets
        .map((s) => s.duration)
        .filter((v): v is number => typeof v === "number");
      const distances = sets
        .map((s) => s.distance)
        .filter((v): v is number => typeof v === "number");

      const summaryParts = [`${sets.length} sets`];

      if (reps.length > 0) {
        const minReps = Math.min(...reps);
        const maxReps = Math.max(...reps);
        summaryParts.push(minReps === maxReps ? `${maxReps} reps` : `${minReps}-${maxReps} reps`);
      }

      if (weights.length > 0) {
        const minWeight = Math.min(...weights);
        const maxWeight = Math.max(...weights);
        summaryParts.push(
          minWeight === maxWeight ? `${maxWeight}kg` : `${minWeight}-${maxWeight}kg`,
        );
      }

      if (distances.length > 0) {
        const totalDistance = Math.round(distances.reduce((acc, v) => acc + v, 0));
        summaryParts.push(`${totalDistance}m total`);
      }

      if (durations.length > 0) {
        const totalMinutes = Math.round(durations.reduce((acc, v) => acc + v, 0));
        summaryParts.push(`${totalMinutes}min total`);
      }

      if (rpes.length > 0) {
        const lastRpe = rpes[rpes.length - 1];
        summaryParts.push(`last @RPE${lastRpe}`);
      }

      parts.push(`${name}: ${summaryParts.join(", ")}`);
    }
    lines.push(`${date}: ${parts.join(" | ")}`);
  }
  return lines.join("\n");
}

function getRecentLogs(exerciseLogs: ExerciseLog[], days: number): ExerciseLog[] {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return exerciseLogs.filter((log) => log.loggedAt.getTime() >= since.getTime());
}

function getInitialLogsWindow(exerciseLogs: ExerciseLog[]): { logs: ExerciseLog[]; label: string } {
  const last2WeeksLogs = getRecentLogs(exerciseLogs, INITIAL_LOG_WINDOW_DAYS);
  if (last2WeeksLogs.length >= MIN_INITIAL_LOG_ENTRIES) {
    return {
      logs: last2WeeksLogs,
      label: `Recent logs (last ${INITIAL_LOG_WINDOW_DAYS / 7} weeks)`,
    };
  }

  return {
    logs: getRecentLogs(exerciseLogs, EXTENDED_LOG_WINDOW_DAYS),
    label: `Recent logs (last ${EXTENDED_LOG_WINDOW_DAYS / 7} weeks)`,
  };
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
    .slice(-MAX_ASSISTANT_HISTORY_MESSAGES);

  for (const msg of recentAssistantMessages) {
    // Strip internal reasoning fields before storing in history — saves 30-50% context tokens
    const strippedContent = (() => {
      try {
        const parsed = JSON.parse(msg.content);
        const { scratchpad: _s, ...rest } = parsed;
        if (Array.isArray(rest.recommendedWorkout)) {
          rest.recommendedWorkout = rest.recommendedWorkout.map(
            ({ reasoning: _r, ...exercise }: { reasoning?: string; [key: string]: unknown }) =>
              exercise,
          );
        }
        return JSON.stringify(rest);
      } catch {
        return msg.content;
      }
    })();
    contents.push({ role: "model", parts: [{ text: strippedContent }] });
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

    const initialWindow = getInitialLogsWindow(exerciseLogs);
    const logsToInclude = isFirstMessage ? initialWindow.logs : todayLogs;
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
      const summariesForPrompt = trainingSummaries.slice(-MAX_SUMMARIES_IN_PROMPT);
      sections.push(`Historical training summary:\n${JSON.stringify(summariesForPrompt)}`);
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
      const logLabel = isFirstMessage ? initialWindow.label : "Today's logs";
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
