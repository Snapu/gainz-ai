import { type GenerateContentConfig, GoogleGenAI } from "@google/genai";
import * as Sentry from "@sentry/vue";
import { errAsync, ResultAsync } from "neverthrow";

import type { Event } from "@/modules/events/domain";
import { createExerciseMuscleMapRepository } from "@/modules/platform/infrastructure";
import { learnFromCoachingAdvice, VALID_MUSCLE_GROUPS } from "@/modules/sharedKernel/application";
import { isoDateString } from "@/modules/sharedKernel/domain";
import {
  getSessionStartBoundary,
  resolveCurrentSession,
  type WorkoutSession,
} from "@/modules/trainingLogs/application";
import { postProcessCoachingAdvice } from "../application";
import {
  type CoachingAdvice,
  type CoachingAdviceError,
  type CoachingAdviceRequest,
  type CoachingAdviceResult,
  createCoachingAdviceSchema,
} from "../domain";
import { translateCoachingAdviceJson } from "./CoachingAdviceTranslator";
import {
  buildPriorPlanSummary,
  compactLogs,
  formatExercises,
  formatMuscles,
  formatPlanForPrompt,
  formatWorkload,
  getDaysSinceLastWorkout,
  getInitialLogsWindow,
  getRecentExerciseNames,
  getTrainingPattern,
  getWorkoutPhase,
  getWorkoutStatus,
} from "./promptBuilder";

const MAX_SUMMARIES_IN_PROMPT = 6;

/**
 * Configuration for the Google GenAI content generation.
 * The system instruction embedded below is optimized according to modern sports science guidelines:
 * 1. Hypertrophy (build_muscle) is centered around 6-12 reps with 2-3 min rest periods to maximize volume load and mechanical tension (Schoenfeld et al., 2016/2017).
 * 2. Fat Loss (lose_fat) focuses on muscle preservation using the same 6-12 rep range to maintain high mechanical tension under caloric deficit, preventing muscle loss (Hector & Phillips, 2018).
 * 3. Local endurance (improve_endurance) utilizes 15-25 reps and shorter rest periods for metabolic adaptations (Mitchell et al., 2012).
 */
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

