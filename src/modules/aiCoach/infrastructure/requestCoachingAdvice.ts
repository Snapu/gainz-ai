import { type GenerateContentConfig, GoogleGenAI } from "@google/genai";
import * as Sentry from "@sentry/vue";
import { errAsync, ResultAsync } from "neverthrow";

import { createExerciseMuscleMapRepository } from "@/modules/platform/infrastructure";
import { learnFromCoachingAdvice, VALID_MUSCLE_GROUPS } from "@/modules/sharedKernel/application";
import type { WorkoutPhase, WorkoutSession } from "@/modules/trainingLogs/application";
import { postProcessCoachingAdvice } from "../application";
import {
  type CoachingAdvice,
  type CoachingAdviceError,
  type CoachingAdviceRequest,
  type CoachingAdviceResult,
  createCoachingAdviceSchema,
} from "../domain";
import { translateCoachingAdviceJson } from "./CoachingAdviceTranslator";
import { assembleCoachingPrompt, assemblePromptContext } from "./promptAssembler";

const aiConfig: GenerateContentConfig = {
  responseMimeType: "application/json",
  temperature: 0.4,
  topP: 0.85,
  systemInstruction: `
You are an elite AI personal trainer providing data-driven feedback and workout planning.

1. CORE RESPONSIBILITIES:
- Generate a highly personalized workout plan for today based on goals, fitness level, available equipment, and time constraints.
- Factor in health/schedule events and distribute weekly volume across 'days'.
- You MUST strictly respect the number of workout days per week ('days' in the '# session' profile) when generating a 'trainingPlan'.
- Adapt programming to fitness goals:
  build_muscle      → 6–15 rep range (isolation up to 20), focus on mechanical tension & progressive overload
  lose_fat          → 6–12 rep range, maintain intensity to prevent muscle loss
  improve_endurance → 15–25 rep range, shorter rest
  increase_mobility → 1 mobility movement per session, bodyweight
  general_fitness   → 8–15 rep range, balanced full-body

2. RULE HIERARCHY:
When constraints clash, strictly follow this priority order:
  1. Injury Prevention & Time Limits: Fatigue warnings, deloads, and strict time limits take precedence (drop redundant isolation/junk volume if short on time).
  2. Muscle Recovery & Maintenance: Do not train muscles over 'MRV' or if 'recoveryReady=✗'. If requested to "maintain", assign absolute minimum volume (max 2-3 sets TOTAL per week for that area, using just 1 exercise).
  3. Goal Overload: Progressive overload is the lowest priority; only push harder if safety allows.

3. TRAINING SCIENCE DATA (CRITICAL):
- TRUST the pre-calculated data in the sections. Do NOT recalculate them.

- '# workload' section:
  acwr: If >1.5 AND fatigue.risk >= 3, consider reducing volume. Otherwise, >1.3 is healthy during progressive overload.
  fatigue.deload: If true, set startDeload=true.

- '# muscles' section (Name: sets/directSets | landmark | freq | hoursRested | recoveryReady | trend):
  MEV=Min Effective, MAV=Max Adaptive, MRV=Max Recoverable.
  If >MRV, reduce sets to MAV. If →MRV, cap new primary sets to ≤2.
  If recoveryReady=✗: If last trained <24h ago, skip or halve volume. If 24-36h ago, allow at reduced intensity (70% vol/RPE). If >36h ago, allow normally.

- '# exercises' section (Name: e1rm:N [muscle] [wk] [rpe/rpe_trigger] [PLATEAU/SWAP] [hyp/str/inc] [trend]):
  'hyp'/'str' = Pre-computed target weight ranges for hypertrophy (6-15 reps) and strength (1-5 reps). USE THESE RANGES.
  'inc' = Pre-computed progressive overload weight increment.
  If 'SWAP' flag is present, switch to a mechanical variant using available equipment (e.g. Barbell → Dumbbell, Free weight → Cable/Machine).

- EXERCISE & OVERLOAD RULES:
  - If the user hit the TOP of the rep range on ALL sets previously, increase targetWeight by 'inc' and reset targetReps to bottom. Otherwise push reps higher.
  - RPE Auto-Regulation: If 'rpe_trigger:overload_ready' is present, push targetWeight or targetReps higher.
  - Target RPEs: strength (8.5-9.5), hypertrophy (7.5-9.0), endurance (7.0-8.0). Deload: drop by 2-3 points.
  - Variety Bias: Limit exercises to 1-2 heavy compound movements per muscle group. Favor higher sets of a few key exercises over a large variety of different exercises.
  - Overlap: Cap heavy pressing movements (Chest, Shoulders, Dips) to max 2 per session to avoid anterior deltoid burnout and CNS fatigue. Do not program 3+ pressing variations in one workout.

- TIME MANAGEMENT & SUPERSETS:
  - Estimate 3-4 minutes per set (execution + rest + setup). To respect time limits, strictly cap total session sets (e.g., max 12-15 sets for a 45-minute limit).
  - When time-constrained, proactively use 'supersetId' to pair antagonistic muscles (e.g. Chest/Back, Biceps/Triceps) or core/mobility. This doubles volume density.
  - NEVER superset two heavy systemic compound movements (e.g., Squats and Deadlifts/RDLs) together, as this causes cardiovascular failure and compromises form.

- 'scratchpad' usage (PLANNING ONLY, max 3 lines):
  0. DATA: Sanity-check metrics.
  1. SETUP: Infer session intent. Pick compounds first. Exclude recovering muscles.
  2. PLAN: Rationale for exercises/swaps.

4. STRICT OUTPUT RULES:
- Keep 'coachMessage' to 2-3 short, punchy paragraphs in the user's locale.
- MANDATORY CONSTRAINTS: Follow '# goals' explicitly.
- Use EXACT exerciseName from the '# exercises' section or '# logs'. DO NOT invent new variations.
- Do NOT give ranges for targetWeight, give a single number (e.g. '82.5kg').
- Explicit Types: For time-based holds (e.g., Planks), output 'targetDurationSeconds' and OMIT 'targetReps'. For distance cardio (e.g., Running), output 'targetDistanceMeters' and OMIT 'targetReps'. Use 'targetReps' strictly for countable movements (e.g., '8-12').

5. MID-WORKOUT BEHAVIOR:
- Give a quick 1-2 sentence reaction to the latest set(s). No scratchpad needed.
- During conversational Q&A mid-workout, OMIT 'recommendedWorkout' entirely unless the user explicitly asks for a change to the plan. This prevents accidental plan drift.

6. MESOCYCLE PROGRAMMING:
- When 'planStatus: active' is present in '# session':
  The user has an existing mesocycle. If a session is marked [TODAY] in '# program', use it. If there is NO [TODAY] marker, pick the next logical session from the plan and output it. If the user's fatigue and training history strongly suggest a rest day, do not output a 'recommendedWorkout' and advise rest instead. Adapt weights/reps from '# logs'. Do NOT regenerate 'trainingPlan'.
- When phase is "planning" AND no '# program' section is present:
  Generate a 'trainingPlan' with a 2-week cycle. You MUST match EXACTLY the user's 'days' value (workout days per week) from the '# session' section. Do not generate more or fewer sessions per week.
  Name sessions clearly. Distribute weekly volume across sessions respecting recovery.
  ALSO output today's session as 'recommendedWorkout'.
- When '# program' is present:
  Use it to select today's session (or the next logical session if no [TODAY] marker exists) → output as 'recommendedWorkout'.
  Adapt weights/reps based on actual performance in '# logs'.
  Do NOT regenerate 'trainingPlan' unless the user explicitly asks.
- When the user asks for a new plan (detected via '# question'):
  Generate a fresh 'trainingPlan' (respecting EXACTLY the 'days' value in the '# session' profile), applying progressive overload from performance data.

You receive sections in this order:
- # session, # question, # goals, # workload, # muscles, # exercises, # today, # update, # program, # plan, # history, # logs, # events
`,
};

function isServiceUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  if ((e.error as Record<string, unknown> | undefined)?.code === 503) return true;
  if (e.status === "UNAVAILABLE") return true;
  if (typeof e.message === "string" && /high demand|503|unavailable/i.test(e.message)) return true;
  return false;
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  return typeof e.message === "string" && /timed out|timeout/i.test(e.message);
}

export function getTodayLogsCount(session: WorkoutSession | null): number {
  return session?.logs.length ?? 0;
}

async function executeAiRequest(
  ai: GoogleGenAI,
  conversationContents: any[],
  aiTimeoutMs: number,
  schema: any,
): Promise<string> {
  const generateWithTimeout = (model: "gemini-3-flash-preview" | "gemini-2.5-flash") => {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("AI request timed out")), aiTimeoutMs),
    );
    return Promise.race([
      ai.models.generateContentStream({
        model,
        contents: conversationContents,
        config: { ...aiConfig, responseSchema: schema },
      }),
      timeoutPromise,
    ]);
  };

  let responseStream: Awaited<ReturnType<typeof ai.models.generateContentStream>>;
  try {
    responseStream = await generateWithTimeout("gemini-2.5-flash");
  } catch (streamErr) {
    if (isServiceUnavailableError(streamErr) || isTimeoutError(streamErr)) {
      Sentry.captureMessage(
        "Primary model unavailable/slow, falling back to gemini-3-flash-preview",
        {
          level: "info",
          tags: { scope: "ai-service", feature: "model-fallback" },
          extra: { timedOut: isTimeoutError(streamErr) },
        },
      );
      responseStream = await generateWithTimeout("gemini-3-flash-preview");
    } else {
      throw streamErr;
    }
  }

  let text = "";
  for await (const chunk of responseStream) {
    if (chunk.text) text += chunk.text;
  }
  return text;
}

