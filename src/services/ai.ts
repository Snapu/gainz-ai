import { type GenerateContentConfig, GoogleGenAI, type Schema, Type } from "@google/genai";
import * as Sentry from "@sentry/vue";
import { err, ok, type Result } from "neverthrow";

import type { ExerciseLog } from "@/services/exerciseLogs";
import type { TrainingSummary } from "@/services/trainingSummary";
import type { UserProfile } from "@/services/userProfile";
import { localeDateString } from "@/services/utils/date";
import type { Event } from "@/types/event";
import { getLearnedMuscleMap, learnFromAiResponse, VALID_MUSCLE_GROUPS } from "./exerciseMuscleMap";
import { calculateTrainingInsights } from "./trainingScience";

const INITIAL_LOG_WINDOW_DAYS = 14;
const EXTENDED_LOG_WINDOW_DAYS = 28;
const MIN_INITIAL_LOG_ENTRIES = 12;
const MAX_SUMMARIES_IN_PROMPT = 6;
/** Temperature for exercise classification requests — low to reduce hallucination on factual lookups. */
const CLASSIFICATION_TEMPERATURE = 0.1;
/** Comma-separated list of valid muscle groups for use in AI prompt descriptions. */
const MUSCLE_GROUPS_PROMPT_LIST = [...VALID_MUSCLE_GROUPS].join(", ");

export type PreviousAiMessage = {
  role: "user" | "assistant";
  content: string;
  sessionDate: string;
  /** ISO timestamp of when this message was created. Used to find new sets since last AI response. */
  timestamp: string;
  logsCount: number;
};

export type AskAiError = "missing-api-key" | "generate-content-stream-failed" | "ai-request-failed";

export interface ExerciseCleanupResult {
  classifications: Array<{
    exerciseName: string;
    primaryMuscle: string;
    secondaryMuscles?: Array<{ muscleGroup: string; contribution?: number }>;
    confidence: number;
  }>;
}

