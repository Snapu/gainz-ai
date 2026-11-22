import { z } from "zod";

export type CoachingMode = "planning" | "execution";
export type WorkoutPhase = "planning" | "mid-workout" | "post-workout";
export type DeloadStatus = "active" | "completed" | "canceled" | "none";

export interface SuggestedFollowUp {
  label: string;
  prompt: string;
}

export interface PlannedExercise {
  exerciseName: string;
  targetSets: number;
  targetReps?: string;
  targetDurationSeconds?: number;
  targetDistanceMeters?: number;
  targetWeight?: string;
  targetRpe?: number;
  restSeconds?: number;
  isMetabolicProtocol?: boolean;
  notes?: string;
  supersetId?: string;
  primaryMuscle?: string;
  secondaryMuscles?: Array<{ muscleGroup: string; contribution?: number }>;
}

export interface PlannedSession {
  dayOfWeek: number;
  weekNumber: number;
  sessionLabel: string;
  focusDescription: string;
  exercises: PlannedExercise[];
}

export interface CoachingAdvice {
  scratchpad?: string;
  coachMessage: string;
  startDeload?: boolean;
  suggestedFollowUps?: SuggestedFollowUp[];
  recommendedWorkout?: PlannedExercise[];
  trainingPlan?: {
    cycleWeeks: number;
    sessions: PlannedSession[];
  };
}

export interface ExerciseCleanupResult {
  classifications: Array<{
    exerciseName: string;
    primaryMuscle: string;
    secondaryMuscles?: Array<{ muscleGroup: string; contribution?: number }>;
    confidence: number;
  }>;
}

const muscleGroupItemSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_ -]{2,40}$/);

const fitnessGoalSchema = z.enum([
  "build_muscle",
  "lose_fat",
  "improve_endurance",
  "increase_mobility",
  "general_fitness",
]);

function hasForbiddenEquipmentChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (value[i] === "," || code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

const equipmentOptionSchema = z
  .string()
  .trim()
  .min(2)
  .max(50)
  .refine((val) => !hasForbiddenEquipmentChars(val), "Invalid equipment characters");

const loadWindowSeriesSchema = z.object({
  weekMinus3: z.number().finite(),
  weekMinus2: z.number().finite(),
  weekMinus1: z.number().finite(),
  current: z.number().finite(),
  prior3WeekAvg: z.number().finite(),
  ratioVsPriorAvg: z.number().finite().nullable(),
});

const muscleGroupInsightDtoSchema = z.object({
  sets: z.number().finite(),
  directSets: z.number().finite(),
  landmark: z.enum(["detraining", "below_MEV", "at_MEV", "at_MAV", "approaching_MRV", "above_MRV"]),
  frequencyPerWeek: z.number().finite(),
  hoursSinceLastTrained: z.number().finite().nullable(),
  recoveryReady: z.boolean(),
  trendStatus: z.enum(["improving", "plateau", "dropping", "stable"]).optional(),
});

const exerciseE1rmDtoSchema = z.object({
  e1rm: z.number().finite(),
  trend: z.array(z.number().finite()).max(20),
  trendDates: z.array(z.string().max(40)).max(20),
  plateau: z.boolean(),
  bestRPE: z.number().finite().optional(),
  rpeOverloadReady: z.boolean(),
  targetWeightHyp: z.object({ low: z.number().finite(), high: z.number().finite() }).nullable(),
  targetWeightStr: z.object({ low: z.number().finite(), high: z.number().finite() }).nullable(),
  swapRecommended: z.boolean(),
  primaryMuscle: z.string().max(40).optional(),
  progressionIncrementKg: z.number().finite().min(0).max(50),
});

const plannedExerciseDtoSchema = z.object({
  exerciseName: z.string().trim().min(1).max(120),
  targetSets: z.number().int().min(1).max(20),
  targetReps: z.string().max(40).optional(),
  targetDurationSeconds: z.number().int().min(1).max(14400).optional(),
  targetDistanceMeters: z.number().int().min(1).max(100000).optional(),
  targetWeight: z.string().max(40).optional(),
  targetRpe: z.number().min(1).max(10).optional(),
  restSeconds: z.number().int().min(0).max(600).optional(),
  notes: z.string().max(300).optional(),
  supersetId: z.string().max(20).optional(),
  isMetabolicProtocol: z.boolean().optional(),
  primaryMuscle: z.string().max(40).optional(),
});

const plannedSessionDtoSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  weekNumber: z.number().int().min(1).max(4),
  sessionLabel: z.string().max(120),
  focusDescription: z.string().max(200),
  exercises: z.array(plannedExerciseDtoSchema).max(30),
});