export function requestCoachingAdvice(
  options: CoachingAdviceRequest,
): ResultAsync<CoachingAdviceResult, CoachingAdviceError> {
  const {
    apiKey,
    userProfile,
    insights,
    exerciseLogs,
    trainingSummaries,
    previousMessages,
    events = [],
    question,
  } = options;

  if (!apiKey) return errAsync("missing-api-key");

  return ResultAsync.fromPromise(
    (async () => {
      const ai = new GoogleGenAI({ apiKey });
      let adviceResponseText = "";
      let parsedCoachingAdvice: CoachingAdvice | null = null;
      let currentUserInput = "";

      try {
        const session = resolveCurrentSession(exerciseLogs);
        const todayLogs = session?.logs ?? [];

        const isFirstMessage = previousMessages.length === 0;
        const phase = getWorkoutPhase(session);
        const isMidWorkout = phase === "mid-workout";
        const aiTimeoutMs = isFirstMessage || phase === "planning" ? 140_000 : 90_000;

        const recentExerciseNames = getRecentExerciseNames(exerciseLogs, previousMessages, 90);
        const initialWindow = getInitialLogsWindow(exerciseLogs);
        const workoutStatus = getWorkoutStatus(session);
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

        // ── # session — metadata + profile + preferences merged ──────────────
        const sessionParts: string[] = [
          `date: ${isoDateString(now)} ${currentTime}`,
          `status: ${workoutStatus}`,
          `phase: ${phase}`,
        ];

        const restDays = getDaysSinceLastWorkout(exerciseLogs, session);
        if (restDays !== null) sessionParts.push(`restDays: ${restDays}`);

        // Inject plan status and current cycle week so the AI knows not to regenerate
        const activePlanLoaded = options.activePlan;
        if (activePlanLoaded) {
          sessionParts.push("planStatus: active");
          const cycleWeek = activePlanLoaded.getCurrentWeekNumber(now);
          sessionParts.push(`cycleWeek: ${cycleWeek}`);
        }

        if (isFirstMessage) {
          const pattern = getTrainingPattern(exerciseLogs);
          if (pattern) sessionParts.push(`pattern: ${pattern}`);
        }

        // Profile fields inline
        const p = userProfile;
        const profileParts: string[] = [];
        if (p.age != null) profileParts.push(`age: ${p.age}`);
        if (p.heightCm != null) profileParts.push(`height: ${p.heightCm}`);
        if (p.weightKg != null) profileParts.push(`weight: ${p.weightKg}`);
        if (p.fitnessGoal?.length) profileParts.push(`goal: ${p.fitnessGoal.join(",")}`);
        if (p.fitnessLevel) profileParts.push(`level: ${p.fitnessLevel}`);
        if (p.workoutDaysPerWeek != null) profileParts.push(`days: ${p.workoutDaysPerWeek}`);
        if (p.workoutLocation) profileParts.push(`location: ${p.workoutLocation}`);
        if (profileParts.length) sessionParts.push(`profile: {${profileParts.join(", ")}}`);

        if (p.equipmentAccess?.length) {
          sessionParts.push(`equipment: [${p.equipmentAccess.join(", ")}]`);
        }

        // Locale and units (always)
        sessionParts.push(`locale: ${navigator.language}`);
        sessionParts.push("units: kg/min/m");

        const sections: string[] = [`# session\n${sessionParts.join("\n")}`];

        // ── # question ────────────────────────────────────────────────────────
        if (question) {
          sections.push(`# question\n${question}`);
        }

        // ── # goals ───────────────────────────────────────────────────────────
        if (isFirstMessage || question) {
          const freeInputClean = userProfile.freeUserInput?.trim();
          if (freeInputClean) {
            sections.push(`# goals\n${freeInputClean}`);
          }
        }

        // ── # workload / # muscles / # exercises — PRIMACY position ──────────
        // Include full training data when: planning from scratch, first message of the day,
        // a plan is active (so AI can adapt weights to actual performance), or a question was asked.
        const hasPlanActive = sessionParts.some((p) => p.startsWith("planStatus:"));
        if (phase === "planning" || isFirstMessage || question || hasPlanActive) {
          sections.push(`# workload\n${formatWorkload(insights)}`);
          sections.push(`# muscles\n${formatMuscles(insights)}`);
          sections.push(
            `# exercises\n${formatExercises(insights, exerciseLogs, recentExerciseNames)}`,
          );
        } else {
          // Mid-workout: compact e1RM line only (avoids re-sending full muscle/fatigue data)
          const e1rmCompact = Object.entries(insights.e1rm)
            .filter(([name]) => recentExerciseNames.has(name))
            .map(([name, d]) => {
              let s = `${name}: ${d.e1rm}kg`;
              if (d.plateau) s += " PLATEAU";
              if (d.bestRPE != null) s += ` @RPE${d.bestRPE}`;
              return s;
            })
            .join(", ");
          if (e1rmCompact) {
            sections.push(`# e1rm\n${e1rmCompact}`);
          }
        }

        // ── # today ───────────────────────────────────────────────────────────
        if (todayLogs.length > 0) {
          sections.push(`# today\n${compactLogs(todayLogs)}`);
        }

        // ── # update / # plan ─────────────────────────────────────────────────
        if (previousMessages.length > 0) {
          if (isMidWorkout) {
            const coachMessages = previousMessages.filter((m) => m.role === "coach");
            if (coachMessages.length > 0) {
              const lastCoach = coachMessages[coachMessages.length - 1];
              const cutoff = lastCoach?.timestamp ? new Date(lastCoach.timestamp).getTime() : 0;
              const newLogs = todayLogs.filter((l) => l.loggedAt.getTime() > cutoff);
              if (newLogs.length > 0) {
                sections.push(`# update\n${compactLogs(newLogs)}`);
              }
            }
          }

          const planSummary = buildPriorPlanSummary(previousMessages, todayLogs);
          if (planSummary) {
            sections.push(`# plan\n${planSummary}`);
          }
        }

        const activePlan = options.activePlan;
        if (activePlan && (isFirstMessage || phase === "planning" || hasPlanActive)) {
          // Compute cycle week to pass to formatPlanForPrompt for [TODAY] marker accuracy
          const planCycleWeek = activePlan.getCurrentWeekNumber(now);
          sections.push(
            `# program\n${formatPlanForPrompt(activePlan, options.mode || "execution", planCycleWeek)}`,
          );
        }

        // ── # history / # logs — first message only ─────────────────
        if (isFirstMessage || question) {
          if (trainingSummaries.length > 0) {
            const summaryLines: string[] = [];
            // Group by year-month
            const byMonth = new Map<string, typeof trainingSummaries>();
            for (const s of trainingSummaries.slice(-MAX_SUMMARIES_IN_PROMPT)) {
              const key = `${s.year}-${String(s.month).padStart(2, "0")}`;
              const existing = byMonth.get(key) ?? [];
              existing.push(s);
              byMonth.set(key, existing);
            }
            for (const [monthKey, entries] of byMonth) {
              const workoutDays = entries[0]?.workoutDays ?? 0;
              summaryLines.push(`${monthKey} (${workoutDays}d):`);
              for (const s of entries) {
                const parts: string[] = [`${s.sets}s`];
                if (s.totalReps) parts.push(`${s.totalReps}r`);
                if (s.maxWeight) parts.push(`max:${s.maxWeight}`);
                if (s.totalVolume && s.totalReps && s.totalReps > 0) {
                  parts.push(`avg:${Math.round((s.totalVolume / s.totalReps) * 10) / 10}`);
                }
                summaryLines.push(`  ${s.exerciseName}: ${parts.join(" ")}`);
              }
            }
            sections.push(`# history\n${summaryLines.join("\n")}`);
          }
        }

        if (isFirstMessage) {
          const sessionBoundary = getSessionStartBoundary(session);
          const historicalLogs = initialWindow.logs.filter(
            (l) => l.loggedAt.getTime() < sessionBoundary,
          );
          if (historicalLogs.length > 0) {
            sections.push(`# ${initialWindow.label}\n${compactLogs(historicalLogs)}`);
          }
        }

        // ── # events ──────────────────────────────────────────────────────────
        if (events.length > 0) {
          const eventsText = events
            .map((event: Event) => `${event.type}: ${event.dates.join(", ")}`)
            .join("\n");
          sections.push(`# events\n${eventsText}`);
        }

        currentUserInput = sections.join("\n\n");

        if (import.meta.env.DEV) {
          console.debug(currentUserInput);
        }

        const conversationContents = [
          ...previousMessages.map((msg) => ({
            role: msg.role === "coach" ? ("model" as const) : ("user" as const),
            parts: [{ text: msg.content }],
          })),
          { role: "user" as const, parts: [{ text: currentUserInput }] },
        ];

        const generateWithTimeout = (model: "gemini-3-flash-preview" | "gemini-2.5-flash") => {
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("AI request timed out")), aiTimeoutMs),
          );
          return Promise.race([
            ai.models.generateContentStream({
              model,
              contents: conversationContents,
              config: {
                ...aiConfig,
                responseSchema: createCoachingAdviceSchema(
                  Array.from(VALID_MUSCLE_GROUPS),
                  options.mode || "execution",
                ),
              },
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

        adviceResponseText = "";
        for await (const chunk of responseStream) {
          if (chunk.text) adviceResponseText += chunk.text;
        }

        // Validate JSON response structure using the ACL (neverthrow-elegant pattern)
        const validationResult = translateCoachingAdviceJson(adviceResponseText)
          .mapErr((err) => {
            return "generate-content-stream-failed" as const;
          })
          .map((parsed) => {
            return postProcessCoachingAdvice(parsed, phase, insights.deloadStatus);
          });

        if (validationResult.isErr()) {
          throw new Error(validationResult.error);
        }

        parsedCoachingAdvice = validationResult.value;

        return {
          advice: parsedCoachingAdvice,
          requestPayload: currentUserInput,
        };
      } catch (error) {
        console.error("AI request failed:", error);
        Sentry.captureException(error, {
          tags: { scope: "ai-service", feature: "ask-ai-request" },
          extra: { responseLength: adviceResponseText.length },
        });
        throw error;
      } finally {
        if (parsedCoachingAdvice && Array.isArray(parsedCoachingAdvice.recommendedWorkout)) {
          try {
            learnFromCoachingAdvice(
              parsedCoachingAdvice.recommendedWorkout,
              createExerciseMuscleMapRepository(),
            );
          } catch (error) {
            Sentry.captureException(error, {
              tags: { scope: "ai-service", feature: "learn-from-response" },
              extra: { responseLength: adviceResponseText.length },
            });
          }
        }
      }
    })(),
    () => "generate-content-stream-failed" as CoachingAdviceError,
  );
}