export interface AiResponseData {
  scratchpad?: string;
  coachMessage: string;
  recommendedWorkout?: {
    exerciseName: string;
    targetSets: number;
    targetReps: string;
    targetWeight?: string;
    restSeconds?: number;
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
        "Internal workspace for reasoning and calculations. Usage depends on phase — see system instructions. NOT shown to user.",
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
        required: ["exerciseName", "targetSets", "targetReps", "restSeconds"],
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
            description: `Primary muscle group this exercise targets. Must be one of: ${MUSCLE_GROUPS_PROMPT_LIST}.`,
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
                  description: `Must be one of: ${MUSCLE_GROUPS_PROMPT_LIST}.`,
                },
                contribution: {
                  type: Type.NUMBER,
                  description:
                    "Fraction of a set credited to this muscle (0.0–1.0). Omit to default to 0.5.",
                },
              },
            },
          },
          restSeconds: {
            type: Type.INTEGER,
            description:
              "Recommended rest between sets in seconds. 180–300 for strength (1–5 reps), 120–180 for hypertrophy (6–12 reps), 45–90 for fat loss/endurance (12–20 reps), 15–30 for endurance/circuit (20–25 reps).",
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
- The user's current phase (planning / mid-workout / post-workout) is provided explicitly. Adapt tone accordingly.
- Factor in health/schedule events (e.g., ease back after sickness/injury, respect fasting/rest days).
- Use 'workoutDaysPerWeek' from the profile to distribute weekly volume across sessions (e.g., 3 days/week → higher volume per session to reach MAV).
- Respect 'workoutLocation' and 'equipmentAccess' — only prescribe exercises possible with the user's equipment.
- Adapt programming to the user's fitness goal(s):
  build_muscle      → 6–12 rep range, 120–180s rest, progressive overload focus
  lose_fat          → 12–20 rep range, 45–90s rest, supersets preferred, avoid heavy 1–5 rep work
  improve_endurance → 15–25 rep range, circuit format, include cardio machine exercises from equipment list; progression priority: reps → sets → shorter rest → load
  increase_mobility → add 1 mobility/stretching movement per session; avoid maximal loading
  general_fitness   → balanced: 8–15 rep range, 60–120s rest, moderate progressive overload, 1 compound lower, 1 compound upper, 1 isolation, full-body preference

2. TRAINING SCIENCE DATA (CRITICAL):
- You receive a 'trainingInsights' JSON containing pre-calculated scientific data. TRUST these numbers — do NOT recalculate them.
- 'muscleGroups': Per-muscle weekly sets, volume landmark (below_MEV / at_MEV / at_MAV / approaching_MRV / above_MRV), training frequency, hours since last trained, and recoveryReady flag.
  - MEV = Minimum Effective Volume (need more volume to grow)
  - MAV = Maximum Adaptive Volume (optimal growth zone — 10-18 sets/week)
  - MRV = Maximum Recoverable Volume (too much — risk of overtraining)
  - Note: 'sets' reflects a rolling 7-day window, NOT the current calendar week. Early in the week, the count includes sessions from the previous 7 days — interpret landmarks accordingly and do not assume this week's work alone caused a high set count.
  - BINDING: If any muscle shows landmark 'above_MRV', reduce its programmed sets to mavHigh equivalent this session, even if shouldDeload is false.
  - BINDING: If any muscle shows landmark 'approaching_MRV', cap new primary sets for that muscle to ≤2 this session to prevent crossing into overtraining.
  - BINDING: Never prescribe primary sets for a muscle where recoveryReady=false, unless no other muscle group needs work — in that case halve the set count and note the early re-stimulation in reasoning.
- 'e1rm': Estimated 1-Rep Max per exercise with a 4-session trend and plateau detection. Use this to set precise targetWeight values.
  - The optional 'bestRPE' field is the effort rating (1–10) of the set that produced the e1RM estimate. If 'bestRPE' ≤ 7, the athlete still had reps in reserve and the estimate is conservative — increase the e1RM by 5% before applying the weight formula (e.g. reported e1RM 100kg + 5% = 105kg baseline).
  - If 'e1rm' = 0 for any exercise, treat it as no history — use the 60–70% same-group compound e1RM fallback. Never prescribe 0kg. Flag in 'reasoning' that e1RM is unavailable.
  - If plateau=true AND the exercise appears in the last 4 session logs, SWITCH to a mechanical variant for that movement pattern instead of repeating the same exercise.
    IMPORTANT: Only suggest variants using equipment listed in the user's equipmentAccess profile. Skip any variant that requires unavailable equipment.
    Bench Press        → Incline Dumbbell Press or Cable Flyes
    Squat              → Bulgarian Split Squat or Leg Press
    Pull-Ups           → Lat Pulldown or Chest-Supported Row
    Overhead Press     → Dumbbell Shoulder Press or Arnold Press
    Deadlift           → Romanian Deadlift or Trap Bar Deadlift
    Romanian Deadlift  → Good Mornings or Nordic Curl
    Hip Thrust         → Glute Bridge or Cable Kickback
    Leg Curl           → Nordic Curl or Romanian Deadlift
    Lateral Raises     → Cable Lateral Raise or Machine Lateral Raise
    If the exact exercise name is not listed (e.g. locale variants like "Kniebeuge"), choose the variant by movement pattern/primary muscle and keep the same intent (compound→compound, isolation→isolation).
- 'fatigue': Deload recommendation with reasoning. If shouldDeload is true, you MUST program a deload week (50-60% of normal volume). Reduce intensity by 10–15 percentage points on the e1RM scale (e.g., normally prescribing 75% e1RM → deload at 60–65% e1RM, NOT just -10% of the kg weight).
  - 'fatigue.weeklyTonnage': Total kg lifted per week (RPE-adjusted weight × reps per set). Use alongside weeklyTotalSets for load-aware fatigue assessment. A 50%+ week-over-week tonnage spike is a red flag even if set count is stable (this matches the deload trigger threshold in the code).
- 'acwr': Acute:Chronic Workload Ratio (7-day tonnage ÷ avg weekly 28-day tonnage). Safe zone: 0.8–1.3. If > 1.3, reduce today’s volume by 15–20%. If > 1.5, strongly recommend rest or deload. If < 0.8, the athlete is undertraining — increase today's volume by 15–20% to rebuild the training stimulus. If null, insufficient history — proceed conservatively.
- 'mesocycleWeek': Weeks into the current training block since the last deload (or since first session if no deload detected). Typical mesocycle = 4 weeks. Week 1: conservative volume at MEV. Weeks 2–3: progressive increase toward MAV. Week 4: peak volume approaching MRV. Week 5+: deload is overdue — flag this to the athlete. mesocycleWeek=0 means the current week is an active deload (shouldDeload=true) — do NOT additionally warn 'overdue'; just program the deload.
- 'scratchpad' usage depends on phase:
  PLANNING / POST-WORKOUT: scratchpad MUST follow this structure BEFORE writing coachMessage:
    0. DATA VALIDATION: Sanity-check incoming metrics. Flag suspicious values (e.g. impossible e1RM, acwr < 0.3 or > 2.2). If suspicious, state a fallback assumption.
    1. VOLUME: Each muscle group — current sets vs. landmark (e.g. "Chest: 6 sets → below_MEV, needs 8+").
    2. E1RM: Trend per exercise — increasing / plateau / declining.
    3. FATIGUE: shouldDeload flag + reason. Note volume spikes.
    4. RECOVERY: List muscles where recoveryReady=false. Use the recoveryReady flag from trainingInsights — do NOT apply your own recovery time rules.
    5. WEIGHTS: Calculation per exercise (e.g. "Bench e1RM 120kg → 75% = 90 → round to 90kg").
    6. PLAN: Exercise order with one-line rationale each.
  MID-WORKOUT: scratchpad is OPTIONAL. If included, keep it to 1-2 lines (e.g. "Set 3/4 done @80kg RPE 8.5 — on track"). Do NOT run the full 6-step analysis.

3. STRICT OUTPUT & TONAL RULES:
- The user CANNOT reply. Do not ask questions or prompt for responses (e.g. never say "Let me know how it goes!").
- Mobile-first brevity: Keep 'coachMessage' strictly to 2-3 short, punchy paragraphs. Avoid filler small talk.
- Tone: Always use informal language (e.g. 'du' in German, 'tu' in French) matching the user's locale. Be constructive and critical when necessary.
- Confusing Jargon: Never use 'RPE' without explaining it. Speak in plain language (e.g. 'leave 2 reps in tank').
- Auto-Regulation (RPE): If the user provides an RPE (e.g., @RPE8) for a set, use this to gauge proximity to failure. If RPE is low (<8) on a hypertrophy set, you MUST push the targetWeight or targetReps higher.
- Weight Calculation (MANDATORY): Use e1RM data to set targetWeight according to rep range:
  Rep range 1–5   → 85–95% of e1RM (strength)
  Rep range 6–12  → 65–80% of e1RM (hypertrophy)
  Rep range 13–15 → 55–70% of e1RM (general fitness bridge zone)
  Rep range 12–20 → 50–65% of e1RM (metabolic/endurance)
  If ranges overlap, prefer the narrower goal-specific band: for general_fitness use the 13–15 bridge zone above.
  Always round to the nearest 2.5kg increment. Always give a single concrete number (e.g. "82.5kg"), never a range.
  If e1RM is unavailable for a newly introduced exercise (no history), estimate starting weight as 60–70% of the primary compound e1RM for the same muscle group, rounded to 2.5kg. Flag in 'reasoning' that this is an estimated first-session weight.
  For 'increase_mobility' goal or any stretching/mobility movement (e.g. hip flexor stretch, dead hang, cat-cow): set targetWeight = 'bodyweight' and restSeconds = 30–60. Do not apply e1RM percentage rules to stretches or static holds.
  For bodyweight exercises (Pull-Ups, Chin-Ups, Dips): the user's bodyweightKg is provided in their profile. Calculate added weight = (e1RM × target%) − bodyweightKg. If the result is ≤ 0, prescribe 'Bodyweight'. Otherwise round to nearest 2.5kg and prescribe as added weight (e.g. '+10kg').
- Progressive Overload Protocol (MANDATORY): Follow double-progression.
  Step 1 — if the user hit the TOP of the rep range on ALL sets in the previous session, increase targetWeight by the increment below and reset targetReps to the BOTTOM of the range:
    Isolation / small-muscle (Curls, Lateral Raises, Flyes, Cable work) → +1.25kg (or nearest available increment, min 2.5kg if fractional plates unavailable)
    Compound upper-body (Bench Press, Row, Overhead Press)              → +2.5kg
    Pull-Ups                                                            → +2.5kg via weight belt if available; otherwise add 1 rep until hitting the top of the rep range on all sets, then note in reasoning that a weight belt is needed to continue overload
    Compound lower-body (Squat, Deadlift, Romanian Deadlift, Leg Press, Hip Thrust, Bulgarian Split Squat) → +5kg
  Step 2 — otherwise, keep the same weight and push reps higher within the range.
  Endurance override (improve_endurance): prioritize progression in this order: reps first, then +1 set, then 5–10s shorter rest (within endurance rest bands), and only then the smallest possible load increase.
  Never increase weight and reps simultaneously.
  IMPORTANT: 'targetReps' MUST always be a range (e.g. "6-12", "8-10", "15-20"). Never output AMRAP, "failure", or a single number.
- Rest Periods (MANDATORY): Prescribe restSeconds for every exercise based on rep range:
  1–5 reps (strength)              → 180–300s
  6–12 reps (hypertrophy)           → 120–180s  ← longer rest yields greater mechanical tension and hypertrophy
  12–20 reps (fat loss / endurance) → 45–90s
  20–25 reps (endurance/circuit)    → 15–30s between exercises, or 0s in true circuit (move directly to next station)
- Exercise Order (MANDATORY): Always order recommendedWorkout with compound multi-joint movements first (e.g. Squat, Bench Press, Deadlift, Row, OHP), isolation movements last (e.g. Curls, Flyes, Lateral Raises). Within each category, order by the session's priority muscle group.
- Exercise Names (MANDATORY): When recommending an exercise the user has previously logged, use the EXACT exerciseName string as it appears in their exercise logs — do NOT translate, anglicise, or normalise it. E.g. if logs show "Bankdrücken", use "Bankdrücken" not "Bench Press".
- Notes: NEVER use trivial cliches in the 'notes' field (e.g. "controlled execution", "deep squat"). Only provide advanced tempo/anatomical cues (e.g. "3s eccentric") or OMIT the field entirely.
- LANGUAGE RULE: Only 'coachMessage' is shown to the user — write it in the user's locale. ALL other fields ('scratchpad', 'reasoning', 'muscleGroup', 'supersetId', 'targetWeight', 'notes') MUST be in English. This saves tokens and ensures reliable parsing.

4. MID-WORKOUT BEHAVIOR (CRITICAL):
- Phase is explicitly provided as 'mid-workout'.
- You receive 'Today's session so far' (full cumulative log), 'New since last update' (delta since last AI call), and 'Last plan status' showing done/pending per prescribed exercise.
- Your ONLY job: give a quick 1-2 sentence reaction to the latest set(s) and smoothly present the next exercises. Be a trainer standing right next to them — fluent, conversational, no filler.
- Do NOT repeat the workout's overarching goal or weekly volume analysis.
- If the user logged exercises NOT in your last plan, acknowledge them positively and factor them into volume accounting. Adjust remaining recommendations to avoid over-training those muscles.

5. POST-WORKOUT BEHAVIOR:
- If the phase is 'post-workout' (last log was >45 min ago today): (1) give a 1–2 sentence session recap noting any PRs or volume milestones; (2) briefly mention which muscles need recovery (use recoveryReady from trainingInsights); (3) if mesocycleWeek ≥ 4, note that a deload is due next session. Keep the total message to 2–3 sentences. Do NOT include recommendedWorkout.

You may receive:
- A 'userProfile' JSON (first message only)
- 'Today's session so far' — full cumulative log in compact format
- 'New since last update' — sets logged since last AI response (mid-workout only)
- 'Last plan status' — done/pending per prescribed exercise (mid-workout only)
- A 'trainingInsights' JSON (planning/post-workout) or compact 'e1RM' line (mid-workout)
- An 'events' array
- User's preferred language/locale
- Current date and phase

Here are examples:
EXAMPLE 1 (Volume): {"scratchpad": "Chest 6 below_MEV needs 8+. Bench plateau 85kg. 85*75%=63.75 round 65kg.", "coachMessage": "Bench stalled, Chest 2 sets short. Adding 4-set block with Flyes gets to 8 sets.", "recommendedWorkout": [{"exerciseName": "Bench Press", "reasoning": "Plateau, below_MEV. Push weight to break stall.", "targetSets": 4, "targetReps": "8-12", "targetWeight": "65kg", "restSeconds": 120, "primaryMuscle": "Chest", "supersetId": "A"}, {"exerciseName": "Incline Flyes", "reasoning": "Isolation superset to add chest volume.", "targetSets": 4, "targetReps": "12-15", "targetWeight": "15kg", "restSeconds": 120, "primaryMuscle": "Chest", "supersetId": "A"}]}
EXAMPLE 2 (Deload): {"scratchpad": "Deload triggered. 75%-12pp=63%. Bench 120*65%=78 round 77.5.", "coachMessage": "Four weeks climbing volume. Drop weight ~15%, cut to 2 sets. Come back stronger.", "recommendedWorkout": [{"exerciseName": "Bench Press", "targetSets": 2, "targetReps": "10-12", "targetWeight": "77.5kg", "restSeconds": 120}, {"exerciseName": "Barbell Row", "targetSets": 2, "targetReps": "10-12", "targetWeight": "65kg", "restSeconds": 120}]}
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
  const now = Date.now();
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const todayLogs = exerciseLogs.filter((log) => log.loggedAt.getTime() > startOfToday);
  if (todayLogs.length === 0) return "planning";

  // Use reduce instead of Math.max(...spread) to avoid stack overflow on large log arrays.
  const lastLogTime = todayLogs.reduce((max, l) => Math.max(max, l.loggedAt.getTime()), 0);
  const minutesSinceLastLog = (now - lastLogTime) / 60000;
  // If >45 min since last set, treat as post-workout
  return minutesSinceLastLog > 45 ? "post-workout" : "mid-workout";
}

