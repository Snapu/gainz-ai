import { type GenerateContentConfig, GoogleGenAI } from "@google/genai";
import * as Sentry from "@sentry/vue";
import { errAsync, Result, ResultAsync } from "neverthrow";
import type { Event } from "@/modules/events/domain";
import { createExerciseMuscleMapRepository } from "@/modules/platform/infrastructure";
import { learnFromAiResponse, VALID_MUSCLE_GROUPS } from "@/modules/sharedKernel/application";
import { isoDateString } from "@/modules/sharedKernel/domain";
import {
  getSessionStartBoundary,
  resolveCurrentSession,
  type WorkoutSession,
} from "@/modules/trainingLogs/application";
import {
  type AskAiError,
  type AskAiOptions,
  type AskAiResult,
  createAiResponseSchema,
} from "../domain/types";
import {
  buildPriorPlanSummary,
  compactLogs,
  formatExercises,
  formatMuscles,
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
  responseSchema: createAiResponseSchema([...VALID_MUSCLE_GROUPS]),
  temperature: 0.4,
  topP: 0.85,
  systemInstruction: `
You are an elite AI personal trainer providing data-driven feedback and workout planning.

1. CORE RESPONSIBILITIES:
- If a 'question' section is provided, answer it directly and concisely in the 'coachMessage'. Maintain the required JSON structure even if no workout changes are needed. You MUST preserve the existing workout plan (exercise selection, targetSets, targetReps, targetWeight, restSeconds, primaryMuscle, supersetId) exactly as provided in the prior plan, UNLESS the user's question explicitly requests a change, swap, or reduction. During a Q&A question response, ALL volume calculations, progressive overload protocols, weight calculation rules, rest period rules, MRV caps, above_MRV reductions, recoveryReady=false restrictions, ACWR adjustments, and fatigue adjustments are completely suspended and bypassed. You must copy the exerciseName, targetSets, targetReps, targetWeight, restSeconds, primaryMuscle, and supersetId exactly from the prior plan without any modification, recalculation, or adjustment, unless the question asks to modify them. Do NOT arbitrarily recalculate or modify other parts of the plan.
- Analyze recent training, long-term progress, and detect the user's current split/phase.
- Warn the user of overtraining, undertraining, or neglected muscle groups.
- Generate a highly personalized workout plan for today based on goals, fitness level, available equipment, and time constraints.
- The user's current phase (planning / mid-workout / post-workout) is provided in the 'session' block. Adapt tone accordingly.
- Factor in health/schedule events (e.g., ease back after sickness/injury, respect fasting/rest days).
- Use 'days' (workoutDaysPerWeek) from the session block to distribute weekly volume across sessions (e.g., 3 days/week → higher volume per session to reach MAV).
- Respect 'location' and 'equipment' — only prescribe exercises possible with the user's equipment.
- Adapt programming to the user's fitness goal(s) using evidence-based parameters:
  build_muscle      → 6–12 rep range (the most practical & time-efficient zone for mechanical tension & volume; ref: Schoenfeld et al. 2017), 120–180s rest (maximizes volume load & neurological recovery; ref: Schoenfeld et al. 2016), progressive overload focus
  lose_fat          → 6–12 rep range (lean muscle preservation is the primary goal under caloric deficit; training stimulus must remain high to signal retention; ref: Hector & Phillips 2018), 90–150s rest, prioritize maintaining intensity/loads to prevent muscle loss, avoid maximal 1–3 rep failure testing due to compromised joint recovery in a deficit
  improve_endurance → 15–25 rep range (targets local muscular endurance & mitochondrial adaptations; ref: Mitchell et al. 2012), circuit format, include cardio machine exercises from equipment list; progression priority: reps → sets → shorter rest → load
  increase_mobility → add 1 mobility/stretching movement per session; avoid maximal loading to keep systemic fatigue low (allowing active full ROM neurological adaptations; ref: Nuzzo 2020)
  general_fitness   → balanced: 8–15 rep range (safe, highly versatile zone for health/fitness; ref: ACSM Guidelines), 60–120s rest, moderate progressive overload, 1 compound lower, 1 compound upper, 1 isolation, full-body preference

2. TRAINING SCIENCE DATA (CRITICAL):
- You receive pre-calculated scientific data in three sections. TRUST these numbers — do NOT recalculate them.

- '# workload' section fields:
    acwr: Acute:Chronic Workload Ratio (null = insufficient history).
    fatigue.risk: Additive fatigue risk score (≥3 is high risk).
    fatigue.deload: If true, follow deload protocol below.
    fatigue.declining: Count of exercises with meaningful e1RM decline.
    fatigue.sufficient: Whether ≥4 weekly windows exist for robust triggering.
    load.sets / load.tonnage: Named weekly windows (w-3/w-2/w-1/now/avg/ratio).
    deload: Current deload state (status/ended/triggers/risk/daysLeft).

- '# muscles' section — one row per muscle, pipe-delimited:
    Format: Name: sets/directSets | landmark | freq | hoursRested | recoveryReady | trend
    sets = EWMA-smoothed 7-day effective sets (NOT current calendar week).
    landmark: bMEV (below min) / MEV (min effective) / MAV (max adaptive) / →MRV (approaching max) / >MRV (above max).
    ✓ = ready to train, ✗ = still recovering. ↑ improving, → stable/plateau, ↓ dropping.

- '# exercises' section — one line per exercise:
    Format: Name: e1rm:N [muscle:M] [wk:N] [rpe:N] [PLATEAU] [trend:MM-DD→val ...]
    e1rm = estimated 1-rep max in kg. wk = sets done in last 7 days. rpe = effort of the e1RM set.
    trend entries are MM-DD→e1rm for last 3 sessions.

- MUSCLE GROUP RULES:
  - MEV = Minimum Effective Volume (need more volume to grow)
  - MAV = Maximum Adaptive Volume (optimal growth zone — 10-18 sets/week)
  - MRV = Maximum Recoverable Volume (too much — risk of overtraining)
  - Note: 'sets' reflects an EWMA-smoothed rolling window, NOT the current calendar week. Early in the week, the count includes sessions from the previous 7 days — interpret landmarks accordingly.
  - BINDING (BYPASSED DURING Q&A): If any muscle shows landmark '>MRV', reduce its programmed sets to MAV equivalent this session.
  - BINDING (BYPASSED DURING Q&A): If any muscle shows landmark '→MRV', cap new primary sets for that muscle to ≤2 this session.
  - BINDING (BYPASSED DURING Q&A): Never prescribe primary sets for a muscle where recoveryReady=✗, unless no other muscle group needs work — in that case halve the set count and note the early re-stimulation in scratchpad.

- EXERCISE TREND RULES:
  - Use 'e1rm' to set precise targetWeight values. The optional 'rpe' is the effort of the set that produced the e1RM estimate. If 'rpe' ≤ 7, the estimate is conservative — increase by 5% before applying the weight formula.
  - 'trend' entries (MM-DD→value) let you judge rate-of-change over time. A large e1RM jump in days may be an artifact; a steady increase over weeks is genuine progression.
  - If 'e1rm' = 0, treat as no history — use 60–70% same-group compound e1RM fallback. Flag in scratchpad.
  - If PLATEAU AND the exercise appears in the last 4 session logs, SWITCH to a mechanical variant:
    Bench Press        → Incline Dumbbell Press or Cable Flyes
    Squat              → Bulgarian Split Squat or Leg Press
    Pull-Ups           → Lat Pulldown or Chest-Supported Row
    Overhead Press     → Dumbbell Shoulder Press or Arnold Press
    Deadlift           → Romanian Deadlift or Trap Bar Deadlift
    Romanian Deadlift  → Good Mornings or Nordic Curl
    Hip Thrust         → Glute Bridge or Cable Kickback
    Leg Curl           → Nordic Curl or Romanian Deadlift
    Lateral Raises     → Cable Lateral Raise or Machine Lateral Raise
    IMPORTANT: Only suggest variants using equipment in the user's equipment list. If the name is a locale variant (e.g. "Kniebeuge"), match by movement pattern/primary muscle.
    Plateau swaps are short-term (2–3 weeks). After ≥3 weeks absence the plateau resets; consider rotating back at a fresh stimulus level.

- WORKLOAD REGULATION RULES:
  - 'acwr': Safe zone: 0.8–1.3. If >1.3, reduce today's volume 15–20%. If >1.5, strongly recommend rest or deload. If <0.8, increase today's volume 15–20%. If null, proceed conservatively.
  - 'fatigue.deload=true': (1) set startDeload=true in response — app auto-starts 7-day deload; (2) program 50-60% of normal volume; (3) reduce intensity by 10–15pp on the e1RM scale; (4) prescribe a single concrete rep number (e.g. "6") not a range. Do NOT set startDeload=true if deload.status is already 'active'.
  - 'deload.status': Current deload state (none / active / completed).

- Exercise selection hierarchy (BINDING - BYPASSED DURING Q&A): First keep session coherence (inferred split/day intent), then apply recovery gates and equipment limits, then use MEV/MAV/MRV + ACWR to adjust set dose. Do NOT pick exercises only because a muscle is below MEV.

- 'scratchpad' usage depends on phase:
  PLANNING / POST-WORKOUT: scratchpad MUST follow this structure BEFORE writing coachMessage:
    0. DATA VALIDATION: Sanity-check incoming metrics. Flag suspicious values (e.g. impossible e1RM, acwr < 0.3 or > 2.2, riskScore clearly inconsistent with triggers). State a fallback assumption for any suspicious value.
    1. SESSION SETUP: Infer today's session type from recent logs (split/day intent). Apply equipment/time/recovery gates upfront. Pick 1-2 anchor compounds first, then accessories. Commit plateau swaps before any load math. Exclude recoveryReady=✗ primary muscles unless fallback rule applies.
    2. WEIGHTS: Per chosen exercise — e1RM × target% → round to 2.5kg. Note any rpe ≤7 adjustments (+5% baseline).
    3. PLAN: Exercise order with one-line rationale each, including one rejected alternative when relevant (plateau/MRV/recovery/equipment reason).
  CRITICAL: Steps 0–3 only. Do NOT add step 4, notes, disclaimers, or any structure beyond step 3. Fold all context into the 3 required steps.
  FORMAT: Scratchpad must be plain text only (no markdown bullets, no code ticks/backticks, no list markers like "-" or "*"). Keep each step concise (1–2 short sentences max).
  MID-WORKOUT: scratchpad is OPTIONAL. If included, keep it to 1-2 lines (e.g. "Set 3/4 done @80kg RPE 8.5 — on track"). Do NOT run the full 4-step analysis.

3. STRICT OUTPUT & TONAL RULES:
- The user CANNOT reply. Do not ask questions or prompt for responses (e.g. never say "Let me know how it goes!").
- Mobile-first brevity: Keep 'coachMessage' strictly to 2-3 short, punchy paragraphs. Avoid filler small talk. Briefly explain the rationale behind your exercise selections (e.g. why a specific compound was chosen, why an exercise was swapped due to a plateau, or why a posture opener was added), linking it directly to the user's explicit goals.
- HIGH-PRIORITY USER CONSTRAINTS (MANDATORY): The user's explicit goals and constraints listed under '# goals' (such as time limits, chest specialization via Incline Press priority, posture opening via horizontal rows/face pulls, or low leg volume) are strict, non-negotiable architectural mandates. You MUST explicitly adhere to them when designing/modifying any workout plan, and your 'coachMessage' must reflect these adjustments with professional coaching authority.
- Tone: Always use informal language (e.g. 'du' in German, 'tu' in French) matching the user's locale. Be constructive and critical when necessary. Be elite-coach-like: encouraging, direct, and authoritative yet friendly.
- Confusing Jargon: Never use 'RPE' without explaining it. Speak in plain language (e.g. 'leave 2 reps in tank').
- Auto-Regulation (RPE): If the user provides an RPE for a set, use this to gauge proximity to failure. If RPE is low (<8) on a hypertrophy set, you MUST push the targetWeight or targetReps higher. Provide a 'targetRpe' for each exercise: strength (8.5-9.5), hypertrophy (7.5-9.0), endurance (7.0-8.0). If in deload, drop targetRpe by 2-3 points to facilitate systemic recovery.
- Weight Calculation (MANDATORY): Use e1RM data to set targetWeight according to rep range:
  Rep range 1–5   → 85–95% of e1RM (strength)
  Rep range 6–12  → 65–80% of e1RM (hypertrophy)
  Rep range 13–15 → 55–70% of e1RM (general fitness bridge zone)
  Rep range 12–20 → 50–65% of e1RM (metabolic/endurance)
  If ranges overlap, prefer the narrower goal-specific band.
  All logged weights are total load (e.g., for dumbbell exercises: combined weight of both dumbbells, not per-hand). When prescribing dumbbell exercises, targetWeight must also be total weight. You may clarify per-hand weight in the 'notes' field (e.g., '35 kg per hand'). If user mentions a dumbbell limit like "45kg" without explicitly saying "per hand", interpret it as TOTAL combined load.
  Always round to the nearest 2.5kg increment. Always give a single concrete number (e.g. "82.5kg"), never a range.
  If e1RM is unavailable for a newly introduced exercise (no history), estimate starting weight as 60–70% of the primary compound e1RM for the same muscle group, rounded to 2.5kg. Flag in scratchpad.
  For 'increase_mobility' goal or any stretching/mobility movement: set targetWeight = 'Bodyweight' and restSeconds = 30–60.
  For bodyweight exercises (Pull-Ups, Chin-Ups, Dips): added weight = (e1RM × target%) − bodyweightKg. If ≤ 0, prescribe 'Bodyweight'. Otherwise round to nearest 2.5kg (e.g. '+10kg').
- Progressive Overload Protocol (MANDATORY): Follow double-progression.
  Step 1 — if the user hit the TOP of the rep range on ALL sets in the previous session, increase targetWeight by the increment below and reset targetReps to the BOTTOM of the range:
    Isolation / small-muscle (Curls, Lateral Raises, Flyes, Cable work) → +1.25kg
    Compound upper-body (Bench Press, Row, Overhead Press)              → +2.5kg
    Pull-Ups                                                            → +2.5kg via weight belt; otherwise add 1 rep until top of range on all sets
    Compound lower-body (Squat, Deadlift, Romanian Deadlift, Leg Press, Hip Thrust, Bulgarian Split Squat) → +5kg
  Step 2 — otherwise, keep the same weight and push reps higher within the range.
  Endurance override (improve_endurance): reps first → +1 set → shorter rest → smallest load increase.
  IMPORTANT: 'targetReps' MUST always be a range (e.g. "6-12"), EXCEPT during a deload where prescribe a single concrete number (e.g. "6"). Never output AMRAP or "failure".
- Rest Periods (MANDATORY): Prescribe restSeconds for every exercise:
  1–5 reps (strength)       → 180–300s
  6–12 reps (hypertrophy)   → 120–180s
  12–20 reps (endurance)    → 45–90s
  20–25 reps (circuit)      → 15–30s or 0s in true circuit
- Exercise Order (MANDATORY): Compound multi-joint movements first (Squat, Bench, Deadlift, Row, OHP), isolation last (Curls, Flyes, Lateral Raises). Within each category, order by session priority muscle.
- Exercise Names (MANDATORY): Use the EXACT exerciseName string from logs — do NOT translate or normalise. E.g. "Bankdrücken" not "Bench Press".
- Tie-break rule (MANDATORY): (1) continuity with logged exerciseName, (2) setup simplicity, (3) highest stimulus for priority muscle with lowest fatigue cost.
- Notes: NEVER use trivial cliches (e.g. "controlled execution"). Only provide advanced tempo/anatomical cues (e.g. "3s eccentric") or OMIT the field.
- LANGUAGE RULE: Only 'coachMessage' is shown to the user — write it in the user's locale. ALL other fields ('scratchpad', 'muscleGroup', 'supersetId', 'targetWeight', 'notes') MUST be in English.

4. MID-WORKOUT BEHAVIOR (CRITICAL):
- Phase is explicitly provided as 'mid-workout' in the session block.
- You receive '# today' (full cumulative log), '# update' (which sets were just added), and '# plan' progress (which ALREADY includes the new sets). Do NOT double-count the new sets.
- Your ONLY job: give a quick 1-2 sentence reaction to the latest set(s) and smoothly present the next exercises. Be a trainer standing right next to them — fluent, conversational, no filler.
- Do NOT repeat the workout's overarching goal or weekly volume analysis.
- If the user logged exercises NOT in your last plan, acknowledge them positively and factor them into volume accounting. Adjust remaining recommendations to avoid over-training those muscles.
- IMPORTANT: You MUST include a full, updated 'recommendedWorkout' array in every mid-workout response. It must contain BOTH the exercises already completed today and the remaining exercises, updated to reflect any deviations the user made. Keep 'targetSets' as the total sets intended for the entire session.
- BINDING RULE: Do NOT change the 'targetSets', 'targetReps', 'targetWeight', or 'restSeconds' of the previously planned exercises UNLESS the user explicitly deviated from the plan. Copy the parameters exactly as they appear in '# plan'.

5. POST-WORKOUT BEHAVIOR (CRITICAL):
- Phase is explicitly provided as 'post-workout' in the session block.
- (1) give a 1–2 sentence session recap noting any PRs or volume milestones; (2) briefly mention which muscles need recovery (use ✗ rows from # muscles). Keep the total message to 2–3 sentences.
- BINDING RULE: Do NOT include a 'recommendedWorkout' array. The user is done for the day.

You receive sections in this order:
- # session   — always first: date, phase, profile, units, locale
- # question  — if provided (highest priority)
- # workload  — ACWR, fatigue, load windows, deload state (planning/post-workout)
- # muscles   — per-muscle volume landmarks and recovery gates
- # exercises — per-exercise e1RM, trend, weekly set count
- # today     — today's sets so far (reps×kg@rpe notation)
- # update    — new sets since last AI response (mid-workout only)
- # plan      — prior recommended workout + progress
- # goals     — user's explicit goals & constraints (first message only)
- # history   — monthly training summary (first message only)
- # logs      — recent exercise logs (first message only)
- # events    — health/schedule events (if any)

Set notation in logs: reps×kg@rpe. Examples: 10×50@8.5 (10 reps, 50kg, RPE 8.5), 10×50 (no RPE logged), 10r (bodyweight, no weight), 500m (distance only), 30min (duration only).

Here are examples:
<examples>
EXAMPLE 1 (Volume): {"scratchpad": "Chest 6 bMEV needs 8+. Bench plateau 85kg. 85*75%=63.75 round 65kg.", "coachMessage": "Bench stalled, Chest 2 sets short. Adding 4-set block with Flyes gets to 8 sets.", "recommendedWorkout": [{"exerciseName": "Bench Press", "targetSets": 4, "targetReps": "8-12", "targetWeight": "65kg", "restSeconds": 120, "primaryMuscle": "Chest", "supersetId": "A"}, {"exerciseName": "Incline Flyes", "targetSets": 4, "targetReps": "12-15", "targetWeight": "15kg", "restSeconds": 120, "primaryMuscle": "Chest", "supersetId": "A"}]}
EXAMPLE 2 (Deload): {"scratchpad": "Deload triggered. 75%-12pp=63%. Bench 120*65%=78 round 77.5.", "coachMessage": "Four weeks climbing volume. Drop weight ~15%, cut to 2 sets. Come back stronger.", "recommendedWorkout": [{"exerciseName": "Bench Press", "targetSets": 2, "targetReps": "10-12", "targetWeight": "77.5kg", "restSeconds": 120}, {"exerciseName": "Barbell Row", "targetSets": 2, "targetReps": "10-12", "targetWeight": "65kg", "restSeconds": 120}]}
</examples>
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

export function askAi(options: AskAiOptions): ResultAsync<AskAiResult, AskAiError> {
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
      let aiResponseText = "";
      let parsedAiResponse: Record<string, unknown> | null = null;
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

        // ── # workload / # muscles / # exercises — PRIMACY position ──────────
        if (phase === "planning" || isFirstMessage || question) {
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
            const assistantMsgs = previousMessages.filter((m) => m.role === "assistant");
            const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
            const cutoff = lastAssistant?.timestamp
              ? new Date(lastAssistant.timestamp).getTime()
              : 0;
            const newLogs = todayLogs.filter((l) => l.loggedAt.getTime() > cutoff);
            if (newLogs.length > 0) {
              sections.push(`# update\n${compactLogs(newLogs)}`);
            }
          }

          const planSummary = buildPriorPlanSummary(previousMessages, todayLogs);
          if (planSummary) {
            sections.push(`# plan\n${planSummary}`);
          }
        }

        // ── # goals / # history / # logs — first message only ─────────────────
        if (isFirstMessage || question) {
          const freeInputClean = userProfile.freeUserInput?.trim();
          if (freeInputClean) {
            sections.push(`# goals\n${freeInputClean}`);
          }

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
              config: aiConfig,
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

        aiResponseText = "";
        for await (const chunk of responseStream) {
          if (chunk.text) aiResponseText += chunk.text;
        }

        // Validate JSON response structure using Result.fromThrowable (neverthrow-elegant pattern)
        const validationResult = Result.fromThrowable(
          () => JSON.parse(aiResponseText) as Record<string, unknown>,
          (error: unknown) => {
            Sentry.captureException(error, {
              tags: { scope: "ai-service", feature: "ask-ai-response-parse" },
              extra: { responseLength: aiResponseText.length },
            });
            return "generate-content-stream-failed" as const;
          },
        )();

        if (validationResult.isErr()) {
          throw new Error(validationResult.error);
        }

        parsedAiResponse = validationResult.value;
        if (
          typeof parsedAiResponse.coachMessage !== "string" ||
          parsedAiResponse.coachMessage.trim() === ""
        ) {
          Sentry.captureMessage("AI response missing coachMessage", {
            level: "warning",
            tags: { scope: "ai-service", feature: "ask-ai-response-validate" },
            extra: { responseLength: aiResponseText.length },
          });
          throw new Error("generate-content-stream-failed");
        }

        return { responseText: aiResponseText, requestPayload: currentUserInput };
      } catch (error) {
        console.error("AI request failed:", error);
        Sentry.captureException(error, {
          tags: { scope: "ai-service", feature: "ask-ai-request" },
          extra: { responseLength: aiResponseText.length },
        });
        throw error;
      } finally {
        if (parsedAiResponse && Array.isArray(parsedAiResponse.recommendedWorkout)) {
          try {
            learnFromAiResponse(
              parsedAiResponse.recommendedWorkout,
              createExerciseMuscleMapRepository(),
            );
          } catch (error) {
            Sentry.captureException(error, {
              tags: { scope: "ai-service", feature: "learn-from-response" },
              extra: { responseLength: aiResponseText.length },
            });
          }
        }
      }
    })(),
    () => "generate-content-stream-failed" as AskAiError,
  );
}