const trainingSummaryExerciseDtoSchema = z.object({
  exerciseName: z.string().trim().min(1).max(120),
  sets: z.number().int().min(0).max(10000),
  totalReps: z.number().finite().optional(),
  maxWeight: z.number().finite().optional(),
  totalVolume: z.number().finite().optional(),
});

const monthlyTrainingSummaryDtoSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  workoutDays: z.number().int().min(0).max(31),
  exercises: z.array(trainingSummaryExerciseDtoSchema).max(20),
});

const uuidV4Schema = z.uuid({ version: "v4" });

export const coachActionRequestDtoSchema = z.object({
  action: z.literal("coach"),
  clientRequestId: uuidV4Schema.optional(),
  mode: z.enum(["planning", "execution"]),
  muscleGroups: z.array(muscleGroupItemSchema).min(1).max(50),
  locale: z.string().trim().min(1).max(32),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nowIso: z.string().min(1).max(40),
  workoutPhase: z.enum(["planning", "mid-workout", "post-workout"]),
  workoutStatus: z.string().trim().min(1).max(40),
  sessionStartBoundaryMs: z.number().finite().nonnegative(),
  question: z.string().max(2000).optional(),
  userProfile: z.object({
    age: z.number().finite().min(0).max(120).optional(),
    heightCm: z.number().finite().min(50).max(300).optional(),
    weightKg: z.number().finite().min(20).max(400).optional(),
    fitnessGoal: z.array(fitnessGoalSchema).max(10).optional(),
    fitnessLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
    workoutDaysPerWeek: z.number().finite().min(1).max(7).optional(),
    workoutDurationMinutes: z.number().finite().min(5).max(300).optional(),
    workoutLocation: z.enum(["gym", "home", "both"]).optional(),
    equipmentAccess: z.array(equipmentOptionSchema).max(30).optional(),
    freeUserInput: z.string().max(2000).optional(),
  }),
  insights: z.object({
    acwr: z.number().finite().nullable(),
    deloadStatus: z.enum(["active", "completed", "canceled", "none"]),
    deloadEndsAt: z.string().max(40).nullable(),
    deloadTimeRemainingMs: z.number().finite().nullable(),
    deloadTriggerSnapshot: z
      .object({
        triggeredBy: z.array(z.string().max(60)).max(20),
        riskScore: z.number().finite(),
      })
      .nullable(),
    fatigue: z.object({
      shouldDeload: z.boolean(),
      reason: z.string().max(200).optional(),
      hasSufficientHistory: z.boolean(),
      decliningExercises: z.number().int().min(0).max(500),
      riskScore: z.number().finite().min(0).max(100),
      loadWindow: z.object({
        sets: loadWindowSeriesSchema,
        tonnage: loadWindowSeriesSchema,
      }),
    }),
    muscleGroups: z
      .record(z.string().max(40), muscleGroupInsightDtoSchema)
      .refine((obj) => Object.keys(obj).length <= 25, "Too many muscle groups"),
    e1rm: z
      .record(z.string().max(120), exerciseE1rmDtoSchema)
      .refine((obj) => Object.keys(obj).length <= 200, "Too many e1rm entries"),
  }),
  recentLogs: z
    .array(
      z.object({
        exerciseName: z.string().trim().min(1).max(120),
        reps: z.number().finite().optional(),
        weight: z.number().finite().optional(),
        distance: z.number().finite().optional(),
        duration: z.number().finite().optional(),
        rpe: z.number().finite().optional(),
        loggedAt: z.string().max(40),
        localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .max(500),
  trainingSummaries: z.array(monthlyTrainingSummaryDtoSchema).max(12),
  previousMessages: z
    .array(
      z.object({
        role: z.enum(["user", "coach"]),
        content: z.string().max(8000),
        timestamp: z.string().max(40),
      }),
    )
    .max(40),
  events: z
    .array(
      z.object({
        type: z.string().max(60),
        dates: z.array(z.string().max(20)).max(60),
      }),
    )
    .max(50)
    .optional(),
  activePlan: z
    .object({
      createdAt: z.string().max(40),
      cycleWeeks: z.number().int().min(1).max(4),
      currentWeekNumber: z.number().int().min(1).max(4),
      nextUncompletedSessionKey: z.string().max(20).optional(),
      sessions: z.array(plannedSessionDtoSchema).max(28),
    })
    .nullable()
    .optional(),
  completedSessionKeys: z.array(z.string().max(20)).max(28).optional(),
});

export const classifyActionRequestDtoSchema = z.object({
  action: z.literal("classify"),
  exerciseNames: z.array(z.string().trim().min(1).max(120)).min(0).max(100),
  muscleGroups: z.array(muscleGroupItemSchema).min(1).max(50),
});

export const recoverActionRequestDtoSchema = z.object({
  action: z.literal("recover"),
  clientRequestId: uuidV4Schema,
});

export const aiCoachRequestDtoSchema = z.discriminatedUnion("action", [
  coachActionRequestDtoSchema,
  classifyActionRequestDtoSchema,
  recoverActionRequestDtoSchema,
]);

export type CoachActionRequestDto = z.infer<typeof coachActionRequestDtoSchema>;
export type ClassifyActionRequestDto = z.infer<typeof classifyActionRequestDtoSchema>;
export type RecoverActionRequestDto = z.infer<typeof recoverActionRequestDtoSchema>;
export type AiCoachRequestDto = z.infer<typeof aiCoachRequestDtoSchema>;

export function sanitizeSuggestedFollowUps(items: unknown): SuggestedFollowUp[] | undefined {
  if (!Array.isArray(items)) return undefined;

  const seenPrompts = new Set<string>();
  const seenLabels = new Set<string>();
  const sanitized: SuggestedFollowUp[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const sf = item as { label?: unknown; prompt?: unknown };
    if (typeof sf.label !== "string" || typeof sf.prompt !== "string") continue;

    const label = sf.label.trim();
    const prompt = sf.prompt.trim();
    const promptKey = prompt.toLowerCase();
    const labelKey = label.toLowerCase();

    if (!label || !prompt || seenPrompts.has(promptKey) || seenLabels.has(labelKey)) continue;

    seenPrompts.add(promptKey);
    seenLabels.add(labelKey);
    sanitized.push({ label, prompt });

    if (sanitized.length >= 4) break;
  }

  return sanitized.length > 0 ? sanitized : undefined;
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
    targetSets: { type: "integer", description: "Number of sets (1–20)." },
    targetReps: {
      type: "string",
      description:
        "Used for counting movements (e.g. '8-12', 'failure'). Do NOT use if duration or distance is provided.",
    },
    targetDurationSeconds: {
      type: "integer",
      description:
        "Used ONLY for time-based exercises like planks or isometric holds (1–14400s, e.g. 30, 60). Do NOT use targetReps if this is used.",
    },
    targetDistanceMeters: {
      type: "integer",
      description:
        "Used ONLY for distance-based cardio like running or rowing (1–100000m, e.g. 500, 1000). Do NOT use targetReps if this is used.",
    },
    targetWeight: {
      type: "string",
      description:
        "Exact numeric weight only (e.g. '60kg', 'Bodyweight'). For dumbbell exercises, ALWAYS output the TOTAL combined weight (e.g., for two 20kg dumbbells, output '40kg'). Keep it extremely concise.",
    },
    targetRpe: {
      type: "number",
      description:
        "Target RPE (Rate of Perceived Exertion) from 6.0 to 10.0 (e.g. 8.5). Prescribe for all lifting/resistance exercises (8.0-9.0 for hypertrophy, 8.5-9.5 for strength, 6.0-6.5 for deload).",
    },
    restSeconds: {
      type: "integer",
      description:
        "Recommended rest between sets in seconds (0–600). 180–300 for strength (1–5 reps), 120–180 for hypertrophy (6–12 reps), 45–90 for fat loss/endurance (12–20 reps), 15–30 for endurance/circuit (20–25 reps).",
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
    isMetabolicProtocol: {
      type: "boolean",
      description:
        "Set to true for drop-sets, myo-reps, or rest-pause sets to bypass strict rest periods.",
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

export function createCoachingAdviceJsonSchema(
  muscleGroupsList: string[],
  mode: CoachingMode = "execution",
  allowPlanUpdate = false,
): Record<string, unknown> {
  const exerciseProps = buildExerciseProperties(muscleGroupsList);

  const recommendedExerciseSchema = {
    type: "object",
    properties: exerciseProps,
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
        description: "Duration of the mesocycle in weeks (1–4, typically 2).",
      },
      sessions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            dayOfWeek: {
              type: "integer",
              description: "0=Sun, 1=Mon...6=Sat",
            },
            weekNumber: {
              type: "integer",
              description: "Week number (1–4, typically 1 or 2).",
            },
            sessionLabel: {
              type: "string",
              description: "e.g., 'Unit A — Push Focus'",
            },
            focusDescription: { type: "string" },
            exercises: {
              type: "array",
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
    coachMessage: {
      type: "string",
      description:
        "The empathetic, motivating, and analytical message from the coach. Max 2-3 short paragraphs.",
    },
    // Placed intentionally AFTER coachMessage so the athlete-facing rationale stays concise (2-3 lines) without leaking planning bloat ahead of the answer.
    scratchpad: {
      type: "string",
      description:
        "Brief 2-3 line rationale summarizing the key training adjustments and data signals for the athlete.",
    },
    startDeload: {
      type: "boolean",
      description:
        "Set to true ONLY when fatigue.shouldDeload is true. This signals the app to automatically begin a 7-day deload phase. Do NOT set true during an already-active deload (deloadStatus='active'). Omit or set false otherwise.",
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
        "Include ONLY if the user explicitly asks to create, change, or rebuild their multi-week training plan. When changing an existing plan, output the COMPLETE updated plan with ALL sessions (unchanged sessions included) — never only the modified sessions.",
    };
  }

  const propertyOrdering = [
    "coachMessage",
    "scratchpad",
    "startDeload",
    "suggestedFollowUps",
    "recommendedWorkout",
    "trainingPlan",
  ].filter((key) => key in properties);

  return {
    type: "object",
    properties,
    propertyOrdering,
    required,
  };
}

const SIMPLE_JSON_ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

const HEX_4_REGEX = /^[0-9a-fA-F]{4}$/;

function skipWhitespace(input: string, index: number): number {
  let i = index;
  while (i < input.length && /\s/.test(input.charAt(i))) {
    i++;
  }
  return i;
}

function decodeUnicodeEscape(
  input: string,
  index: number,
): { char: string; nextIndex: number; incomplete: boolean } {
  if (index + 6 > input.length) {
    return { char: "", nextIndex: index, incomplete: true };
  }
  const hex = input.slice(index + 2, index + 6);
  if (!HEX_4_REGEX.test(hex)) {
    return { char: "u", nextIndex: index + 2, incomplete: false };
  }
  const code = Number.parseInt(hex, 16);
  const isHighSurrogate = code >= 0xd800 && code <= 0xdbff;
  if (!isHighSurrogate) {
    return { char: String.fromCharCode(code), nextIndex: index + 6, incomplete: false };
  }
  if (index + 6 === input.length) {
    return { char: "", nextIndex: index, incomplete: true };
  }
  if (input.charAt(index + 6) === "\\") {
    if (index + 12 > input.length) {
      return { char: "", nextIndex: index, incomplete: true };
    }
    const lowHex = input.slice(index + 8, index + 12);
    if (input.charAt(index + 7) === "u" && HEX_4_REGEX.test(lowHex)) {
      const low = Number.parseInt(lowHex, 16);
      if (low >= 0xdc00 && low <= 0xdfff) {
        return { char: String.fromCharCode(code, low), nextIndex: index + 12, incomplete: false };
      }
    }
  }
  return { char: String.fromCharCode(code), nextIndex: index + 6, incomplete: false };
}

function decodePartialJsonString(
  input: string,
  startAfterQuote: number,
): { value: string; nextIndex: number; closed: boolean } {
  let value = "";
  let i = startAfterQuote;

  while (i < input.length) {
    const ch = input.charAt(i);
    if (ch === '"') {
      return { value, nextIndex: i + 1, closed: true };
    }
    if (ch !== "\\") {
      value += ch;
      i++;
      continue;
    }

    if (i + 1 >= input.length) break;
    const esc = input.charAt(i + 1);
    const mapped = SIMPLE_JSON_ESCAPES[esc];
    if (mapped !== undefined) {
      value += mapped;
      i += 2;
      continue;
    }

    if (esc === "u") {
      const unicode = decodeUnicodeEscape(input, i);
      if (unicode.incomplete) break;
      value += unicode.char;
      i = unicode.nextIndex;
      continue;
    }

    value += esc;
    i += 2;
  }

  return { value, nextIndex: i, closed: false };
}

function skipJsonString(input: string, startAfterQuote: number): number {
  let i = startAfterQuote;
  while (i < input.length) {
    const ch = input.charAt(i);
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === '"') return i + 1;
    i++;
  }
  return -1;
}

function skipJsonComposite(input: string, index: number): number {
  let depth = 0;
  let i = index;

  while (i < input.length) {
    const ch = input.charAt(i);
    if (ch === '"') {
      const next = skipJsonString(input, i + 1);
      if (next === -1) return -1;
      i = next;
      continue;
    }
    if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return -1;
}

function skipJsonValue(input: string, index: number): number {
  const first = input.charAt(index);
  if (!first) return -1;

  if (first === '"') return skipJsonString(input, index + 1);
  if (first === "{" || first === "[") return skipJsonComposite(input, index);

  let i = index;
  while (i < input.length && !/[\s,}\]]/.test(input.charAt(i))) {
    i++;
  }
  return i < input.length ? i : -1;
}

function findObjectStart(input: string): number {
  let i = skipWhitespace(input, 0);
  if (input.startsWith("```", i)) {
    const newline = input.indexOf("\n", i);
    if (newline === -1) return -1;
    i = skipWhitespace(input, newline + 1);
  }
  return input.charAt(i) === "{" ? i + 1 : -1;
}

function readObjectKeyAndValueStart(
  input: string,
  index: number,
): { key: string; valueIndex: number } | null {
  let i = skipWhitespace(input, index);
  if (input.charAt(i) === ",") {
    i = skipWhitespace(input, i + 1);
  }
  if (input.charAt(i) !== '"') return null;

  const key = decodePartialJsonString(input, i + 1);
  if (!key.closed) return null;

  i = skipWhitespace(input, key.nextIndex);
  if (input.charAt(i) !== ":") return null;

  const valueIndex = skipWhitespace(input, i + 1);
  return valueIndex < input.length ? { key: key.value, valueIndex } : null;
}

/**
 * Incrementally extracts and unescapes the `coachMessage` string value from a
 * partial JSON object buffer, holding back incomplete trailing escapes.
 */
export function extractCoachMessageSoFar(accumulatedJson: string): string | null {
  if (!accumulatedJson) return null;
  let i = findObjectStart(accumulatedJson);
  if (i === -1) return null;

  while (i < accumulatedJson.length) {
    const member = readObjectKeyAndValueStart(accumulatedJson, i);
    if (!member) return null;

    if (member.key === "coachMessage") {
      return accumulatedJson.charAt(member.valueIndex) === '"'
        ? decodePartialJsonString(accumulatedJson, member.valueIndex + 1).value
        : null;
    }

    const nextAfterValue = skipJsonValue(accumulatedJson, member.valueIndex);
    if (nextAfterValue === -1) return null;
    i = nextAfterValue;
  }

  return null;
}

export function createExerciseCleanupJsonSchema(
  muscleGroupsList: string[],
): Record<string, unknown> {
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

const roundedInt = z.number().transform((n) => Math.round(n));
const validationIntSchemas = {
  sets: roundedInt.pipe(z.number().min(1).max(20)),
  duration: roundedInt.pipe(z.number().min(1).max(14400)),
  distance: roundedInt.pipe(z.number().min(1).max(100000)),
  rest: roundedInt.pipe(z.number().min(0).max(600)),
  dayOfWeek: roundedInt.transform((n) => (n === 7 ? 0 : n)).pipe(z.number().min(0).max(6)),
  weekNumber: roundedInt.pipe(z.number().min(1).max(4)),
  cycleWeeks: roundedInt.pipe(z.number().min(1).max(4)),
};

function buildExerciseFields() {
  const secondaryMuscleSchema = z.object({
    muscleGroup: z.string(),
    contribution: z.number().optional(),
  });

  return {
    exerciseName: z.string().trim().min(1),
    targetSets: validationIntSchemas.sets,
    targetReps: z.string().optional(),
    targetDurationSeconds: validationIntSchemas.duration.optional(),
    targetDistanceMeters: validationIntSchemas.distance.optional(),
    targetWeight: z.string().optional(),
    targetRpe: z.number().min(1).max(10).optional(),
    restSeconds: validationIntSchemas.rest.optional(),
    notes: z.string().optional(),
    supersetId: z.string().optional(),
    isMetabolicProtocol: z.boolean().optional(),
    primaryMuscle: z.string().optional(),
    secondaryMuscles: z.array(secondaryMuscleSchema).optional(),
  };
}

function buildTrainingPlanSchema() {
  const plannedExerciseSchema = z.object(buildExerciseFields());

  const plannedSessionSchema = z.object({
    dayOfWeek: validationIntSchemas.dayOfWeek,
    weekNumber: validationIntSchemas.weekNumber,
    sessionLabel: z.string().trim().min(1),
    focusDescription: z.string().trim().min(1),
    exercises: z.array(plannedExerciseSchema).min(1).max(30),
  });

  return z.object({
    cycleWeeks: validationIntSchemas.cycleWeeks,
    sessions: z.array(plannedSessionSchema).min(1).max(28),
  });
}

const coachingAdviceValidationSchema = z.object({
  scratchpad: z.string().optional(),
  coachMessage: z.string().trim().min(1),
  startDeload: z.boolean().optional(),
  suggestedFollowUps: z.unknown().optional().transform(sanitizeSuggestedFollowUps),
  recommendedWorkout: z.array(z.object(buildExerciseFields())).max(30).optional(),
  trainingPlan: buildTrainingPlanSchema().optional(),
});

export function parseCoachingAdviceResponse(
  parsedJson: unknown,
  mode: CoachingMode = "execution",
): CoachingAdvice {
  const validated = coachingAdviceValidationSchema.parse(parsedJson) as CoachingAdvice;
  if (
    mode === "planning" &&
    (!validated.trainingPlan || validated.trainingPlan.sessions.length === 0)
  ) {
    throw new Error("Missing required trainingPlan in planning mode");
  }
  return validated;
}

const exerciseCleanupValidationSchema = z.object({
  classifications: z.array(
    z.object({
      exerciseName: z.string(),
      primaryMuscle: z.string(),
      secondaryMuscles: z
        .array(
          z.object({
            muscleGroup: z.string(),
            contribution: z.number().optional(),
          }),
        )
        .optional(),
      confidence: z.number(),
    }),
  ),
});

export function parseClassifyResponse(parsedJson: unknown): ExerciseCleanupResult {
  return exerciseCleanupValidationSchema.parse(parsedJson) as ExerciseCleanupResult;
}