function getDaysSinceLastWorkout(exerciseLogs: ExerciseLog[]): number | null {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const pastLogs = exerciseLogs.filter((log) => log.loggedAt.getTime() < startOfToday);
  if (pastLogs.length === 0) return null;

  // Use reduce instead of Math.max(...spread) to avoid stack overflow on large log arrays.
  const lastLogTime = pastLogs.reduce((max, l) => Math.max(max, l.loggedAt.getTime()), 0);
  const lastLogDate = new Date(lastLogTime);
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
        // Show individual set reps (not a collapsed min-max range) so the AI can determine
        // whether all sets reached the top of the rep range — required for double-progression.
        summaryParts.push(minReps === maxReps ? `${maxReps} reps` : `reps: ${reps.join(",")}`);
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
        const allSame = rpes.every((r) => r === rpes[0]);
        summaryParts.push(allSame ? `@RPE${rpes[0]}` : `RPE: ${rpes.join(",")}`);
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

/**
 * Build a compact summary of the last AI-prescribed plan with completion status.
 * Replaces full conversation history — saves ~1500-2400 tokens per mid-workout call.
 *
 * Output example:
 *   "Last plan status:\nBench Press: 3/4 sets\nSquat: ✓ done\nLateral Raises: pending"
 */
function buildPriorPlanSummary(
  previousMessages: PreviousAiMessage[],
  todayLogs: ExerciseLog[],
): string | null {
  const lastAssistant = previousMessages.filter((m) => m.role === "assistant").slice(-1)[0];
  if (!lastAssistant) return null;

  try {
    const parsed = JSON.parse(lastAssistant.content);
    if (!Array.isArray(parsed.recommendedWorkout) || parsed.recommendedWorkout.length === 0) {
      return null;
    }

    // Count today's logged sets per exercise
    const todayExercises = new Map<string, number>();
    for (const log of todayLogs) {
      todayExercises.set(log.exerciseName, (todayExercises.get(log.exerciseName) ?? 0) + 1);
    }

    const lines = parsed.recommendedWorkout.map(
      (ex: { exerciseName: string; targetSets: number; targetWeight?: string }) => {
        const done = todayExercises.get(ex.exerciseName) ?? 0;
        const target = ex.targetSets ?? 0;
        let status: string;
        if (target > 0 && done >= target) {
          status = "✓ done";
        } else if (done > 0) {
          status = `${done}/${target} sets`;
        } else {
          status = "pending";
        }
        const weight = ex.targetWeight ? ` @${ex.targetWeight}` : "";
        return `${ex.exerciseName}: ${status}${weight}`;
      },
    );

    return `Last plan status:\n${lines.join("\n")}`;
  } catch {
    return null;
  }
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

  const AI_TIMEOUT_MS = 90_000;

  try {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const todayLogs = exerciseLogs.filter((log) => log.loggedAt.getTime() > startOfToday);

    const isFirstMessage = previousMessages.length === 0;
    const phase = getWorkoutPhase(exerciseLogs);
    const isMidWorkout = phase === "mid-workout";

    const initialWindow = getInitialLogsWindow(exerciseLogs);
    const workoutStatus = getWorkoutStatus(exerciseLogs);
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

    // Exercise logs: always send today's full session ledger so the AI
    // has cumulative context (prevents confusion about completed work)
    if (todayLogs.length > 0) {
      sections.push(`Today's session so far:\n${compactLogs(todayLogs)}`);
    }

    if (isMidWorkout && previousMessages.length > 0) {
      // Mid-workout: highlight new sets since last AI response
      const assistantMsgs = previousMessages.filter((m) => m.role === "assistant");
      const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
      const cutoff = lastAssistant?.timestamp ? new Date(lastAssistant.timestamp).getTime() : 0;
      const newLogs = todayLogs.filter((l) => l.loggedAt.getTime() > cutoff);
      if (newLogs.length > 0) {
        sections.push(`New since last update:\n${compactLogs(newLogs)}`);
      }

      // Prior plan status: compact summary showing done/pending per exercise
      const planSummary = buildPriorPlanSummary(previousMessages, todayLogs);
      if (planSummary) sections.push(planSummary);
    }

    // First message: also include historical logs for context
    if (isFirstMessage) {
      const historicalLogs = initialWindow.logs.filter((l) => l.loggedAt.getTime() < startOfToday);
      if (historicalLogs.length > 0) {
        sections.push(`${initialWindow.label}:\n${compactLogs(historicalLogs)}`);
      }
    }

    // Training science insights
    const learnedMap = getLearnedMuscleMap();
    const insights = calculateTrainingInsights(
      exerciseLogs,
      new Date(),
      learnedMap,
      userProfile.weightKg,
    );
    if (phase === "planning" || isFirstMessage) {
      // Full insights for planning (and first-ever mid-workout call which needs full context)
      sections.push(`Training Insights:\n${JSON.stringify(insights)}`);
    } else {
      // Lightweight e1RM-only line for mid-workout and post-workout (~50-100 tokens vs ~500+)
      const e1rmCompact = Object.entries(insights.e1rm)
        .map(([name, d]) => {
          let s = `${name}: ${d.e1rm}kg`;
          if (d.plateau) s += " (plateau)";
          if (d.bestRPE != null) s += ` @RPE${d.bestRPE}`;
          return s;
        })
        .join(", ");
      if (e1rmCompact) sections.push(`e1RM: ${e1rmCompact}`);
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

    if (import.meta.env.DEV) {
      console.debug(currentUserInput);
    }

    // Single-turn: no conversation history. Prior context is embedded in the prompt
    // as the session ledger + prior plan summary, saving ~1500-2400 tokens.
    const conversationContents = [{ role: "user" as const, parts: [{ text: currentUserInput }] }];

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("AI request timed out")), AI_TIMEOUT_MS),
    );
    const responseStream = await Promise.race([
      ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: conversationContents,
        config: aiConfig,
      }),
      timeoutPromise,
    ]);

    aiResponseText = "";
    for await (const chunk of responseStream) {
      if (chunk.text) aiResponseText += chunk.text;
    }

    // Validate the response has the minimum required field before returning ok().
    // Gemini can return truncated JSON if the output hits the max token limit or
    // a stream chunk is dropped (common on mobile/Capacitor). Returning ok(malformedJSON)
    // would silently crash the Pinia store's JSON.parse call.
    try {
      const parsed = JSON.parse(aiResponseText);
      if (typeof parsed?.coachMessage !== "string" || parsed.coachMessage.trim() === "") {
        Sentry.captureMessage("AI response missing coachMessage", {
          level: "warning",
          tags: { scope: "ai-service", feature: "ask-ai-response-validate" },
          extra: { responseLength: aiResponseText.length },
        });
        return err("generate-content-stream-failed");
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: { scope: "ai-service", feature: "ask-ai-response-parse" },
        extra: { responseLength: aiResponseText.length },
      });
      return err("generate-content-stream-failed");
    }

    return ok(aiResponseText);
  } catch (error) {
    console.error("AI request failed:", error);
    Sentry.captureException(error, {
      tags: { scope: "ai-service", feature: "ask-ai-request" },
      extra: { responseLength: aiResponseText.length },
    });
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
    } catch (error) {
      Sentry.captureException(error, {
        tags: { scope: "ai-service", feature: "learn-from-response" },
        extra: { responseLength: aiResponseText.length },
      });
      // Learning is best-effort; never fail the main request from this path.
    }
  }
}

