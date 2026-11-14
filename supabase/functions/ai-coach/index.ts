import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as jose from "npm:jose@5";

const DEFAULT_GOOGLE_CLIENT_ID =
  "804592774481-hvo962fnjn23g9tt4i0s5d62f17pegg7.apps.googleusercontent.com";
const GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";
const GOOGLE_JWKS = jose.createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const COACHING_MODELS = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-3.5-flash-lite"] as const;
const CLASSIFICATION_MODELS = ["gemini-2.5-flash", "gemini-3.5-flash-lite"] as const;

const DEFAULT_DAILY_COACH_LIMIT = 25;
const DEFAULT_DAILY_CLASSIFY_LIMIT = 50;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CoachingMode = "planning" | "execution";

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiContent {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

interface CoachActionRequest {
  action: "coach";
  mode: CoachingMode;
  allowPlanUpdate?: boolean;
  muscleGroups: string[];
  contents: GeminiContent[];
}

interface ClassifyActionRequest {
  action: "classify";
  exerciseNames: string[];
  muscleGroups: string[];
}

type AiCoachRequestBody = CoachActionRequest | ClassifyActionRequest;

interface QuotaRow {
  allowed: boolean;
  current_count: number;
  daily_limit: number;
  reset_at: string;
  global_capped?: boolean;
}

const BASE_SYSTEM_INSTRUCTION = `
You are an elite AI personal trainer providing data-driven feedback and workout planning.

1. CORE RESPONSIBILITIES:
- Generate a highly personalized workout plan for today based on goals, fitness level, available equipment, and time constraints.
- Factor in health/schedule events and distribute weekly volume across 'days'.
- You MUST strictly respect the number of workout days per week ('days' in the '# session' profile) when generating a 'trainingPlan'.
- Adapt programming to fitness goals:
  build_muscle      → 6–15 rep range (isolation up to 20), focus on mechanical tension & progressive overload
  lose_fat          → 6–12 rep range, maintain intensity to prevent muscle loss. Prioritize LISS cardio over HIIT (unless user explicitly requests intervals). Only generate a dedicated 30-45m LISS session if 'days' strictly exceeds the number of lifting sessions in the plan. Otherwise, append a conditioning finisher (e.g., Incline Walk, Stairmaster, Assault Bike) at the VERY END of the exercise array using 'targetDurationSeconds' or 'targetDistanceMeters'. If time is constrained (sessionMins ≤45), skip cardio entirely and increase workout density with supersets instead. Cardio must respect available equipment (e.g., no treadmill if no 'cardio_machine'; suggest Jogging or Jump Rope instead).
  improve_endurance → 8–15 rep range for compounds, 12–20 for isolation/bodyweight, with shorter rest. Incorporate cardio (e.g., Jogging, Running, Rowing) using 'targetDistanceMeters' or 'targetDurationSeconds'. Cardio must respect available equipment.
  increase_mobility → Integrate 2-3 mobility movements per session (e.g., hip openers, thoracic rotations, shoulder dislocates). Use bodyweight and 'targetDurationSeconds' for holds. Weave in as warm-up or active rest between sets targeting non-competing muscle groups (e.g., thoracic mobility between squats). Do NOT program static stretching for the prime movers between their working sets.
  general_fitness   → 8–15 rep range, balanced full-body. Mix strength, conditioning, and 1 mobility movement. Optionally include a short cardio finisher if time permits.
- When multiple goals are selected, use the first listed goal as the primary driver for rep ranges and structure. Layer in secondary goals where compatible (e.g., lose_fat + build_muscle → hypertrophy programming in a deficit; lose_fat + improve_endurance → include cardio more aggressively).

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
  - Target RPEs: strength (8.5-9.5), hypertrophy (7.5-9.0), endurance (7.0-8.0). Deload: drop by 2-3 points. ALWAYS populate 'targetRpe' for resistance exercises.
  - Variety Bias: Limit exercises to 1-2 heavy compound movements per muscle group. Favor higher sets of a few key exercises over a large variety of different exercises.
  - Overlap: Cap heavy pressing movements (Chest, Shoulders, Dips) to max 2 per session to avoid anterior deltoid burnout and CNS fatigue. Do not program 3+ pressing variations in one workout.

- TIME MANAGEMENT & SUPERSETS:
  - Estimate 3-4 minutes per set (execution + rest + setup). To respect time limits, strictly cap total session sets (e.g., max 12-15 sets for a 45-minute limit).
  - When time-constrained, reduce total exercises/sets or use antagonist paired sets ('supersetId') to pair non-competing muscles (e.g. Chest/Back, Biceps/Triceps). Do NOT simply slash rest periods below 90s for hypertrophy — this compromises ATP-PCr resynthesis and shifts the stimulus away from mechanical tension.
  - NEVER superset two heavy systemic compound movements (e.g., Squats and Deadlifts/RDLs) together, as this causes cardiovascular failure and compromises form.

- 'scratchpad' usage (PLANNING ONLY, max 3 lines):
  0. DATA: Sanity-check metrics.
  1. SETUP: Infer session intent. Pick compounds first. Exclude recovering muscles.
  2. PLAN: Rationale for exercises/swaps.

4. STRICT OUTPUT RULES:
- Keep 'coachMessage' to 2-3 short, punchy paragraphs in the user's locale.
- MANDATORY CONSTRAINTS: Follow '# goals' explicitly.
- Use EXACT exerciseName from the '# exercises' section or '# logs'. DO NOT invent new variations of existing exercises. Exception: you may introduce well-known cardio, mobility, or conditioning movements (e.g., Jogging, Incline Walk, Cycling, Jump Rope, Sled Push, Kettlebell Swings, Battle Ropes, Hip 90/90 Stretch) that are not yet in the user's history.
- Do NOT give ranges for targetWeight, give a single number (e.g. '82.5kg'). For dumbbell exercises, ALWAYS output the TOTAL combined weight (e.g., for two 20kg dumbbells, output '40kg').
- Explicit Types: For time-based holds (e.g., Planks), output 'targetDurationSeconds' and OMIT 'targetReps'. For distance cardio (e.g., Running), output 'targetDistanceMeters' and OMIT 'targetReps'. Use 'targetReps' strictly for countable movements (e.g., '8-12').
- Prescribe 'targetRpe' (number between 6.0 and 10.0, e.g. 8.0, 8.5, 9.0) for every lifting/resistance exercise in 'recommendedWorkout' and 'trainingPlan'. Standard working sets are 8.0–9.0 (1–2 RIR), heavy strength is 8.5–9.5, deload is 6.0–6.5. Omit only for pure cardio or mobility.
- SUGGESTED FOLLOW-UP PROMPTS ('suggestedFollowUps'):
  - Output 2-4 context-aware follow-up questions tailored directly to the advice, prescribed exercises, weights, or fatigue metrics discussed.
  - Phrased strictly from the user's first-person perspective ('Can I...', 'Swap X for Y', 'I only have 30 mins...'). NEVER use coach-to-user phrasing ('Would you like to...').
  - 'label' and 'prompt' MUST be written strictly in the user's locale (matching coachMessage).
  - 'label': Concise 2-4 words for mobile pill buttons (e.g., 'Swap Leg Press', 'Warmup Guide', 'Condense to 30m').
  - 'prompt': The complete, detailed, realistic question sent to the coach.

5. MID-WORKOUT BEHAVIOR:
- Give a quick 1-2 sentence reaction to the latest set(s). No scratchpad needed.
- During conversational Q&A mid-workout, OMIT 'recommendedWorkout' entirely unless the user explicitly asks for a change to the plan. This prevents accidental plan drift.
- During quick set reactions or ongoing chat, omit 'suggestedFollowUps' unless proposing new workout adjustments.

6. MESOCYCLE PROGRAMMING:
- When 'planStatus: active' is present in '# session':
  The user has an existing mesocycle. Look at the '# program' section. Sessions marked '[DONE]' have already been completed.
  The next session in the sequence is marked '[NEXT_SESSION]'. You MUST use the '[NEXT_SESSION]' as today's workout. Do NOT skip ahead to match the current calendar day — the user trains when they find time, so they just do the next session in order.
  If the user's fatigue and training history strongly suggest a rest day, do not output a 'recommendedWorkout' and advise rest instead. Adapt weights/reps from '# logs'. Do NOT regenerate 'trainingPlan' unless the user explicitly asks to create, change, or adjust their multi-week plan in '# question'.
- When phase is "planning" AND no '# program' section is present:
  Generate a 'trainingPlan' with a 2-week cycle. You MUST match EXACTLY the user's 'days' value (workout days per week) from the '# session' section. Do not generate more or fewer sessions per week.
  Name sessions clearly. Distribute weekly volume across sessions respecting recovery.
  ALSO output today's session as 'recommendedWorkout'.
- When '# program' is present:
  Use the session marked '[NEXT_SESSION]' as today's workout → output as 'recommendedWorkout'.
  Adapt weights/reps based on actual performance in '# logs'.
  Do NOT regenerate 'trainingPlan' unless the user explicitly asks.
- When the user asks for a new plan (detected via '# question'):
  Generate a fresh 'trainingPlan' (respecting EXACTLY the 'days' value in the '# session' profile), applying progressive overload from performance data.
  ALSO output today's session from the newly generated plan as 'recommendedWorkout'.

You receive sections in this order:
- # session, # question, # goals, # workload, # muscles, # exercises, # today, # update, # program, # plan, # history, # logs, # events
`;

function buildSystemInstruction(mode: CoachingMode): string {
  const modeDirective =
    mode === "planning"
      ? `\n7. ACTIVE MODE DIRECTIVE (PLANNING):\n- You MUST generate a complete 2-week 'trainingPlan' (matching the user's 'days' per week in '# session') AND output today's first workout session in 'recommendedWorkout' (or an empty array [] ONLY if sickness, injury, or severe fatigue requires a rest day today). Never omit 'trainingPlan'. Always output 2-4 context-aware 'suggestedFollowUps' regarding the newly generated plan (e.g. asking to adjust split days, swap an exercise in the plan, or progress weekly weights).`
      : `\n7. ACTIVE MODE DIRECTIVE (EXECUTION):\n- Follow '# program' and use '[NEXT_SESSION]' for today's 'recommendedWorkout' (unless mid-workout Q&A or advising a rest day). Only output 'trainingPlan' if the user explicitly asked to create, change, or adjust their multi-week training plan in '# question'. When you do, 'trainingPlan' REPLACES the existing plan, so it MUST be the complete updated plan with ALL sessions of every week (unchanged sessions included), never only the modified sessions. Output 2-4 context-aware 'suggestedFollowUps' when prescribing today's initial workout (omit during mid-workout set logging).`;

  return `${BASE_SYSTEM_INSTRUCTION}${modeDirective}`;
}

function createMuscleGroupProperty(
  muscleGroupsList: string[],
  description: string,
): Record<string, unknown> {
  if (muscleGroupsList.length > 0) {
    return {
      type: "string",
      enum: muscleGroupsList,
      description: `${description} Must be one of: ${muscleGroupsList.join(", ")}.`,
    };
  }
  return {
    type: "string",
    description,
  };
}

function buildExerciseProperties(muscleGroupsList: string[]): Record<string, unknown> {
  const muscleProp = createMuscleGroupProperty(
    muscleGroupsList,
    "Primary muscle group this exercise targets.",
  );
  const secondaryMuscleProp = createMuscleGroupProperty(
    muscleGroupsList,
    "Secondary muscle group activated by this exercise.",
  );

  return {
    exerciseName: { type: "string" },
    targetSets: { type: "integer", minimum: 1, maximum: 20 },
    targetReps: {
      type: "string",
      description:
        "Used for counting movements (e.g. '8-12', 'failure'). Do NOT use if duration or distance is provided.",
    },
    targetDurationSeconds: {
      type: "integer",
      minimum: 1,
      maximum: 14400,
      description:
        "Used ONLY for time-based exercises like planks or isometric holds (e.g. 30, 60). Do NOT use targetReps if this is used.",
    },
    targetDistanceMeters: {
      type: "integer",
      minimum: 1,
      maximum: 100000,
      description:
        "Used ONLY for distance-based cardio like running or rowing (e.g. 500, 1000). Do NOT use targetReps if this is used.",
    },
    targetWeight: {
      type: "string",
      description:
        "Exact numeric weight only (e.g. '60kg', 'Bodyweight'). For dumbbell exercises, ALWAYS output the TOTAL combined weight (e.g., for two 20kg dumbbells, output '40kg'). Keep it extremely concise.",
    },
    targetRpe: {
      type: "number",
      minimum: 1,
      maximum: 10,
      description:
        "Target RPE (Rate of Perceived Exertion) from 6.0 to 10.0 (e.g. 8.5). Prescribe for all lifting/resistance exercises (8.0-9.0 for hypertrophy, 8.5-9.5 for strength, 6.0-6.5 for deload).",
    },
    restSeconds: {
      type: "integer",
      minimum: 0,
      maximum: 600,
      description:
        "Recommended rest between sets in seconds. 180–300 for strength (1–5 reps), 120–180 for hypertrophy (6–12 reps), 45–90 for fat loss/endurance (12–20 reps), 15–30 for endurance/circuit (20–25 reps).",
    },
    notes: {
      type: "string",
      description:
        "Advanced execution cue, tempo (e.g. '3s eccentric pause'), or anatomical focus (e.g. 'Bias long head'). Omit if nothing special.",
    },
    supersetId: {
      type: "string",
      description:
        "Optional. Assign the same identifier (e.g. 'A', 'B') to exercises that should be performed together as a superset.",
    },
    primaryMuscle: muscleProp,
    secondaryMuscles: {
      type: "array",
      description:
        "Optional secondary muscle groups this exercise also activates, with their fractional contribution (0.0–1.0).",
      items: {
        type: "object",
        properties: {
          muscleGroup: secondaryMuscleProp,
          contribution: {
            type: "number",
            description:
              "Fraction of a set credited to this muscle (0.0–1.0). Omit to default to 0.5.",
          },
        },
        required: ["muscleGroup"],
      },
    },
  };
}

function createCoachingAdviceJsonSchema(
  muscleGroupsList: string[],
  mode: CoachingMode = "execution",
  allowPlanUpdate = false,
): Record<string, unknown> {
  const exerciseProps = buildExerciseProperties(muscleGroupsList);

  const recommendedExerciseSchema = {
    type: "object",
    properties: {
      ...exerciseProps,
      isMetabolicProtocol: {
        type: "boolean",
        description:
          "Set to true for drop-sets, myo-reps, or rest-pause sets to bypass strict rest periods.",
      },
    },
    required: ["exerciseName", "targetSets", "restSeconds"],
  };

  const plannedExerciseSchema = {
    type: "object",
    properties: exerciseProps,
    required: ["exerciseName", "targetSets"],
  };

  const trainingPlanSchema = {
    type: "object",
    description: "A 2-week training program generated by the AI.",
    properties: {
      cycleWeeks: {
        type: "integer",
        minimum: 1,
        maximum: 4,
        description: "Duration of the mesocycle in weeks (typically 2).",
      },
      sessions: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            dayOfWeek: {
              type: "integer",
              minimum: 0,
              maximum: 6,
              description: "0=Sun, 1=Mon...6=Sat",
            },
            weekNumber: {
              type: "integer",
              minimum: 1,
              maximum: 4,
              description: "1 or 2",
            },
            sessionLabel: {
              type: "string",
              description: "e.g., 'Unit A — Push Focus'",
            },
            focusDescription: { type: "string" },
            exercises: {
              type: "array",
              minItems: 1,
              items: plannedExerciseSchema,
            },
          },
          required: ["dayOfWeek", "weekNumber", "sessionLabel", "focusDescription", "exercises"],
        },
      },
    },
    required: ["cycleWeeks", "sessions"],
  };

  const suggestedFollowUpsSchema = {
    type: "array",
    minItems: 2,
    maxItems: 4,
    description:
      mode === "planning" || !allowPlanUpdate
        ? "2 to 4 context-aware follow-up questions or adjustments the athlete might want to ask next."
        : "Include 2 to 4 context-aware follow-up questions only when proposing new workout changes or advice; omit during quick conversational reactions.",
    items: {
      type: "object",
      properties: {
        label: {
          type: "string",
          description:
            "Concise 2-4 word chip label for mobile UI (e.g., 'Swap Leg Press', 'Warmup Sets', 'Condense to 30m').",
        },
        prompt: {
          type: "string",
          description:
            "Realistic, actionable question written strictly from the user's first-person perspective ('Can I...', 'Swap X for Y') that directly relates to the prescribed exercises, weights, or advice.",
        },
      },
      required: ["label", "prompt"],
    },
  };

  const properties: Record<string, unknown> = {
    scratchpad: {
      type: "string",
      description:
        "Internal workspace for reasoning and calculations. Usage depends on phase — see system instructions. NOT shown to user.",
    },
    startDeload: {
      type: "boolean",
      description:
        "Set to true ONLY when fatigue.shouldDeload is true. This signals the app to automatically begin a 7-day deload phase. Do NOT set true during an already-active deload (deloadStatus='active'). Omit or set false otherwise.",
    },
    coachMessage: {
      type: "string",
      description:
        "The empathetic, motivating, and analytical message from the coach. Max 2-3 short paragraphs.",
    },
    suggestedFollowUps: suggestedFollowUpsSchema,
    recommendedWorkout: {
      type: "array",
      description:
        mode === "planning"
          ? "Today's first workout session from the generated training plan. Output an empty array [] ONLY if sickness, injury, or severe fatigue requires a rest day today."
          : "Optional recommended exercises for today's workout. OMIT this entirely during mid-workout conversational Q&A to preserve the existing plan.",
      items: recommendedExerciseSchema,
    },
  };

  const required: string[] = ["coachMessage"];
  if (mode === "planning") {
    required.push("suggestedFollowUps", "recommendedWorkout", "trainingPlan");
    properties.trainingPlan = trainingPlanSchema;
  } else if (allowPlanUpdate) {
    properties.trainingPlan = {
      ...trainingPlanSchema,
      description:
        "Include ONLY if the user explicitly asks to create, change, or rebuild their multi-week training plan. When changing an existing plan, output the COMPLETE updated plan with ALL sessions (unchanged sessions included) — never only the modified session.",
    };
  }

  return {
    type: "object",
    properties,
    required,
  };
}