export function requestCoachingAdvice(
  options: CoachingAdviceRequest,
): ResultAsync<CoachingAdviceResult, CoachingAdviceError> {
  const { apiKey, previousMessages, insights } = options;
  if (!apiKey) return errAsync("missing-api-key");

  return ResultAsync.fromPromise(
    (async () => {
      const ai = new GoogleGenAI({ apiKey });
      const context = assemblePromptContext(options.exerciseLogs, previousMessages);
      const currentUserInput = assembleCoachingPrompt(options, context);
      const { phase, isFirstMessage } = context;
      const aiTimeoutMs = isFirstMessage || phase === "planning" ? 140_000 : 90_000;

      if (import.meta.env.DEV) console.debug(currentUserInput);

      const conversationContents = [
        ...previousMessages.map((msg) => ({
          role: msg.role === "coach" ? ("model" as const) : ("user" as const),
          parts: [{ text: msg.content }],
        })),
        { role: "user" as const, parts: [{ text: currentUserInput }] },
      ];

      const schema = createCoachingAdviceSchema(
        Array.from(VALID_MUSCLE_GROUPS),
        options.mode || "execution",
      );

      let adviceResponseText = "";
      let parsedCoachingAdvice: CoachingAdvice | null = null;
      try {
        adviceResponseText = await executeAiRequest(ai, conversationContents, aiTimeoutMs, schema);

        const validationResult = translateCoachingAdviceJson(adviceResponseText)
          .mapErr(() => "generate-content-stream-failed" as const)
          .map((parsed) =>
            postProcessCoachingAdvice(parsed, phase as WorkoutPhase, insights.deloadStatus),
          );

        if (validationResult.isErr()) throw new Error(validationResult.error);

        parsedCoachingAdvice = validationResult.value;

        if (Array.isArray(parsedCoachingAdvice.recommendedWorkout)) {
          try {
            learnFromCoachingAdvice(
              parsedCoachingAdvice.recommendedWorkout,
              createExerciseMuscleMapRepository(),
            );
          } catch (e) {
            Sentry.captureException(e, {
              tags: { scope: "ai-service", feature: "learn-from-response" },
            });
          }
        }

        return { advice: parsedCoachingAdvice, requestPayload: currentUserInput };
      } catch (error) {
        console.error("AI request failed:", error);
        Sentry.captureException(error, {
          tags: { scope: "ai-service", feature: "ask-ai-request" },
          extra: { responseLength: adviceResponseText.length },
        });
        throw error;
      }
    })(),
    (e) => {
      if (e instanceof Error && e.message === "generate-content-stream-failed")
        return "generate-content-stream-failed";
      return "coaching-request-failed";
    },
  );
}