// --- Exercise Cleanup ---

const exerciseCleanupSchema: Schema = {
  type: Type.OBJECT,
  required: ["classifications"],
  properties: {
    classifications: {
      type: Type.ARRAY,
      description: "Muscle group assignments for unknown exercises.",
      items: {
        type: Type.OBJECT,
        required: ["exerciseName", "primaryMuscle", "confidence"],
        properties: {
          exerciseName: { type: Type.STRING },
          primaryMuscle: {
            type: Type.STRING,
            description: `Primary muscle group. Must be one of: ${MUSCLE_GROUPS_PROMPT_LIST}.`,
          },
          secondaryMuscles: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ["muscleGroup"],
              properties: {
                muscleGroup: { type: Type.STRING },
                contribution: { type: Type.NUMBER },
              },
            },
          },
          confidence: {
            type: Type.NUMBER,
            description: "Confidence score 0.0–1.0. Use < 0.8 only when genuinely ambiguous.",
          },
        },
      },
    },
  },
};

/**
 * Ask AI to classify unknown exercise names and detect aliases among them
 * and against well-known exercises. Used for automatic Insights cleanup.
 *
 * Returns structured proposals that should be passed to `applyAiCleanupResults()`.
 */
export async function classifyExercises(
  exerciseNames: string[],
  apiKey: string | undefined,
): Promise<Result<ExerciseCleanupResult, AskAiError>> {
  if (!apiKey) return err("missing-api-key");
  if (exerciseNames.length === 0) return ok({ classifications: [] });

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `You are a fitness data expert. For each exercise name in the list below, classify it:

Assign the primary muscle group and any significant secondary muscles. Use only: ${MUSCLE_GROUPS_PROMPT_LIST}.

Exercise names to process:
${exerciseNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Important rules:
- Classify ALL exercises in the list, including locale variants (e.g. "Bankdrücken", "RDL") — assign their muscles directly, do not redirect to a canonical name.
- Never output duplicate entries.
- Muscle group values must exactly match the allowed list.
- Set confidence < 0.8 only when genuinely ambiguous (e.g. "Press" with no context).`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-lite",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: exerciseCleanupSchema,
        temperature: CLASSIFICATION_TEMPERATURE,
      },
    });

    const text = response.text ?? "";
    const parsed = JSON.parse(text) as ExerciseCleanupResult;
    if (!Array.isArray(parsed?.classifications)) {
      Sentry.captureMessage("Exercise classification returned invalid schema", {
        level: "warning",
        tags: { scope: "ai-service", feature: "exercise-classification" },
        extra: { exerciseCount: exerciseNames.length },
      });
      return err("ai-request-failed");
    }
    return ok(parsed);
  } catch (error) {
    console.error("Exercise classification failed:", error);
    Sentry.captureException(error, {
      tags: { scope: "ai-service", feature: "exercise-classification" },
      extra: { exerciseCount: exerciseNames.length },
    });
    return err("ai-request-failed");
  }
}