function createExerciseCleanupJsonSchema(muscleGroupsList: string[]): Record<string, unknown> {
  const muscleProp = createMuscleGroupProperty(muscleGroupsList, "Primary muscle group.");
  const secondaryMuscleProp = createMuscleGroupProperty(
    muscleGroupsList,
    "Secondary muscle group.",
  );

  return {
    type: "object",
    properties: {
      classifications: {
        type: "array",
        description: "Muscle group assignments for unknown exercises.",
        items: {
          type: "object",
          properties: {
            exerciseName: { type: "string" },
            primaryMuscle: muscleProp,
            secondaryMuscles: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  muscleGroup: secondaryMuscleProp,
                  contribution: { type: "number" },
                },
                required: ["muscleGroup"],
              },
            },
            confidence: {
              type: "number",
              description: "Confidence score 0.0–1.0. Use < 0.8 only when genuinely ambiguous.",
            },
          },
          required: ["exerciseName", "primaryMuscle", "confidence"],
        },
      },
    },
    required: ["classifications"],
  };
}

function buildClassifyPrompt(exerciseNames: string[], muscleGroupsList: string[]): string {
  const muscleGroupsPromptList = muscleGroupsList.join(", ");
  return `You are a fitness data expert. For each exercise name in the list below, classify it:

Assign the primary muscle group and any significant secondary muscles. Use only: ${muscleGroupsPromptList}.

Exercise names to process:
${exerciseNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Important rules:
- Classify ALL exercises in the list, including locale variants (e.g. "Bankdrücken", "RDL") — assign their muscles directly, do not redirect to a canonical name.
- Never output duplicate entries.
- Muscle group values must exactly match the allowed list.
- Set confidence < 0.8 only when genuinely ambiguous (e.g. "Press" with no context).`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

async function verifyGoogleIdToken(
  idToken: string,
  expectedClientId: string,
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: expectedClientId,
    });

    const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
    if (!sub) return null;

    return { userId: sub };
  } catch (err) {
    console.warn("Google ID token cryptographic verification failed:", err);
    return null;
  }
}

const GOOGLE_TOKENINFO_TIMEOUT_MS = 5000;
const SUPABASE_RPC_TIMEOUT_MS = 5000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function verifyGoogleAccessToken(
  accessToken: string,
  expectedClientId: string,
): Promise<{ userId: string } | null> {
  try {
    const res = await fetchWithTimeout(
      GOOGLE_TOKENINFO_ENDPOINT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ access_token: accessToken }).toString(),
      },
      GOOGLE_TOKENINFO_TIMEOUT_MS,
    );
    if (!res.ok) return null;

    const info = (await res.json()) as Record<string, unknown>;
    const sub = typeof info.sub === "string" ? info.sub.trim() : "";
    const aud = typeof info.aud === "string" ? info.aud.trim() : "";
    const azp = typeof info.azp === "string" ? info.azp.trim() : "";

    if (!sub) return null;
    if (aud !== expectedClientId && azp !== expectedClientId) return null;

    return { userId: sub };
  } catch {
    return null;
  }
}

async function verifyGoogleCaller(
  token: string,
  expectedClientId: string,
): Promise<{ userId: string } | null> {
  // Never fall back to OAuth access-token introspection for malformed or invalid 3-segment JWTs
  if (token.split(".").length === 3) {
    return verifyGoogleIdToken(token, expectedClientId);
  }

  return verifyGoogleAccessToken(token, expectedClientId);
}

async function consumeQuota(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  kind: "coach" | "classify",
  dailyLimit: number,
): Promise<QuotaRow | null> {
  try {
    const res = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/rpc/consume_ai_quota`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          p_user_id: userId,
          p_kind: kind,
          p_daily_limit: dailyLimit,
        }),
      },
      SUPABASE_RPC_TIMEOUT_MS,
    );

    if (!res.ok) return null;
    const rows = (await res.json()) as QuotaRow[];
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

function deriveUsageDateFromResetAt(resetAt: string): string | undefined {
  const resetMs = Date.parse(resetAt);
  if (!Number.isFinite(resetMs)) return undefined;
  return new Date(resetMs - 86_400_000).toISOString().slice(0, 10);
}

async function refundQuota(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  kind: "coach" | "classify",
  usageDate?: string,
): Promise<void> {
  try {
    const res = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/rpc/refund_ai_quota`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          p_user_id: userId,
          p_kind: kind,
          ...(usageDate ? { p_usage_date: usageDate } : {}),
        }),
      },
      SUPABASE_RPC_TIMEOUT_MS,
    );
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.warn("Failed to refund quota RPC:", res.status, errorText);
    }
  } catch (err) {
    console.error("Failed to refund quota:", err);
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 404 || status === 429 || status >= 500;
}

function extractTextAndThought(payload: unknown): {
  text: string;
  thought?: string;
  finishReason?: string;
} {
  if (!payload || typeof payload !== "object") return { text: "" };
  const candidates = (
    payload as {
      candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
    }
  ).candidates;
  const candidate = candidates?.[0];
  const parts = candidate?.content?.parts;
  const finishReason = candidate?.finishReason;
  if (!Array.isArray(parts)) return { text: "", finishReason };

  const textParts: string[] = [];
  const thoughtParts: string[] = [];

  for (const part of parts) {
    if (!part || typeof part.text !== "string") continue;
    if (part.thought === true) {
      thoughtParts.push(part.text.trim());
    } else {
      textParts.push(part.text);
    }
  }

  return {
    text: textParts.join("").trim(),
    thought: thoughtParts.length > 0 ? thoughtParts.join("\n") : undefined,
    finishReason,
  };
}

function computeAttemptTimeoutMs(
  deadlineMs: number,
  totalTimeoutMs: number,
  attemptIndex: number,
  remainingModels: number,
): number {
  const remainingBudgetMs = deadlineMs - Date.now();
  if (remainingBudgetMs <= 1000) return 0;
  if (remainingModels <= 1) return remainingBudgetMs;
  if (attemptIndex === 0) {
    return Math.min(remainingBudgetMs, Math.ceil(totalTimeoutMs * 0.55));
  }
  return Math.max(3000, Math.floor(remainingBudgetMs / remainingModels));
}

function buildGeminiRequestBody(options: {
  contents: GeminiContent[];
  systemInstruction?: string;
  responseJsonSchema: Record<string, unknown>;
  temperature: number;
  topP?: number;
}): Record<string, unknown> {
  const requestBody: Record<string, unknown> = {
    contents: options.contents,
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: options.responseJsonSchema,
      temperature: options.temperature,
      ...(options.topP !== undefined ? { topP: options.topP } : {}),
    },
  };

  if (options.systemInstruction) {
    requestBody.systemInstruction = {
      parts: [{ text: options.systemInstruction }],
    };
  }

  return requestBody;
}

class RetryableModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableModelError";
  }
}

async function callSingleGeminiModel(
  model: string,
  geminiApiKey: string,
  requestBody: Record<string, unknown>,
  attemptTimeoutMs: number,
): Promise<{ text: string; thought?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), attemptTimeoutMs);

  try {
    const res = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      const message = `Model ${model} returned ${res.status}: ${errText}`;
      if (isRetryableStatus(res.status)) {
        throw new RetryableModelError(message);
      }
      throw new Error(message);
    }

    const payload = await res.json();
    const { text, thought, finishReason } = extractTextAndThought(payload);
    if (!text) {
      throw new RetryableModelError(`Empty response from ${model}`);
    }
    if (finishReason && finishReason !== "STOP") {
      throw new RetryableModelError(`Model ${model} finished with ${finishReason}`);
    }

    const cleanJsonText = text
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
    try {
      JSON.parse(cleanJsonText);
    } catch {
      throw new RetryableModelError(`Model ${model} returned invalid JSON`);
    }

    return { text: cleanJsonText, thought };
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRetryableFailure(err: unknown): boolean {
  if (err instanceof RetryableModelError) return true;
  return (
    err instanceof Error &&
    (err.name === "AbortError" || err.name === "TimeoutError" || err.name === "TypeError")
  );
}

async function generateWithFallback(options: {
  geminiApiKey: string;
  models: readonly string[];
  contents: GeminiContent[];
  systemInstruction?: string;
  responseJsonSchema: Record<string, unknown>;
  temperature: number;
  topP?: number;
  timeoutMs: number;
}): Promise<{ text: string; thought?: string }> {
  const { geminiApiKey, models, timeoutMs } = options;
  const deadlineMs = Date.now() + timeoutMs;
  const requestBody = buildGeminiRequestBody(options);
  let lastError: unknown;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    if (!model) break;

    const attemptTimeoutMs = computeAttemptTimeoutMs(deadlineMs, timeoutMs, i, models.length - i);
    if (attemptTimeoutMs <= 0) break;

    try {
      return await callSingleGeminiModel(model, geminiApiKey, requestBody, attemptTimeoutMs);
    } catch (err) {
      lastError = err;
      const hasMoreModels = i + 1 < models.length;
      if (hasMoreModels && isRetryableFailure(err)) {
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error("All AI models failed");
}

function isStringListWithinBounds(
  value: unknown,
  minLen: number,
  maxLen: number,
): value is string[] {
  if (!Array.isArray(value) || value.length < minLen || value.length > maxLen) return false;
  return value.every(
    (item) => typeof item === "string" && item.trim().length > 0 && item.length <= 200,
  );
}

const MAX_PART_TEXT_LENGTH = 35_000;
const MAX_TOTAL_CONVERSATION_CHARS = 50_000;

function isValidMuscleGroupList(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return false;
  return value.every(
    (item) => typeof item === "string" && /^[a-zA-Z0-9_ -]{2,40}$/.test(item.trim()),
  );
}

function isValidGeminiContentItem(item: unknown): item is GeminiContent {
  if (!item || typeof item !== "object") return false;
  const record = item as Record<string, unknown>;
  if (record.role !== "user" && record.role !== "model") return false;
  if (!Array.isArray(record.parts) || record.parts.length === 0 || record.parts.length > 20) {
    return false;
  }
  return record.parts.every(
    (part) =>
      Boolean(part) &&
      typeof part === "object" &&
      typeof (part as { text?: unknown }).text === "string" &&
      (part as { text: string }).text.length <= MAX_PART_TEXT_LENGTH,
  );
}

function isTotalContentsLengthSafe(contents: GeminiContent[]): boolean {
  let total = 0;
  for (const content of contents) {
    for (const part of content.parts) {
      if (typeof part.text === "string") {
        total += part.text.length;
        if (total > MAX_TOTAL_CONVERSATION_CHARS) return false;
      }
    }
  }
  return true;
}

function isAiCoachRequestBody(value: unknown): value is AiCoachRequestBody {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (!isValidMuscleGroupList(record.muscleGroups)) return false;

  if (record.action === "coach") {
    return (
      (record.mode === "planning" || record.mode === "execution") &&
      Array.isArray(record.contents) &&
      record.contents.length > 0 &&
      record.contents.length <= 40 &&
      record.contents.every(isValidGeminiContentItem) &&
      isTotalContentsLengthSafe(record.contents)
    );
  }
  if (record.action === "classify") {
    return isStringListWithinBounds(record.exerciseNames, 0, 100);
  }
  return false;
}

function parsePositiveIntEnv(envName: string, fallback: number): number {
  const parsed = Number.parseInt(Deno.env.get(envName) ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatQuotaPayload(quota: QuotaRow) {
  return {
    currentCount: quota.current_count,
    dailyLimit: quota.daily_limit,
    resetAt: quota.reset_at,
  };
}

async function executeAction(
  body: AiCoachRequestBody,
  geminiApiKey: string,
  quota: QuotaRow,
): Promise<Response> {
  if (body.action === "coach") {
    // 55s for planning or first-message prompt (which includes extensive history & insights); 40s for follow-ups
    const isFirstMessage = body.contents.length <= 1;
    const timeoutMs = body.mode === "planning" || isFirstMessage ? 55_000 : 40_000;

    const result = await generateWithFallback({
      geminiApiKey,
      models: COACHING_MODELS,
      contents: body.contents,
      systemInstruction: buildSystemInstruction(body.mode),
      responseJsonSchema: createCoachingAdviceJsonSchema(
        body.muscleGroups,
        body.mode,
        Boolean(body.allowPlanUpdate),
      ),
      temperature: 0.4,
      topP: 0.85,
      timeoutMs,
    });

    return jsonResponse({
      text: result.text,
      thought: result.thought,
      quota: formatQuotaPayload(quota),
    });
  }

  const classifyPrompt = buildClassifyPrompt(body.exerciseNames, body.muscleGroups);
  const result = await generateWithFallback({
    geminiApiKey,
    models: CLASSIFICATION_MODELS,
    contents: [{ role: "user", parts: [{ text: classifyPrompt }] }],
    responseJsonSchema: createExerciseCleanupJsonSchema(body.muscleGroups),
    temperature: 0.1,
    timeoutMs: 30_000,
  });

  return jsonResponse({
    text: result.text,
    quota: formatQuotaPayload(quota),
  });
}

async function handleVerifiedCoachRequest(
  req: Request,
  verifiedUser: { userId: string },
  config: { geminiApiKey: string; supabaseUrl: string; serviceRoleKey: string },
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid-json" }, 400);
  }

  if (!isAiCoachRequestBody(body)) {
    return jsonResponse({ error: "invalid-request" }, 400);
  }

  if (body.action === "classify" && body.exerciseNames.length === 0) {
    return jsonResponse({
      text: JSON.stringify({ classifications: [] }),
    });
  }

  const dailyLimit =
    body.action === "coach"
      ? parsePositiveIntEnv("AI_DAILY_COACH_LIMIT", DEFAULT_DAILY_COACH_LIMIT)
      : parsePositiveIntEnv("AI_DAILY_CLASSIFY_LIMIT", DEFAULT_DAILY_CLASSIFY_LIMIT);

  const quota = await consumeQuota(
    config.supabaseUrl,
    config.serviceRoleKey,
    verifiedUser.userId,
    body.action,
    dailyLimit,
  );

  if (!quota) {
    return jsonResponse({ error: "quota-check-failed" }, 500);
  }

  if (!quota.allowed) {
    if (quota.global_capped) {
      console.warn(`Global daily AI quota ceiling reached for action: ${body.action}`);
    }
    return jsonResponse(
      {
        error: "rate-limit-exceeded",
        quota: formatQuotaPayload(quota),
      },
      429,
    );
  }

  const quotaUsageDate = deriveUsageDateFromResetAt(quota.reset_at);

  try {
    return await executeAction(body, config.geminiApiKey, quota);
  } catch (err) {
    console.error("AI execution failed in Edge Function:", err);
    await refundQuota(
      config.supabaseUrl,
      config.serviceRoleKey,
      verifiedUser.userId,
      body.action,
      quotaUsageDate,
    );
    return jsonResponse({ error: "coaching-request-failed" }, 502);
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method-not-allowed" }, 405);
  }

  const callerToken = extractBearerToken(req);
  if (!callerToken) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const clientId = (Deno.env.get("GOOGLE_CLIENT_ID") ?? "").trim() || DEFAULT_GOOGLE_CLIENT_ID;
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!geminiApiKey || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "missing-server-config" }, 500);
  }

  const verifiedUser = await verifyGoogleCaller(callerToken, clientId);
  if (!verifiedUser) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  return handleVerifiedCoachRequest(req, verifiedUser, {
    geminiApiKey,
    supabaseUrl,
    serviceRoleKey,
  });
});
